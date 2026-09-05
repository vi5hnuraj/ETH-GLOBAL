package peers

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// RingClient sends signed JSON to peer nodes. Each node has a distinct base
// URL and signs with its own identity/secret. When constructed with a TLS
// config (production), every peer request runs over mutual-TLS HTTPS and any
// non-HTTPS peer endpoint is a hard, fail-closed error.
type RingClient struct {
	baseURLs map[string]string // nodeID -> scheme://host:port
	signer   *Signer
	client   *http.Client
	timeout  time.Duration
	// requireHTTPS is true when mutual TLS is in use; all peer endpoints must
	// then be https and the transport is a TLS client.
	requireHTTPS bool
}

// NewRingClient constructs a ring client that can reach every known peer. An
// optional *tls.Config enables production mutual-TLS transport; omit it (or
// pass nil) to keep the plain-HTTP development behaviour.
func NewRingClient(baseURLs map[string]string, signer *Signer, timeout time.Duration, tlsConfig ...*tls.Config) *RingClient {
	c := &RingClient{
		baseURLs:     baseURLs,
		signer:       signer,
		client:       &http.Client{},
		timeout:      timeout,
		requireHTTPS: len(tlsConfig) > 0 && tlsConfig[0] != nil,
	}
	if c.requireHTTPS {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.TLSClientConfig = tlsConfig[0]
		c.client.Transport = transport
	}
	return c
}

// BaseURL returns the configured URL for a peer node.
func (c *RingClient) BaseURL(nodeID string) (string, error) {
	u, ok := c.baseURLs[nodeID]
	if !ok {
		return "", fmt.Errorf("ring: no base url for node %q", nodeID)
	}
	return u, nil
}

// PostJSON signs and sends a JSON body to a peer. out is unmarshalled from the
// response body on success (200/201). All non-2xx responses are errors.
func (c *RingClient) PostJSON(ctx context.Context, nodeID, path string, body interface{}, out interface{}) error {
	base, err := c.BaseURL(nodeID)
	if err != nil {
		return err
	}
	if c.requireHTTPS {
		u, err := url.Parse(base)
		if err != nil {
			return fmt.Errorf("ring: invalid base url for %q: %w", nodeID, err)
		}
		if u.Scheme != "https" {
			return fmt.Errorf("ring: peer %q endpoint %q must be https when mTLS is enabled (fail-closed)", nodeID, base)
		}
	}
	bz, err := json.Marshal(body)
	if err != nil {
		return err
	}
	headers := c.signer.Sign(http.MethodPost, path, bz)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(bz))
	if err != nil {
		return err
	}
	for k, vs := range headers {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	if c.timeout > 0 {
		ctx2, cancel := context.WithTimeout(ctx, c.timeout)
		defer cancel()
		req = req.WithContext(ctx2)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("ring: post to %s: %w", nodeID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		bodyErr := make([]byte, 0, 512)
		_ = json.NewDecoder(resp.Body).Decode(&bodyErr)
		return fmt.Errorf("ring: %s %s returned status %d (%s)", nodeID, path, resp.StatusCode, string(bodyErr))
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("ring: decode response from %s: %w", nodeID, err)
		}
	}
	return nil
}

// PingHealth issues a signed health probe to a peer.
func (c *RingClient) PingHealth(ctx context.Context, nodeID string) error {
	var out map[string]interface{}
	return c.PostJSON(ctx, nodeID, "/api/v1/peer/hello", map[string]string{}, &out)
}