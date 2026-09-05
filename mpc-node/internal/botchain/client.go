// Package botchain is a thin BOT Chain (EVM) JSON-RPC client used only for
// reading balances/nonces/gas and for broadcasting already-signed transactions.
package botchain

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

// Client wraps go-ethereum's ethclient for the subset of calls the node needs.
type Client struct {
	url    string
	rpc    *ethclient.Client
	chain  uint64
	stubOn bool // dev stub for failure tests (network failure simulation)
}

// Dial connects to an EVM RPC endpoint and verifies the chain id.
func Dial(url string, expectChainID uint64) (*Client, error) {
	if url == "" {
		return nil, errors.New("botchain: empty RPC url")
	}
	c, err := ethclient.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("botchain: dial %s: %w", url, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	id, err := c.ChainID(ctx)
	if err != nil {
		c.Close()
		return nil, fmt.Errorf("botchain: chain id query failed: %w", err)
	}
	if id.Uint64() != expectChainID {
		c.Close()
		return nil, fmt.Errorf("botchain: RPC chain id %d does not match configured chain id %d", id.Uint64(), expectChainID)
	}
	return &Client{url: url, rpc: c, chain: expectChainID}, nil
}

// ChainID returns the verified chain id.
func (c *Client) ChainID() uint64 { return c.chain }

// Close releases the RPC connection.
func (c *Client) Close() {
	if c.rpc != nil {
		c.rpc.Close()
	}
}

// SetNetworkFault simulates an unreachable RPC endpoint for failure tests.
func (c *Client) SetNetworkFault(on bool) { c.stubOn = on }

func (c *Client) check() error {
	if c.stubOn {
		return errors.New("botchain: RPC network failure (simulated)")
	}
	return nil
}

// BalanceAt returns the wei balance at the latest block.
func (c *Client) BalanceAt(ctx context.Context, addr common.Address) (*big.Int, error) {
	if err := c.check(); err != nil {
		return nil, err
	}
	return c.rpc.BalanceAt(ctx, addr, nil)
}

// PendingNonceAt returns the pending transaction count for an address.
func (c *Client) PendingNonceAt(ctx context.Context, addr common.Address) (uint64, error) {
	if err := c.check(); err != nil {
		return 0, err
	}
	return c.rpc.PendingNonceAt(ctx, addr)
}

// SuggestGasPrice returns the node-suggested legacy gas price.
func (c *Client) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	if err := c.check(); err != nil {
		return nil, err
	}
	return c.rpc.SuggestGasPrice(ctx)
}

// SuggestGasTipCap returns the suggested priority fee.
func (c *Client) SuggestGasTipCap(ctx context.Context) (*big.Int, error) {
	if err := c.check(); err != nil {
		return nil, err
	}
	return c.rpc.SuggestGasTipCap(ctx)
}

// EstimateGas estimates gas for a call message.
func (c *Client) EstimateGas(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
	if err := c.check(); err != nil {
		return 0, err
	}
	return c.rpc.EstimateGas(ctx, msg)
}

// SendRawTransaction broadcasts a raw signed transaction hex and returns its hash.
func (c *Client) SendRawTransaction(ctx context.Context, rawHex string) (common.Hash, error) {
	if err := c.check(); err != nil {
		return common.Hash{}, err
	}
	raw := common.FromHex(rawHex)
	tx := new(types.Transaction)
	if err := tx.UnmarshalBinary(raw); err != nil {
		return common.Hash{}, fmt.Errorf("botchain: invalid signed tx bytes: %w", err)
	}
	if err := c.rpc.SendTransaction(ctx, tx); err != nil {
		return common.Hash{}, err
	}
	return tx.Hash(), nil
}

// TransactionReceipt waits (best effort) for a receipt and returns it.
func (c *Client) TransactionReceipt(ctx context.Context, hash common.Hash) (*types.Receipt, error) {
	if err := c.check(); err != nil {
		return nil, err
	}
	return c.rpc.TransactionReceipt(ctx, hash)
}

// TransactionByHash resolves a transaction by hash.
func (c *Client) TransactionByHash(ctx context.Context, hash common.Hash) (*types.Transaction, bool, error) {
	if err := c.check(); err != nil {
		return nil, false, err
	}
	return c.rpc.TransactionByHash(ctx, hash)
}