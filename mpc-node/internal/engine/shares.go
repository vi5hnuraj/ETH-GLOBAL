package engine

import (
	"encoding/base64"
	"fmt"

	"github.com/globalpay/mpc-node/internal/keys"
	"github.com/globalpay/mpc-node/internal/store"

	tssKeygen "github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
)

// encryptShare seals a serialized LocalPartySaveData with this node's dev key.
func (n *Node) encryptShare(serialized []byte) ([]byte, error) {
	return keys.Encrypt(n.devKey, serialized)
}

// decryptShare unseals a stored ShareRecord blob with this node's dev key.
func (n *Node) decryptShare(sh *store.ShareRecord) ([]byte, error) {
	if sh == nil || sh.ShareBlobB64 == "" {
		return nil, fmt.Errorf("engine: share record has no encrypted blob")
	}
	enc, err := base64.StdEncoding.DecodeString(sh.ShareBlobB64)
	if err != nil {
		return nil, fmt.Errorf("engine: share blob b64: %w", err)
	}
	return keys.Decrypt(n.devKey, enc)
}

// loadShareData decrypts and deserializes the node's current encrypted share.
// The caller must zero the returned bytes after use.
func (n *Node) loadShareData(walletID string) (*store.ShareRecord, []byte, error) {
	sh, err := n.store.CurrentShare(walletID)
	if err != nil {
		return nil, nil, err
	}
	raw, err := n.decryptShare(sh)
	if err != nil {
		return nil, nil, err
	}
	return sh, raw, nil
}

// persistShare writes the local encrypted share and wallet metadata.
func (n *Node) persistShare(walletID string, wallet *store.Wallet, sd *tssKeygen.LocalPartySaveData, ownIdx int, encBlob []byte, version int) error {
	n.mu.Lock()
	if last, ok := n.networkNonce[walletID]; ok && wallet.CreatedAt.IsZero() {
		_ = last
	}
	n.mu.Unlock()

	share := &store.ShareRecord{
		WalletID:        walletID,
		PartyID:         fmt.Sprintf("%d", ownIdx+1),
		PartyIndex:      ownIdx,
		PublicKey:       wallet.PublicKey,
		Version:         version,
		Algorithm:       "AES-256-GCM(GLOBALPAY-MPC-DEV)",
		ShareBlobB64:    base64.StdEncoding.EncodeToString(encBlob),
		EncryptedAtNode: n.cfg.NodeID,
	}
	if sd != nil && sd.ECDSAPub != nil {
		pubX := sd.ECDSAPub.X().Bytes()
		pubY := sd.ECDSAPub.Y().Bytes()
		xPad := make([]byte, 32)
		yPad := make([]byte, 32)
		copy(xPad[32-len(pubX):], pubX)
		copy(yPad[32-len(pubY):], pubY)
		share.PublicKey = fmt.Sprintf("%x%x%x", []byte{0x04}, xPad, yPad)
	}

	if err := n.store.SaveShare(share); err != nil {
		return fmt.Errorf("engine: save share: %w", err)
	}
	if err := n.store.SaveWallet(wallet); err != nil {
		return fmt.Errorf("engine: save wallet metadata: %w", err)
	}
	return nil
}