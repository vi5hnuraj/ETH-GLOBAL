// Package keys provides development-only symmetric cryptography for MPC key
// shares. Every node uses its own independently generated 256-bit key. The
// header written with each ciphertext is explicitly labelled
// GLOBALPAY-MPC-DEV so a blunder can never be mistaken for an HSM/KMS blob.
package keys

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// Label is prefixed to every dev ciphertext so it is unambiguous in storage.
const Label = "GLOBALPAY-MPC-DEV-SHARE-v1"

// ZeroBytes overwrites a byte slice. Best-effort mitigation; do not rely on it
// for more than shortening the window of plaintext retention.
func ZeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// ParseDevKey decodes a 64-hex-char (32 byte) node-local dev AES key.
func ParseDevKey(hexKey string) ([]byte, error) {
	raw, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("dev key is not valid hex: %w", err)
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("dev key must be 32 bytes (64 hex chars), got %d", len(raw))
	}
	return raw, nil
}

// Encrypt seals plaintext with AES-256-GCM and prefixes the DEV label.
func Encrypt(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	out := make([]byte, 0, len(Label)+1+len(sealed))
	out = append(out, Label...)
	out = append(out, '\n')
	out = append(out, sealed...)
	return out, nil
}

// Decrypt reverses Encrypt and rejects any blob not carrying the DEV label.
func Decrypt(key, blob []byte) ([]byte, error) {
	if len(blob) < len(Label)+1 {
		return nil, errors.New("ciphertext too short")
	}
	if string(blob[:len(Label)]) != Label {
		return nil, errors.New("share blob is not a GLOBALPAY-MPC-DEV blob; refusing to decrypt")
	}
	sealed := blob[len(Label)+1:]
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}
	return gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
}