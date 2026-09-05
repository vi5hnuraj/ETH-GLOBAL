//go:build integration

// These tests intentionally require deployed, real mTLS nodes. They do not
// start local participants, generate signatures, or simulate broadcasts.
package integration

import (
	"crypto/tls"
	"crypto/x509"
	"net/http"
	"os"
	"testing"
)

func TestAllDeployedNodesExposeAuthenticatedHealth(t *testing.T) {
	if os.Getenv("MPC_REAL_NODES") != "1" {
		t.Skip("requires three deployed real MPC nodes")
	}
	ca, err := os.ReadFile(os.Getenv("MPC_MTLS_CA_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	cert, err := tls.LoadX509KeyPair(os.Getenv("MPC_MTLS_CERT_FILE"), os.Getenv("MPC_MTLS_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		t.Fatal("invalid MPC CA")
	}
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}}, Timeout: 10_000_000_000}
	for _, node := range []string{os.Getenv("MPC_NODE_A_URL"), os.Getenv("MPC_NODE_B_URL"), os.Getenv("MPC_NODE_C_URL")} {
		res, err := client.Get(node + "/api/v1/health")
		if err != nil {
			t.Fatalf("node health request failed: %v", err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("node health returned %d", res.StatusCode)
		}
	}
}
