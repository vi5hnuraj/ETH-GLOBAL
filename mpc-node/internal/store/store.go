// Package store implements the per-node filesystem persistence layer.
//
// Each MPC node owns a private data directory. It persists:
//   - its own encrypted key share (one per wallet)
//   - non-secret wallet metadata (address, public key, roster seed, versions)
//   - non-secret transaction history (for reconciliation)
//   - node-local counter state
//   - encrypted node-local backups of its own share
//
// Shares are stored ONLY as the node's own blob and never as plaintext. The
// complete private key never exists in this store (or anywhere on a single
// node).
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// WalletStatus mirrors the wallet lifecycle used across the GlobalPay API.
type WalletStatus string

const (
	StatusInitializing WalletStatus = "INITIALIZING"
	StatusReady        WalletStatus = "READY"
	StatusFailed       WalletStatus = "FAILED"
)

// Wallet is non-secret metadata that every node may hold.
type Wallet struct {
	WalletID  string            `json:"walletId"`
	Address   string            `json:"address"`
	PublicKey string            `json:"publicKey"`
	Threshold int               `json:"threshold"`
	Parties   int               `json:"parties"`
	ChainID   uint64            `json:"chainId"`
	Seed      string            `json:"seed"` // hex roster seed (non-secret)
	Status    WalletStatus      `json:"status"`
	Metadata  map[string]string `json:"metadata,omitempty"`
	CreatedAt time.Time         `json:"createdAt"`
}

// ShareRecord is the node's own encrypted share on disk.
type ShareRecord struct {
	WalletID        string    `json:"walletId"`
	PartyID         string    `json:"partyId"`
	PartyIndex      int       `json:"partyIndex"`
	PublicKey       string    `json:"publicKey"`
	Version         int       `json:"version"`
	Algorithm       string    `json:"algorithm"` // always "AES-256-GCM(GLOBALPAY-MPC-DEV)"
	ShareBlob       []byte    `json:"-"`         // labelled encrypted blob (never JSON-serialised)
	ShareBlobB64    string    `json:"shareBlobB64"`
	CreatedAt       time.Time `json:"createdAt"`
	EncryptedAtNode string    `json:"encryptedAtNode"`
}

// TxRecord is non-secret history for reconciliation.
type TxRecord struct {
	TxHash        string    `json:"txHash"`
	WalletID      string    `json:"walletId"`
	Nonce         uint64    `json:"nonce"`
	To            string    `json:"to"`
	Value         string    `json:"value"` // wei
	ChainID       uint64    `json:"chainId"`
	Status        string    `json:"status"` // SUBMITTED | CONFIRMED | FAILED
	BlockHash     string    `json:"blockHash,omitempty"`
	BlockNumber   uint64    `json:"blockNumber,omitempty"`
	GasUsed       uint64    `json:"gasUsed,omitempty"`
	SigningNodes  []string  `json:"signingNodes"`
	SubmittedAt   time.Time `json:"submittedAt"`
	ConfirmedAt   time.Time `json:"confirmedAt,omitempty"`
	BroadcastBy   string    `json:"broadcastBy"`
	ApprovedBy    string    `json:"approvedBy"`
	Authorized    bool      `json:"authorized"`
	PaymentRef    string    `json:"paymentRef,omitempty"`
}

// NodeState persists per-node counter/epoch information.
type NodeState struct {
	NodeID         string    `json:"nodeId"`
	SigningCounter uint64    `json:"signingCounter"`
	Epoch          uint64    `json:"epoch"`
	SigningPaused  bool      `json:"signingPaused"`
	BootedAt       time.Time `json:"bootedAt"`
	LastUpdated    time.Time `json:"lastUpdated"`
}

// Store reads/writes the node-local directory with 0600 file permissions and
// atomic renames. All paths are confined to dataDir.
type Store struct {
	dataDir string
	nodeID  string
	// StorageFault, when true, simulates a dead/unwritable backing store. It is
	// used by failure tests to prove fail-closed behaviour; never enabled in
	// normal operation.
	StorageFault bool
}

// New creates a store rooted at dataDir under the node's identity.
func New(dataDir, nodeID string) (*Store, error) {
	if dataDir == "" {
		return nil, errors.New("store: empty data directory")
	}
	for _, d := range []string{"wallets", "shares", "transactions", "state", "backups", "preparams"} {
		if err := os.MkdirAll(filepath.Join(dataDir, d), 0o700); err != nil {
			return nil, fmt.Errorf("store: create %s: %w", d, err)
		}
	}
	return &Store{dataDir: dataDir, nodeID: nodeID}, nil
}

func (s *Store) check() error {
	if s.StorageFault {
		return errors.New("storage failure: backing store unavailable (simulated)")
	}
	return nil
}

func (s *Store) path(elem ...string) string {
	return filepath.Join(append([]string{s.dataDir}, elem...)...)
}

func writeAtomic(path string, data []byte, perm os.FileMode) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ---------- Wallet metadata (non-secret, node-local mirror) ----------

func (s *Store) SaveWallet(w *Wallet) error {
	if err := s.check(); err != nil {
		return err
	}
	bz, err := json.MarshalIndent(w, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(s.path("wallets", w.WalletID+".json"), bz, 0o600)
}

func (s *Store) GetWallet(walletID string) (*Wallet, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	bz, err := os.ReadFile(s.path("wallets", walletID+".json"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("wallet %q not found on node %s", walletID, s.nodeID)
		}
		return nil, err
	}
	var w Wallet
	if err := json.Unmarshal(bz, &w); err != nil {
		return nil, err
	}
	return &w, nil
}

func (s *Store) ListWallets() ([]*Wallet, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(s.path("wallets"))
	if err != nil {
		return nil, err
	}
	var out []*Wallet
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		w, err := s.GetWallet(stringsTrimSuffix(e.Name(), ".json"))
		if err == nil {
			out = append(out, w)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

func stringsTrimSuffix(name, suffix string) string {
	return strings.TrimSuffix(name, suffix)
}

// ---------- Node-local encrypted share ----------

// SaveShare persists the node's own encrypted share blob.
func (s *Store) SaveShare(sh *ShareRecord) error {
	if err := s.check(); err != nil {
		return err
	}
	filename := fmt.Sprintf("%s.v%d", sh.WalletID, sh.Version)
	data, err := json.MarshalIndent(sh, "", "  ")
	if err != nil {
		return err
	}
	if err := writeAtomic(s.path("shares", filename), data, 0o600); err != nil {
		return err
	}
	// A current-share pointer lets us re-find the newest version.
	_ = writeAtomic(s.path("shares", sh.WalletID+".current"), []byte(filename), 0o600)
	return nil
}

// CurrentShare returns the newest local encrypted share for a wallet.
func (s *Store) CurrentShare(walletID string) (*ShareRecord, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	cur, err := os.ReadFile(s.path("shares", walletID+".current"))
	if err != nil {
		return nil, fmt.Errorf("no local share for wallet %q on node %s", walletID, s.nodeID)
	}
	bz, err := os.ReadFile(s.path("shares", string(cur)))
	if err != nil {
		return nil, err
	}
	var sh ShareRecord
	if err := json.Unmarshal(bz, &sh); err != nil {
		return nil, err
	}
	return &sh, nil
}

// ShareVersion reads a specific encrypted share version.
func (s *Store) ShareVersion(walletID string, version int) (*ShareRecord, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	bz, err := os.ReadFile(s.path("shares", fmt.Sprintf("%s.v%d", walletID, version)))
	if err != nil {
		return nil, err
	}
	var sh ShareRecord
	if err := json.Unmarshal(bz, &sh); err != nil {
		return nil, err
	}
	return &sh, nil
}

func (s *Store) HasShare(walletID string) bool {
	_, err := s.CurrentShare(walletID)
	return err == nil
}

// DeleteShare removes a node's local share (used by the replacement flow only
// after a reshare produced a replacement, and by explicit operator actions).
func (s *Store) DeleteShare(walletID string) error {
	if err := s.check(); err != nil {
		return err
	}
	_ = os.Remove(s.path("shares", walletID+".current"))
	// remove all versions
	entries, err := os.ReadDir(s.path("shares"))
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() && filepath.HasPrefix(e.Name(), walletID+".") {
				_ = os.Remove(s.path("shares", e.Name()))
			}
		}
	}
	return nil
}

// ---------- Backups (encrypted node-local copy of the node's own share) ----------

func (s *Store) BackupShare(walletID, note string) (string, error) {
	if err := s.check(); err != nil {
		return "", err
	}
	sh, err := s.CurrentShare(walletID)
	if err != nil {
		return "", err
	}
	name := fmt.Sprintf("%s.v%d.%d.bak", walletID, sh.Version, time.Now().UnixNano())
	bz, _ := json.MarshalIndent(map[string]interface{}{
		"label":        "GLOBALPAY-MPC-DEV-BACKUP-v1",
		"nodeId":       s.nodeID,
		"walletId":     walletID,
		"version":      sh.Version,
		"partyId":      sh.PartyID,
		"partyIndex":   sh.PartyIndex,
		"encryptedBlob": sh.ShareBlobB64,
		"note":         note,
		"createdAt":    time.Now().UTC(),
	}, "", "  ")
	if err := writeAtomic(s.path("backups", name), bz, 0o600); err != nil {
		return "", err
	}
	return name, nil
}

func (s *Store) ListBackups(walletID string) ([]string, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(s.path("backups"))
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if walletID == "" || filepath.HasPrefix(e.Name(), walletID+".") {
			out = append(out, e.Name())
		}
	}
	return out, nil
}

// RestoreBackup loads a backup blob back into the current share slot.
// It is equivalent to restoring the node's own encrypted share. No plaintext
// is ever written to disk.
func (s *Store) RestoreBackup(walletID, backupName string) error {
	if err := s.check(); err != nil {
		return err
	}
	bz, err := os.ReadFile(s.path("backups", backupName))
	if err != nil {
		return err
	}
	var b struct {
		Label         string `json:"label"`
		WalletID      string `json:"walletId"`
		Version       int    `json:"version"`
		PartyID       string `json:"partyId"`
		PartyIndex    int    `json:"partyIndex"`
		EncryptedBlob string `json:"encryptedBlob"`
	}
	if err := json.Unmarshal(bz, &b); err != nil {
		return err
	}
	if b.Label != "GLOBALPAY-MPC-DEV-BACKUP-v1" {
		return errors.New("restore: not a GLOBALPAY-MPC-DEV backup")
	}
	if walletID != "" && b.WalletID != walletID {
		return fmt.Errorf("restore: backup belongs to wallet %q, not %q", b.WalletID, walletID)
	}
	sh := &ShareRecord{
		WalletID:     b.WalletID,
		PartyID:      b.PartyID,
		PartyIndex:   b.PartyIndex,
		Version:      b.Version,
		Algorithm:    "AES-256-GCM(GLOBALPAY-MPC-DEV)",
		ShareBlobB64: b.EncryptedBlob,
		CreatedAt:    time.Now().UTC(),
		EncryptedAtNode: s.nodeID,
	}
	return s.SaveShare(sh)
}

// ---------- Transactions (non-secret reconciliation history) ----------

func (s *Store) SaveTx(tx *TxRecord) error {
	if err := s.check(); err != nil {
		return err
	}
	if err := os.MkdirAll(s.path("transactions", tx.WalletID), 0o700); err != nil {
		return err
	}
	bz, err := json.MarshalIndent(tx, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(s.path("transactions", tx.WalletID, tx.TxHash+".json"), bz, 0o600)
}

func (s *Store) GetTx(walletID, txHash string) (*TxRecord, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	bz, err := os.ReadFile(s.path("transactions", walletID, txHash+".json"))
	if err != nil {
		return nil, err
	}
	var tx TxRecord
	if err := json.Unmarshal(bz, &tx); err != nil {
		return nil, err
	}
	return &tx, nil
}

func (s *Store) ListTxs(walletID string) ([]*TxRecord, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	dir := s.path("transactions", walletID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []*TxRecord
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		tx, err := s.GetTx(walletID, stringsTrimSuffix(e.Name(), ".json"))
		if err == nil {
			out = append(out, tx)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SubmittedAt.Before(out[j].SubmittedAt) })
	return out, nil
}

// ---------- Node state ----------

func (s *Store) GetState() (*NodeState, error) {
	if err := s.check(); err != nil {
		return nil, err
	}
	bz, err := os.ReadFile(s.path("state", "node.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return &NodeState{NodeID: s.nodeID, BootedAt: time.Now().UTC()}, nil
		}
		return nil, err
	}
	var st NodeState
	if err := json.Unmarshal(bz, &st); err != nil {
		return nil, err
	}
	return &st, nil
}

func (s *Store) SaveState(st *NodeState) error {
	if err := s.check(); err != nil {
		return err
	}
	bz, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(s.path("state", "node.json"), bz, 0o600)
}

// BumpSigningCounter atomically increments the node signing counter.
func (s *Store) BumpSigningCounter() (uint64, error) {
	if err := s.check(); err != nil {
		return 0, err
	}
	st, _ := s.GetState()
	st.SigningCounter++
	st.LastUpdated = time.Now().UTC()
	if err := s.SaveState(st); err != nil {
		return 0, err
	}
	return st.SigningCounter, nil
}

// Wipe removes the node's entire data directory. Used by the replacement
// test and cleanups. Returns a clear error when backups are still present so
// operators can make an explicit decision.
func (s *Store) Wipe() error {
	return os.RemoveAll(s.dataDir)
}