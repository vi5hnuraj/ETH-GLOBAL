package peers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Verifier authenticates inbound peer requests. It is fail-closed: any missing
// or invalid header, unknown node, mismatched token, expired timestamp,
// duplicate nonce, bad signature, or body-hash mismatch is a hard rejection.
type Verifier struct {
	allowed   map[string]string        // nodeID -> bearer token
	nodeSecret map[string][]byte        // nodeID -> its HMAC secret
	guard     *ReplayGuard
	limiter   *RateLimiter
	clock     func() time.Time
}

// VerifierOption configures a Verifier.
type VerifierOption func(*Verifier)

// WithNodeSecrets supplies per-node HMAC secrets so signatures can be verified
// against the correct key for the claimed sender.
func WithNodeSecrets(m map[string][]byte) VerifierOption {
	return func(v *Verifier) { v.nodeSecret = m }
}

// WithClock replaces the clock (tests).
func WithClock(f func() time.Time) VerifierOption {
	return func(v *Verifier) { v.clock = f }
}

// NewVerifier builds a verifier that accepts the given node->token map and
// replay window.
func NewVerifier(allowed map[string]string, window time.Duration, perMinPerNode int, opts ...VerifierOption) *Verifier {
	v := &Verifier{
		allowed: allowed,
		guard:   NewReplayGuard(window),
		limiter: NewRateLimiter(perMinPerNode),
		clock:   time.Now,
	}
	for _, o := range opts {
		o(v)
	}
	return v
}

// Verify authenticates a peer request. body must be the exact request body (may
// be nil for GET). It returns the authenticated sender node id.
func (v *Verifier) Verify(r *http.Request, body []byte) (string, error) {
	node := r.Header.Get(HNode)
	if node == "" {
		return "", errors.New("peer auth: missing X-MPC-Node")
	}
	if _, ok := v.allowed[node]; !ok {
		return "", fmt.Errorf("peer auth: node %q is not an allowed peer", node)
	}
	auth := r.Header.Get(HAuth)
	if !strings.HasPrefix(auth, HAuthPref) {
		return "", errors.New("peer auth: missing bearer credential")
	}
	if !hmac.Equal([]byte(v.allowed[node]), []byte(strings.TrimPrefix(auth, HAuthPref))) {
		return "", errors.New("peer auth: invalid bearer credential for claimed node")
	}

	tsRaw := r.Header.Get(HTS)
	if tsRaw == "" {
		return "", errors.New("peer auth: missing timestamp")
	}
	ts, err := strconv.ParseInt(tsRaw, 10, 64)
	if err != nil {
		return "", errors.New("peer auth: malformed timestamp")
	}
	skew := v.clock().UnixMilli() - ts
	windowMs := int64(v.guard.window.Milliseconds())
	if skew > windowMs || skew < -windowMs {
		return "", errors.New("peer auth: request is outside the allowed time skew")
	}

	nonce := r.Header.Get(HNonce)
	if nonce == "" {
		return "", errors.New("peer auth: missing nonce")
	}
	if err := v.guard.Check(ts, nonce); err != nil {
		return "", fmt.Errorf("peer auth: %w", err)
	}

	if !v.limiter.Allow(node, r.URL.Path) {
		return "", errors.New("peer auth: rate limit exceeded")
	}

	storedHash := r.Header.Get(HBodySHA)
	if SHA256Hex(body) != storedHash {
		return "", errors.New("peer auth: body hash mismatch")
	}

	secret, ok := v.nodeSecret[node]
	if !ok {
		return "", fmt.Errorf("peer auth: no signature secret for node %q", node)
	}
	expected := hex.EncodeToString(func() []byte {
		mac := hmac.New(sha256.New, secret)
		mac.Write([]byte(CanonicalString(r.Method, r.URL.Path, storedHash, tsRaw, nonce)))
		return mac.Sum(nil)
	}())
	got := r.Header.Get(HSig)
	if got == "" || !hmac.Equal([]byte(expected), []byte(got)) {
		return "", errors.New("peer auth: signature mismatch")
	}

	return node, nil
}