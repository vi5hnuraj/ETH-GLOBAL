package engine

import (
	"encoding/hex"
	"fmt"
	"strings"

	gethcrypto "github.com/ethereum/go-ethereum/crypto"
)

// AddressFromPublicKey derives the EIP-55-ish EVM address from an uncompressed
// 65-byte (04 || X || Y) public key hex. The checksum casing follows
// go-ethereum's standard Encode, which downstream clients display normally.
func AddressFromPublicKey(pubKeyHex string) (string, error) {
	pubKeyHex = strings.TrimPrefix(pubKeyHex, "0x")
	if len(pubKeyHex) != 130 {
		return "", fmt.Errorf("invalid uncompressed public key length: expected 130 hex chars, got %d", len(pubKeyHex))
	}
	if pubKeyHex[:2] != "04" {
		return "", fmt.Errorf("invalid uncompressed public key prefix: expected '04', got %q", pubKeyHex[:2])
	}
	pubKeyBytes, err := hex.DecodeString(pubKeyHex)
	if err != nil {
		return "", fmt.Errorf("failed to decode public key hex: %w", err)
	}
	pub, err := gethcrypto.UnmarshalPubkey(pubKeyBytes)
	if err != nil {
		return "", fmt.Errorf("failed to parse public key: %w", err)
	}
	return gethcrypto.PubkeyToAddress(*pub).Hex(), nil
}