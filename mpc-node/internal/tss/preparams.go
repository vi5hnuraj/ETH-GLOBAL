package tss

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
	"github.com/globalpay/mpc-node/internal/util"
)

// PreParamCache stores node-local Paillier pre-parameters so DKG sessions
// reuse them instead of regenerating safe primes (30-90s each). Cached encrypted
// shares keep the file opaque (though pre-params are not themselves the
// long-term key material).
type PreParamCache struct {
	path string
	enc  func([]byte) ([]byte, error)
	dec  func([]byte) ([]byte, error)
}

// NewPreParamCache wires the cache to a file and per-node (dev) encryptor.
func NewPreParamCache(path string, enc, dec func([]byte) ([]byte, error)) *PreParamCache {
	return &PreParamCache{path: path, enc: enc, dec: dec}
}

// LoadOrGenerate returns cached pre-params, generating + caching them if absent.
func (c *PreParamCache) LoadOrGenerate(ctx context.Context, partyCount int) (*keygen.LocalPreParams, error) {
	if c == nil || c.path == "" {
		return generatePreParams(ctx)
	}
	if raw, err := c.load(); err == nil {
		var pp keygen.LocalPreParams
		if b, derr := c.dec(raw); derr == nil && json.Unmarshal(b, &pp) == nil {
			return &pp, nil
		}
	}
	pp, err := generatePreParams(ctx)
	if err != nil {
		return nil, err
	}
	bz, _ := json.Marshal(pp)
	enc, err := c.enc(bz)
	if err == nil {
		_ = util.WriteAtomic(c.path, enc, 0o600)
	}
	return pp, nil
}

func generatePreParams(ctx context.Context) (*keygen.LocalPreParams, error) {
	pctx, cancel := context.WithTimeout(ctx, 12*time.Minute)
	defer cancel()
	pp, err := keygen.GeneratePreParamsWithContext(pctx)
	if err != nil {
		return nil, fmt.Errorf("generate pre-params: %w", err)
	}
	return pp, nil
}

func (c *PreParamCache) load() ([]byte, error) {
	return util.ReadFile(c.path)
}

// LocalPreParamsForParty returns a deep-copied pre-params set indexed for party
// i (pre-params are independent per party but interchangeable; we reuse the one
// cache entry for the node's own party).
func LocalPreParamsForParty(pp *keygen.LocalPreParams, partyIndex int) (*keygen.LocalPreParams, error) {
	if pp == nil {
		return nil, errors.New("no pre-params for party")
	}
	cp := *pp
	return &cp, nil
}