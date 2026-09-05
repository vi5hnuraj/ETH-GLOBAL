package mtls_test

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/globalpay/mpc-node/internal/mtls"
	"github.com/globalpay/mpc-node/internal/peers"
)

func generateCA(t *testing.T) (caPEM []byte, caKey *ecdsa.PrivateKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "GlobalPay MPC Test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), key
}

func issueLeaf(t *testing.T, caPEM []byte, caKey *ecdsa.PrivateKey, cn string, dns []string, ips []net.IP) (certPEM, keyPEM []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode(caPEM)
	if block == nil {
		t.Fatal("cannot decode CA pem")
	}
	caCert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		DNSNames:     dns,
		IPAddresses:  ips,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, caCert, &key.PublicKey, caKey)
	if err != nil {
		t.Fatal(err)
	}
	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	return certPEM, keyPEM
}

func writeFiles(t *testing.T, ca, cert, key []byte) (caFile, certFile, keyFile string) {
	t.Helper()
	dir := t.TempDir()
	caFile = filepath.Join(dir, "ca.pem")
	certFile = filepath.Join(dir, "node.pem")
	keyFile = filepath.Join(dir, "node.key")
	if err := os.WriteFile(caFile, ca, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(certFile, cert, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyFile, key, 0o600); err != nil {
		t.Fatal(err)
	}
	return caFile, certFile, keyFile
}

func startMTLSServer(t *testing.T, serverTLS *tls.Config) *httptest.Server {
	t.Helper()
	ts := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	ts.TLS = serverTLS
	ts.StartTLS()
	t.Cleanup(ts.Close)
	return ts
}

func TestFailClosedOnMissingFiles(t *testing.T) {
	if _, err := mtls.ServerTLS("", "", ""); err == nil {
		t.Fatal("expected ServerTLS to fail closed on missing files")
	}
	if _, err := mtls.ClientTLS("", "", ""); err == nil {
		t.Fatal("expected ClientTLS to fail closed on missing files")
	}
	if _, err := mtls.ServerTLS("/missing/ca.pem", "/missing/cert.pem", "/missing/key.pem"); err == nil {
		t.Fatal("expected ServerTLS to fail closed on unreadable files")
	}
}

func TestMutualTLSRequiresClientCertificate(t *testing.T) {
	caPEM, caKey := generateCA(t)
	aCert, aKey := issueLeaf(t, caPEM, caKey, "node-a", []string{"localhost"}, []net.IP{net.ParseIP("127.0.0.1")})
	bCert, bKey := issueLeaf(t, caPEM, caKey, "node-b", nil, nil)
	caF, aCertF, aKeyF := writeFiles(t, caPEM, aCert, aKey)
	_, bCertF, bKeyF := writeFiles(t, caPEM, bCert, bKey)

	serverTLS, err := mtls.ServerTLS(caF, aCertF, aKeyF)
	if err != nil {
		t.Fatal(err)
	}
	ts := startMTLSServer(t, serverTLS)

	// A properly authenticated peer (node-b cert signed by the CA) succeeds.
	clientTLS, err := mtls.ClientTLS(caF, bCertF, bKeyF)
	if err != nil {
		t.Fatal(err)
	}
	okClient := &http.Client{Transport: &http.Transport{TLSClientConfig: clientTLS}}
	resp, err := okClient.Get(ts.URL)
	if err != nil {
		t.Fatalf("authenticated peer should pass: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// A client WITHOUT a certificate is rejected (RequireAndVerifyClientCert).
	pool, err := mtls.LoadCertificatePool(caF)
	if err != nil {
		t.Fatal(err)
	}
	noCertClient := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}}}
	if _, err := noCertClient.Get(ts.URL); err == nil {
		t.Fatal("expected handshake to fail without a client certificate")
	}
}

func TestRejectsCertificateFromForeignCA(t *testing.T) {
	caPEM, caKey := generateCA(t)
	aCert, aKey := issueLeaf(t, caPEM, caKey, "node-a", []string{"localhost"}, []net.IP{net.ParseIP("127.0.0.1")})
	caF, aCertF, aKeyF := writeFiles(t, caPEM, aCert, aKey)

	serverTLS, err := mtls.ServerTLS(caF, aCertF, aKeyF)
	if err != nil {
		t.Fatal(err)
	}
	ts := startMTLSServer(t, serverTLS)

	// Client signed by a DIFFERENT CA must be rejected by the server's CA pool.
	ca2PEM, ca2Key := generateCA(t)
	rogueCert, rogueKey := issueLeaf(t, ca2PEM, ca2Key, "rogue", nil, nil)
	ca2F, rogueCertF, rogueKeyF := writeFiles(t, ca2PEM, rogueCert, rogueKey)
	rogueTLS, err := mtls.ClientTLS(ca2F, rogueCertF, rogueKeyF)
	if err != nil {
		t.Fatal(err)
	}
	rogueClient := &http.Client{Transport: &http.Transport{TLSClientConfig: rogueTLS}}
	if _, err := rogueClient.Get(ts.URL); err == nil {
		t.Fatal("expected handshake to fail with a foreign-CA client certificate")
	}
}

func TestRingClientOverMutualTLS(t *testing.T) {
	caPEM, caKey := generateCA(t)
	aCert, aKey := issueLeaf(t, caPEM, caKey, "node-a", []string{"localhost"}, []net.IP{net.ParseIP("127.0.0.1")})
	bCert, bKey := issueLeaf(t, caPEM, caKey, "node-b", nil, nil)
	caF, aCertF, aKeyF := writeFiles(t, caPEM, aCert, aKey)
	_, bCertF, bKeyF := writeFiles(t, caPEM, bCert, bKey)

	serverTLS, err := mtls.ServerTLS(caF, aCertF, aKeyF)
	if err != nil {
		t.Fatal(err)
	}
	ts := startMTLSServer(t, serverTLS)

	clientTLS, err := mtls.ClientTLS(caF, bCertF, bKeyF)
	if err != nil {
		t.Fatal(err)
	}
	secret := bytes.Repeat([]byte{1}, 32)
	signer := peers.NewSigner("node-b", "token-b", secret)
	ring := peers.NewRingClient(map[string]string{"node-b": ts.URL}, signer, time.Second, clientTLS)

	if err := ring.PostJSON(context.Background(), "node-b", "/api/v1/peer/hello", map[string]string{}, nil); err != nil {
		t.Fatalf("RingClient over mTLS should succeed: %v", err)
	}

	// A plain-HTTP client (no TLS config) must not be able to talk to the mTLS node.
	plainRing := peers.NewRingClient(map[string]string{"node-b": ts.URL}, signer, time.Second)
	if err := plainRing.PostJSON(context.Background(), "node-b", "/api/v1/peer/hello", map[string]string{}, nil); err == nil {
		t.Fatal("expected plain-HTTP client to fail against mTLS server")
	}
}

func TestRingClientFailClosedOnHTTPPeer(t *testing.T) {
	caPEM, caKey := generateCA(t)
	bCert, bKey := issueLeaf(t, caPEM, caKey, "node-b", nil, nil)
	caF, bCertF, bKeyF := writeFiles(t, caPEM, bCert, bKey)
	clientTLS, err := mtls.ClientTLS(caF, bCertF, bKeyF)
	if err != nil {
		t.Fatal(err)
	}
	secret := bytes.Repeat([]byte{2}, 32)
	ring := peers.NewRingClient(
		map[string]string{"node-b": "http://127.0.0.1:9999"},
		peers.NewSigner("node-b", "token-b", secret),
		time.Second,
		clientTLS,
	)
	err = ring.PostJSON(context.Background(), "node-b", "/api/v1/peer/hello", map[string]string{}, nil)
	if err == nil || !strings.Contains(err.Error(), "must be https") {
		t.Fatalf("expected fail-closed error for non-HTTPS peer with mTLS, got: %v", err)
	}
}
