package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"

	"github.com/bnb-chain/tss-lib/v3/tss"
	"github.com/globalpay/mpc-node/internal/store"
	engineTSS "github.com/globalpay/mpc-node/internal/tss"
)

// DKGRequest is the public face of a wallet-creation request.
type DKGRequest struct {
	WalletID string `json:"walletId,omitempty"`
	Seed     string `json:"seed,omitempty"` // optional hex roster seed (non-secret)
	Parties  int    `json:"parties"`
	ChainID  uint64 `json:"chainId"`
}

// DKGAnnounce is broadcast to each peer before a keygen session runs.
type DKGAnnounce struct {
	SessionID  string `json:"sessionId"`
	WalletID   string `json:"walletId"`
	NodeID     string `json:"nodeId"`
	Seed       string `json:"seed"`
	Parties    int    `json:"parties"`
	Threshold  int    `json:"threshold"`
	ChainID    uint64 `json:"chainId"`
	PublicKey  string `json:"publicKey"`  // filled by participants as they complete
	Address    string `json:"address"`    // filled by participants as they complete
	PartyIndex int    `json:"partyIndex"` // filled by participants
}

// KeygenResult is returned by a completed keygen participant.
type KeygenResult struct {
	SessionID  string `json:"sessionId"`
	WalletID   string `json:"walletId"`
	NodeID     string `json:"nodeId"`
	PartyIndex int    `json:"partyIndex"`
	PublicKey  string `json:"publicKey"`
	Address    string `json:"address"`
}

// WalletResult is the outcome reported to an API client.
type WalletResult struct {
	WalletID  string `json:"walletId"`
	Address   string `json:"address"`
	PublicKey string `json:"publicKey"`
	ChainID   uint64 `json:"chainId"`
	Threshold int    `json:"threshold"`
	Parties   int    `json:"parties"`
}

var nodes = []string{"node-a", "node-b", "node-c"}

func nodeIndex(nodeID string) int {
	for i, n := range nodes {
		if n == nodeID {
			return i
		}
	}
	return -1
}

func engineRandomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic("engine: crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}

// rosterOwnerMap derives party-id -> node-id ownership for the given roster.
// node-a owns roster[0], node-b owns roster[1], node-c owns roster[2]. Party
// ids are NOT sequential after sorting, so the mapping must be per-position.
func rosterOwnerMap(roster tss.SortedPartyIDs) map[string]string {
	m := make(map[string]string, len(roster))
	for i, p := range roster {
		if i < len(nodes) {
			m[p.Id] = nodes[i]
		}
	}
	return m
}

// CreateWallet drives a 3-node DKG session. The local process always
// participates; the other two nodes are announced in parallel so no peer waits
// on a peer that has not been told to start.
func (n *Node) CreateWallet(ctx context.Context, req *DKGRequest) (*WalletResult, error) {
	if req == nil {
		return nil, errors.New("engine: nil DKG request")
	}
	parties := req.Parties
	if parties <= 0 {
		parties = 3
	}
	if parties != 3 {
		return nil, fmt.Errorf("engine: dev wallet creation supports exactly 3 parties, got %d", parties)
	}
	chainID := req.ChainID
	if chainID == 0 {
		chainID = n.cfg.ChainID
	}
	if err := n.signingGate(chainID, ""); err != nil {
		return nil, err
	}

	walletID := req.WalletID
	if walletID == "" {
		walletID = "wal-" + engineRandomHex(7)
	}
	seed := req.Seed
	var seedBytes []byte
	if seed != "" {
		var err error
		seedBytes, err = hex.DecodeString(seed)
		if err != nil {
			return nil, fmt.Errorf("engine: invalid roster seed: %w", err)
		}
	} else {
		seedBytes = make([]byte, 32)
		if _, err := rand.Read(seedBytes); err != nil {
			return nil, err
		}
		seed = hex.EncodeToString(seedBytes)
	}

	roster, err := engineTSS.DeriveSortedPartyIDs(seedBytes, parties)
	if err != nil {
		return nil, err
	}

	sessionID := walletID + "-dkg-" + engineRandomHex(4)
	ownIdx := nodeIndex(n.cfg.NodeID)
	if ownIdx < 0 {
		return nil, fmt.Errorf("engine: node id %q not a known peer", n.cfg.NodeID)
	}
	om := rosterOwnerMap(roster)

	ann := &DKGAnnounce{
		SessionID: sessionID,
		WalletID:  walletID,
		NodeID:    n.cfg.NodeID,
		Seed:      seed,
		Parties:   parties,
		Threshold: 2,
		ChainID:   chainID,
	}

	// 1. Register + run the local keygen party.
	gather := make(chan *KeygenResult, 3)
	errG := make(chan error, 1)
	go n.runLocalKeygen(ctx, ann, roster, ownIdx, om, gather, errG)

	// 2. Announce to the two remote nodes in parallel.
	var wg sync.WaitGroup
	var mu sync.Mutex
	var annErrs []error
	for _, nodeID := range nodes {
		if nodeID == n.cfg.NodeID {
			continue
		}
		wg.Add(1)
		go func(nid string) {
			defer wg.Done()
			var res KeygenResult
			if err := n.ring.PostJSON(ctx, nid, "/api/v1/peer/keygen/"+sessionID+"/announce", ann, &res); err != nil {
				mu.Lock()
				annErrs = append(annErrs, fmt.Errorf("%s: %w", nid, err))
				mu.Unlock()
			} else {
				mu.Lock()
				gather <- &res
				mu.Unlock()
			}
		}(nodeID)
	}
	wg.Wait()

	// 3. Wait for the local party.
	select {
	case err := <-errG:
		if err != nil {
			return nil, err
		}
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	if len(annErrs) > 0 {
		return nil, fmt.Errorf("engine: DKG failed: %s", annErrs[0])
	}

	// 4. Collect results (local one comes from runLocalKeygen's gather).
	results := make([]*KeygenResult, 0, 3)
	for len(results) < 3 {
		select {
		case r := <-gather:
			results = append(results, r)
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	ref := results[0]
	for _, r := range results[1:] {
		if r.Address != ref.Address || r.PublicKey != ref.PublicKey {
			return nil, fmt.Errorf("engine: DKG parties disagree on the shared public key (addr %s vs %s): aborting, no share trusted",
				ref.Address, r.Address)
		}
	}

	return &WalletResult{
		WalletID:  walletID,
		Address:   ref.Address,
		PublicKey: ref.PublicKey,
		ChainID:   chainID,
		Threshold: 2,
		Parties:   parties,
	}, nil
}

// runLocalKeygen executes this node's keygen party and persists its share.
func (n *Node) runLocalKeygen(ctx context.Context, ann *DKGAnnounce, roster tss.SortedPartyIDs, ownIdx int, om map[string]string, gather chan<- *KeygenResult, errG chan<- error) {
	participant, err := n.runKeygenParticipant(ctx, ann, roster, ownIdx, om)
	if err != nil {
		errG <- err
		return
	}
	gather <- participant
	errG <- nil
}

// RunKeygenAnnounce handles an inbound keygen announce: run the local party,
// persist the share, and report the derived result back to the coordinator.
func (n *Node) RunKeygenAnnounce(ctx context.Context, ann *DKGAnnounce) (*KeygenResult, error) {
	if ann == nil {
		return nil, errors.New("engine: nil keygen announce")
	}
	if err := n.signingGate(ann.ChainID, ""); err != nil {
		return nil, err
	}
	seedBytes, err := hex.DecodeString(ann.Seed)
	if err != nil {
		return nil, fmt.Errorf("engine: announce seed: %w", err)
	}
	roster, err := engineTSS.DeriveSortedPartyIDs(seedBytes, ann.Parties)
	if err != nil {
		return nil, err
	}
	ownIdx := nodeIndex(n.cfg.NodeID)
	if ownIdx < 0 || ownIdx >= len(roster) {
		return nil, fmt.Errorf("engine: no party position for node %q", n.cfg.NodeID)
	}
	return n.runKeygenParticipant(ctx, ann, roster, ownIdx, rosterOwnerMap(roster))
}

// runKeygenParticipant runs one keygen party, persists the node's own
// encrypted share + wallet metadata, and zeroes the plaintext save data.
func (n *Node) runKeygenParticipant(ctx context.Context, ann *DKGAnnounce, roster tss.SortedPartyIDs, ownIdx int, om map[string]string) (*KeygenResult, error) {
	wire := n.newSessionWire(kindDKG, ann.SessionID, ann.WalletID)
	wire.ownerOf = om

	s, sctx, err := n.newParticipant(ctx, kindDKG, ann.SessionID, ann.WalletID, om)
	if err != nil {
		return nil, err
	}
	defer n.unregisterSession(s)

	pp := n.preparams
	sd, err := engineTSS.RunKeygenParty(sctx, roster, ownIdx, pp, wire, s.inbox, n.log)
	if err != nil {
		s.result <- err
		return nil, err
	}

	pubKeyHex, address, err := derivePartyAddress(sd)
	if err != nil {
		return nil, err
	}

	shareBlob, err := engineTSS.SerializeSaveData(sd)
	if err != nil {
		return nil, err
	}
	encBlob, err := n.encryptShare(shareBlob)
	if err != nil {
		return nil, err
	}

	wallet := &store.Wallet{
		WalletID:  ann.WalletID,
		Address:   address,
		PublicKey: pubKeyHex,
		Threshold: ann.Threshold,
		Parties:   ann.Parties,
		ChainID:   ann.ChainID,
		Seed:      ann.Seed,
		Status:    store.StatusReady,
	}
	if err := n.persistShare(ann.WalletID, wallet, sd, ownIdx, encBlob, 1); err != nil {
		return nil, err
	}

	s.result <- nil
	return &KeygenResult{
		SessionID:  ann.SessionID,
		WalletID:   ann.WalletID,
		NodeID:     n.cfg.NodeID,
		PartyIndex: ownIdx,
		PublicKey:  pubKeyHex,
		Address:    address,
	}, nil
}