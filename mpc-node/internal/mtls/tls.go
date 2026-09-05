// Package mtls builds the production mutual-TLS configuration for the MPC node
// ring.
//
// It is transport-level security only: every node presents its own certificate
// and REQUIRES a valid client certificate signed by the trusted MPC CA. The
// application-layer HMAC peer authentication (peers.Verifier) stays fully
// enforced on top of this transport, so both layers must pass.
package mtls

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"os"
)

// LoadCertificatePool loads the trusted CA bundle used to authenticate peer
// node certificates.
func LoadCertificatePool(caFile string) (*x509.CertPool, error) {
	pem, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("mtls: read CA file %s: %w", caFile, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("mtls: no certificates found in CA file %s", caFile)
	}
	return pool, nil
}

func loadKeyPair(certFile, keyFile string) (tls.Certificate, error) {
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("mtls: load node certificate %s / %s: %w", certFile, keyFile, err)
	}
	return cert, nil
}

func requireFiles(caFile, certFile, keyFile string) error {
	if caFile == "" {
		return errors.New("mtls: MPC_MTLS_CA_FILE is required")
	}
	if certFile == "" {
		return errors.New("mtls: MPC_MTLS_CERT_FILE is required")
	}
	if keyFile == "" {
		return errors.New("mtls: MPC_MTLS_KEY_FILE is required")
	}
	return nil
}

// ServerTLS returns the TLS configuration a node server must use in
// production. It presents the node's certificate and REQUIRES a client
// certificate signed by the MPC CA on every connection. TLS 1.2 minimum.
func ServerTLS(caFile, certFile, keyFile string) (*tls.Config, error) {
	if err := requireFiles(caFile, certFile, keyFile); err != nil {
		return nil, err
	}
	ca, err := LoadCertificatePool(caFile)
	if err != nil {
		return nil, err
	}
	cert, err := loadKeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    ca,
		ClientAuth:   tls.RequireAndVerifyClientCert,
		MinVersion:   tls.VersionTLS12,
	}, nil
}

// ClientTLS returns the TLS configuration the peer RingClient uses to reach
// the other nodes. It presents the node's certificate and requires the peer's
// server certificate to be signed by the MPC CA. TLS 1.2 minimum.
func ClientTLS(caFile, certFile, keyFile string) (*tls.Config, error) {
	if err := requireFiles(caFile, certFile, keyFile); err != nil {
		return nil, err
	}
	ca, err := LoadCertificatePool(caFile)
	if err != nil {
		return nil, err
	}
	cert, err := loadKeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      ca,
		MinVersion:   tls.VersionTLS12,
	}, nil
}
