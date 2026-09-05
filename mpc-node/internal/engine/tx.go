package engine

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/globalpay/mpc-node/internal/evm"
	"github.com/globalpay/mpc-node/internal/store"

	gethcommon "github.com/ethereum/go-ethereum/common"
	gethcrypto "github.com/ethereum/go-ethereum/crypto"
)

// TxRequest is the full transaction payload the API layer accepts.
type TxRequest struct {
	WalletID       string `json:"walletId"`
	To             string `json:"to"`
	Value          string `json:"value"` // decimal wei
	Data           string `json:"data"`
	GasLimit       uint64 `json:"gasLimit"`
	GasPrice       string `json:"gasPrice,omitempty"` // legacy
	GasFeeCap      string `json:"gasFeeCap,omitempty"`
	GasTipCap      string `json:"gasTipCap,omitempty"`
	IdempotencyKey string `json:"idempotencyKey,omitempty"`
}

// Balance reports an address balance + pending nonce.
type Balance struct {
	Address string `json:"address"`
	Balance string `json:"balance"` // wei decimal
	Pending string `json:"pendingNonce"`
}

// TxBroadcastResult is the outcome of signing + broadcasting.
type TxBroadcastResult struct {
	TxHash    string `json:"txHash"`
	RawTx     string `json:"rawTx"`
	ChainID   uint64 `json:"chainId"`
	SignedBy  []string `json:"signedBy"`
	Submitted bool   `json:"submitted"`
}

// WalletBalance returns the on-chain balance and pending nonce for a wallet.
func (n *Node) WalletBalance(ctx context.Context, walletID string) (*Balance, error) {
	w, err := n.store.GetWallet(walletID)
	if err != nil {
		return nil, err
	}
	bal, err := n.bot.BalanceAt(ctx, gethcommon.HexToAddress(w.Address))
	if err != nil {
		return nil, fmt.Errorf("engine: balance read: %w", err)
	}
	nonce, err := n.bot.PendingNonceAt(ctx, gethcommon.HexToAddress(w.Address))
	if err != nil {
		return nil, fmt.Errorf("engine: nonce read: %w", err)
	}
	return &Balance{
		Address: w.Address,
		Balance: bal.String(),
		Pending: fmt.Sprintf("%d", nonce),
	}, nil
}

// History returns stored transaction records for a wallet.
func (n *Node) History(ctx context.Context, walletID string) ([]*store.TxRecord, error) {
	return n.store.ListTxs(walletID)
}

// SignAndBroadcast builds, threshold-signs, and returns a raw signed
// transaction. Broadcast is a separate, explicitly gated step: a caller must
// call Broadcast separately to touch the network.
func (n *Node) SignAndBroadcast(ctx context.Context, req *TxRequest, approvalToken string) (*TxBroadcastResult, error) {
	if req == nil {
		return nil, errors.New("engine: nil tx request")
	}
	w, err := n.store.GetWallet(req.WalletID)
	if err != nil {
		return nil, err
	}
	if err := n.signingGate(w.ChainID, approvalToken); err != nil {
		return nil, err
	}

	nonce, err := n.nextNonce(ctx, w)
	if err != nil {
		return nil, err
	}

	et, err := n.buildTx(req, w, nonce)
	if err != nil {
		return nil, err
	}

	sig, err := n.Sign(ctx, &SignRequest{
		WalletID:  req.WalletID,
		Digest:    et.Hash().Hex(),
		ChainID:   w.ChainID,
		SessionID: req.IdempotencyKey,
	})
	if err != nil {
		return nil, err
	}

	if err := n.verifySignature(et, sig.Signature, w); err != nil {
		return nil, err
	}

	raw, err := et.EncodeSignedTransaction(hexSig(sig.Signature))
	if err != nil {
		return nil, err
	}

	return &TxBroadcastResult{
		TxHash:   et.Hash().Hex(),
		RawTx:    raw,
		ChainID:  w.ChainID,
		SignedBy: []string{n.cfg.NodeID, sig.NodeID},
	}, nil
}

// Broadcast submits an already-signed raw transaction to the network after
// re-checking the mainnet gate.
func (n *Node) Broadcast(ctx context.Context, walletID, rawTx, approvalToken string) (*TxBroadcastResult, error) {
	w, err := n.store.GetWallet(walletID)
	if err != nil {
		return nil, err
	}
	if err := n.signingGate(w.ChainID, approvalToken); err != nil {
		return nil, err
	}
	hash, err := n.bot.SendRawTransaction(ctx, rawTx)
	if err != nil {
		// A transaction that was rejected before reaching the pool consumes no
		// nonce on-chain. nextNonce pre-advances the in-memory counter, so a
		// failed broadcast must roll it back to the chain's pending nonce or the
		// wallet strands itself on a nonce the chain will never accept.
		n.mu.Lock()
		if pend, perr := n.bot.PendingNonceAt(ctx, gethcommon.HexToAddress(w.Address)); perr == nil {
			if cur := n.networkNonce[walletID]; cur > pend {
				n.networkNonce[walletID] = pend
			}
		}
		n.mu.Unlock()
		return nil, fmt.Errorf("engine: broadcast: %w", err)
	}
	rec := &store.TxRecord{
		TxHash:      hash.Hex(),
		WalletID:    walletID,
		ChainID:     w.ChainID,
		Status:      "SUBMITTED",
		SubmittedAt: time.Now().UTC(),
		BroadcastBy: n.cfg.NodeID,
	}
	if err := n.store.SaveTx(rec); err != nil {
		return nil, fmt.Errorf("engine: persist tx record: %w", err)
	}
	return &TxBroadcastResult{TxHash: hash.Hex(), RawTx: rawTx, ChainID: w.ChainID, Submitted: true}, nil
}

// nextNonce returns the next nonce for a wallet, mirroring the legacy in-memory
// nonce manager: it never goes backward and never reuses an on-chain pending
// nonce.
func (n *Node) nextNonce(ctx context.Context, w *store.Wallet) (uint64, error) {
	pending, err := n.bot.PendingNonceAt(ctx, gethcommon.HexToAddress(w.Address))
	if err != nil {
		return 0, err
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	seq := n.networkNonce[w.WalletID]
	if seq < pending {
		seq = pending
	}
	n.networkNonce[w.WalletID] = seq + 1
	return seq, nil
}

func (n *Node) buildTx(req *TxRequest, w *store.Wallet, nonce uint64) (*evm.EVMTransaction, error) {
	txReq := &evm.Transaction{
		ChainID:  w.ChainID,
		Nonce:    nonce,
		To:       req.To,
		Value:    req.Value,
		GasLimit: req.GasLimit,
		Data:     req.Data,
	}
	if req.GasFeeCap != "" || req.GasTipCap != "" {
		txReq.GasFeeCap = req.GasFeeCap
		txReq.GasTipCap = req.GasTipCap
	} else if req.GasPrice != "" {
		txReq.GasPrice = req.GasPrice
	}
	return evm.ParseTransaction(txReq)
}

// verifySignature recovers the signer address and fails closed if it does not
// match the wallet.
func (n *Node) verifySignature(et *evm.EVMTransaction, sigHex string, w *store.Wallet) error {
	raw, err := hexBytes(sigHex)
	if err != nil {
		return fmt.Errorf("engine: signature hex: %w", err)
	}
	if len(raw) != 65 {
		return fmt.Errorf("engine: signature length %d != 65", len(raw))
	}
	pk, err := gethcrypto.SigToPub(et.Hash().Bytes(), raw)
	if err != nil {
		return fmt.Errorf("engine: signature recovery failed: %w", err)
	}
	recovered := gethcrypto.PubkeyToAddress(*pk).Hex()
	if !strings.EqualFold(recovered, w.Address) {
		return fmt.Errorf("engine: recover-verify mismatch: got %s want %s; refusing to broadcast", recovered, w.Address)
	}
	return nil
}

func hexSig(sig string) []byte {
	raw, err := hexBytes(sig)
	if err != nil {
		return nil
	}
	return raw
}

func hexBytes(s string) ([]byte, error) {
	return gethcommon.FromHex(trim0x(s)), nil
}