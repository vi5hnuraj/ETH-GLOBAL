// Package evm builds and validates EVM transactions whose digests are signed
// by the threshold protocol. No private key material ever touches this package.
package evm

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/rlp"
)

// Transaction defines the payload structure for EVM transaction sign requests.
// Legacy (EIP-155) and DynamicFee (EIP-1559) fee markets are supported.
type Transaction struct {
	ChainID   uint64 `json:"chainId"`
	Nonce     uint64 `json:"nonce"`
	To        string `json:"to"`
	Value     string `json:"value"` // decimal wei string
	GasLimit  uint64 `json:"gasLimit"`
	GasPrice  string `json:"gasPrice,omitempty"`
	GasFeeCap string `json:"gasFeeCap,omitempty"`
	GasTipCap string `json:"gasTipCap,omitempty"`
	Data      string `json:"data"`
}

// EVMTransaction is a parsed transaction plus its signer scheme.
type EVMTransaction struct {
	Tx     *types.Transaction
	Signer types.Signer
}

// ParseTransaction converts a JSON transaction payload into a go-ethereum
// transaction and selects the correct signer scheme.
func ParseTransaction(txReq *Transaction) (*EVMTransaction, error) {
	if txReq.ChainID == 0 {
		return nil, errors.New("chainId must be specified and non-zero")
	}

	var toAddr *common.Address
	if txReq.To != "" {
		if !common.IsHexAddress(txReq.To) {
			return nil, fmt.Errorf("invalid destination address: %s", txReq.To)
		}
		addr := common.HexToAddress(txReq.To)
		toAddr = &addr
	}

	valueInt := new(big.Int)
	if txReq.Value != "" {
		var ok bool
		valueInt, ok = valueInt.SetString(txReq.Value, 10)
		if !ok {
			return nil, fmt.Errorf("invalid value big integer string: %s", txReq.Value)
		}
	}

	var dataBytes []byte
	if txReq.Data != "" {
		hexStr := strings.TrimPrefix(txReq.Data, "0x")
		decoded, err := hex.DecodeString(hexStr)
		if err != nil {
			return nil, fmt.Errorf("invalid transaction data hex: %w", err)
		}
		dataBytes = decoded
	}

	isEIP1559 := txReq.GasFeeCap != "" || txReq.GasTipCap != ""

	var innerTx types.TxData
	var signer types.Signer
	chainIDBig := new(big.Int).SetUint64(txReq.ChainID)

	if isEIP1559 {
		feeCap := new(big.Int)
		if txReq.GasFeeCap != "" {
			var ok bool
			feeCap, ok = feeCap.SetString(txReq.GasFeeCap, 10)
			if !ok {
				return nil, fmt.Errorf("invalid gasFeeCap: %s", txReq.GasFeeCap)
			}
		}
		tipCap := new(big.Int)
		if txReq.GasTipCap != "" {
			var ok bool
			tipCap, ok = tipCap.SetString(txReq.GasTipCap, 10)
			if !ok {
				return nil, fmt.Errorf("invalid gasTipCap: %s", txReq.GasTipCap)
			}
		}
		innerTx = &types.DynamicFeeTx{
			ChainID:    chainIDBig,
			Nonce:      txReq.Nonce,
			GasTipCap:  tipCap,
			GasFeeCap:  feeCap,
			Gas:        txReq.GasLimit,
			To:         toAddr,
			Value:      valueInt,
			Data:       dataBytes,
			AccessList: nil,
		}
		signer = types.NewLondonSigner(chainIDBig)
	} else {
		gasPrice := new(big.Int)
		if txReq.GasPrice != "" {
			var ok bool
			gasPrice, ok = gasPrice.SetString(txReq.GasPrice, 10)
			if !ok {
				return nil, fmt.Errorf("invalid gasPrice: %s", txReq.GasPrice)
			}
			if gasPrice.Sign() <= 0 {
				return nil, errors.New("gasPrice must be positive when a legacy transaction is requested")
			}
		}
		innerTx = &types.LegacyTx{
			Nonce:    txReq.Nonce,
			GasPrice: gasPrice,
			Gas:      txReq.GasLimit,
			To:       toAddr,
			Value:    valueInt,
			Data:     dataBytes,
		}
		signer = types.NewEIP155Signer(chainIDBig)
	}

	tx := types.NewTx(innerTx)
	return &EVMTransaction{Tx: tx, Signer: signer}, nil
}

// Hash returns the Keccak-256 signing digest.
func (et *EVMTransaction) Hash() common.Hash { return et.Signer.Hash(et.Tx) }

// EncodeSignedTransaction attaches a 65-byte signature (R||S||V) and returns
// the RLP-encoded signed transaction as a hex string.
func (et *EVMTransaction) EncodeSignedTransaction(sig []byte) (string, error) {
	if len(sig) != 65 {
		return "", fmt.Errorf("invalid signature length: expected 65 bytes, got %d", len(sig))
	}
	signedTx, err := et.Tx.WithSignature(et.Signer, sig)
	if err != nil {
		return "", fmt.Errorf("failed to attach signature: %w", err)
	}
	rlpBytes, err := rlp.EncodeToBytes(signedTx)
	if err != nil {
		return "", fmt.Errorf("failed to RLP encode signed transaction: %w", err)
	}
	return "0x" + hex.EncodeToString(rlpBytes), nil
}