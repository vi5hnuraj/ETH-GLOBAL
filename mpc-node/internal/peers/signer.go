// Package peers implements authenticated, replay-protected, rate-limited
// node-to-node communication using a detached HMAC signature over a canonical
// request string plus a per-node bearer token. In development the transport is
// plain HTTP labelled DEV; production replaces the transport with mTLS but the
// application-layer contract (skew, nonce, hash, signature, round checks)
// stays identical.
package peers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"
)

// Header names carried on every authenticated peer request.
const (
	HNode     = "X-MPC-Node"
	HTS       = "X-MPC-TS"        // unix milliseconds
	HNonce    = "X-MPC-Nonce"     // unique 32-hex per request
	HBodySHA  = "X-MPC-Body-Sha"  // lowercase hex SHA-256 of the body (empty string hash for empty body)
	HSig      = "X-MPC-Sig"       // lowercase hex HMAC-SHA256 of the canonical string
	HAuth     = "Authorization"
	HAuthPref = "Bearer "
)

// CanonicalString builds the exact byte string over which the signature is
// computed. Any HTTP metadata change therefore invalidates the signature.
func CanonicalString(method, path, bodySHA256, ts, nonce string) string {
	return method + "\n" + path + "\n" + bodySHA256 + "\n" + ts + "\n" + nonce
}

// SHA256Hex returns the lowercase hex SHA-256 of b.
func SHA256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Signer stamps an outbound request with node identity, timestamp, nonce and a
// detached HMAC-SHA256 signature using this node's secret.
type Signer struct {
	nodeID     string
	token      string
	secret     []byte // HMAC key, distinct per node
	clock      func() time.Time
}

// NewSigner returns a Signer for the named node. secret should be 32+ random
// bytes; the token is presented to peers for identity.
func NewSigner(nodeID, token string, secret []byte) *Signer {
	return &Signer{nodeID: nodeID, token: token, secret: secret, clock: time.Now}
}

// Sign applies all authentication headers to r (which must already carry the
// JSON body it will send) and returns them for direct use.
func (s *Signer) Sign(method, path string, body []byte) http.Header {
	ts := strconv.FormatInt(s.clock().UnixMilli(), 10)
	nonce := randomHex(32)
	bodySHA := SHA256Hex(body)
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(CanonicalString(method, path, bodySHA, ts, nonce)))
	sig := hex.EncodeToString(mac.Sum(nil))

	h := http.Header{}
	h.Set(HNode, s.nodeID)
	h.Set(HTS, ts)
	h.Set(HNonce, nonce)
	h.Set(HBodySHA, bodySHA)
	h.Set(HSig, sig)
	h.Set(HAuth, HAuthPref+s.token)
	h.Set("Content-Type", "application/json")
	return h
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic("peers: crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}

// helper used by tests to inject time.
func (s *Signer) setClock(f func() time.Time) { s.clock = f }