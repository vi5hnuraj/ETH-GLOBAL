package engine

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"

	"github.com/globalpay/mpc-node/internal/tss"

	tssCommon "github.com/bnb-chain/tss-lib/v3/common"
	tsslib "github.com/bnb-chain/tss-lib/v3/tss"
)

// SignRequest is a threshold-sign request issued by the API layer.
// Digest is the 32-byte hexadecimal keccak-256 hash to sign (the tx hash).
type SignRequest struct {
	WalletID  string `json:"walletId"`
	Digest    string `json:"digest"`
	ChainID   uint64 `json:"chainId"`
	SessionID string `json:"sessionId,omitempty"`
}

// SignAnnounce is sent to a cohort peer to co-ordinate the 2-party session.
// CohortIDs must contain exactly the two party ids of the cohort, in the
// coordinator-chosen order; both participants construct the identical
// sorted cohort from their local save data.
type SignAnnounce struct {
	SessionID string   `json:"sessionId"`
	WalletID  string   `json:"walletId"`
	Digest    string   `json:"digest"`
	ChainID   uint64   `json:"chainId"`
	NodeID    string   `json:"nodeId"`
	CohortIDs []string `json:"cohortIds"`
}

// SignResult carries the completed threshold signature.
type SignResult struct {
	SessionID string `json:"sessionId"`
	WalletID  string `json:"walletId"`
	Digest    string `json:"digest,omitempty"` // digest the signature was produced over
	NodeID    string `json:"nodeId"`
	Signature string `json:"signature"` // 65-byte hex R||S||V
	PublicKey string `json:"publicKey"`
}

// Sign runs a 2-of-3 threshold signature for walletID over the digest. The
// coordinator node is always one of the two signers; the peer is a healthy
// node that holds a share of the same wallet. The exact cohort is sent to the
// peer so both parties agree on the party set.
func (n *Node) Sign(ctx context.Context, req *SignRequest) (*SignResult, error) {
	if req == nil || req.WalletID == "" || req.Digest == "" {
		return nil, errors.New("engine: sign request requires walletId and digest")
	}
	chainID := req.ChainID
	if chainID == 0 {
		chainID = n.cfg.ChainID
	}
	if err := n.signingGate(chainID, ""); err != nil {
		return nil, err
	}
	if _, err := hex.DecodeString(trim0x(req.Digest)); err != nil {
		return nil, fmt.Errorf("engine: digest is not hex: %w", err)
	}

	peer, myRosterIdx, peerRosterIdx, err := n.pickSigningPeer(ctx, req.WalletID)
	if err != nil {
		return nil, err
	}
	_ = peerRosterIdx

	roster := n.reconstructRoster(req.WalletID)
	if roster == nil {
		return nil, fmt.Errorf("engine: cannot reconstruct roster for wallet %s", req.WalletID)
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = req.WalletID + "-sign-" + engineRandomHex(4)
	}

	n.mu.Lock()
	if cached, ok := n.completedSigs[sessionID]; ok && cached.Digest == req.Digest {
		n.mu.Unlock()
		return cached, nil
	}
	n.mu.Unlock()
	ann := &SignAnnounce{
		SessionID: sessionID,
		WalletID:  req.WalletID,
		Digest:    req.Digest,
		ChainID:   chainID,
		NodeID:    n.cfg.NodeID,
		CohortIDs: []string{roster[myRosterIdx].Id, roster[peerRosterIdx].Id},
	}

	peerCh := make(chan error, 1)
	go func() {
		var remote SignResult
		if err := n.ring.PostJSON(ctx, peer, "/api/v1/peer/sign/"+sessionID+"/announce", ann, &remote); err != nil {
			peerCh <- fmt.Errorf("%s: %w", peer, err)
			return
		}
		if remote.Signature == "" {
			peerCh <- errors.New("engine: peer returned no signature")
			return
		}
		peerCh <- nil
	}()

	local, err := n.runSigningParticipant(ctx, ann)
	if err != nil {
		return nil, err
	}
	if err := <-peerCh; err != nil {
		return nil, err
	}

	n.mu.Lock()
	local.Digest = req.Digest
	n.completedSigs[sessionID] = local
	n.mu.Unlock()

	return local, nil
}

// RunSignAnnounce handles an inbound sign announce and returns this party's
// signature result. The coordinator compares both signatures.
func (n *Node) RunSignAnnounce(ctx context.Context, ann *SignAnnounce) (*SignResult, error) {
	if ann == nil {
		return nil, errors.New("engine: nil sign announce")
	}
	if err := n.signingGate(ann.ChainID, ""); err != nil {
		return nil, err
	}
	return n.runSigningParticipant(ctx, ann)
}

// reconstructRoster rebuilds the sorted roster from this node's share.
func (n *Node) reconstructRoster(walletID string) tsslib.SortedPartyIDs {
	_, raw, err := n.loadShareData(walletID)
	if err != nil {
		return nil
	}
	defer zeroBytes(raw)
	sd, err := tss.DeserializeSaveData(raw)
	if err != nil {
		return nil
	}
	return tss.ReconstructSortedPartyIDs(sd.Ks)
}

// runSigningParticipant runs one signing party with this node's own share.
func (n *Node) runSigningParticipant(ctx context.Context, ann *SignAnnounce) (*SignResult, error) {
	sh, raw, err := n.loadShareData(ann.WalletID)
	if err != nil {
		return nil, fmt.Errorf("engine: no usable local share for %s: %w", ann.WalletID, err)
	}
	sd, err := tss.DeserializeSaveData(raw)
	if err != nil {
		return nil, err
	}
	zeroBytes(raw)

	roster := tss.ReconstructSortedPartyIDs(sd.Ks)
	if len(ann.CohortIDs) != 2 {
		return nil, fmt.Errorf("engine: sign announce must carry exactly 2 cohort ids, got %d", len(ann.CohortIDs))
	}
	cohort := make(tsslib.UnSortedPartyIDs, 0, 2)
	for _, id := range ann.CohortIDs {
		p := findParty(roster, id)
		if p == nil {
			return nil, fmt.Errorf("engine: cohort party %q not in local roster", id)
		}
		cohort = append(cohort, p)
	}
	sorted := tsslib.SortPartyIDs(cohort)

	myCohortIdx := -1
	for i, p := range sorted {
		if p.Id == roster[nodeIndex(n.cfg.NodeID)].Id {
			myCohortIdx = i
			break
		}
	}
	if myCohortIdx < 0 {
		return nil, fmt.Errorf("engine: own party not part of the cohort")
	}

	digestBytes, _ := hex.DecodeString(trim0x(ann.Digest))
	msgInt := new(big.Int).SetBytes(digestBytes)

	wire := n.newSessionWire(kindSign, ann.SessionID, ann.WalletID)
	wire.ownerOf = make(map[string]string)
	for _, p := range sorted {
		wire.ownerOf[p.Id] = partyOwner(roster, p)
	}

	s, sctx, err := n.newParticipant(ctx, kindSign, ann.SessionID, ann.WalletID, wire.ownerOf)
	if err != nil {
		return nil, err
	}
	defer n.unregisterSession(s)

	sig, err := tss.RunSignParty(sctx, sorted, myCohortIdx, sd, msgInt, wire, s.inbox, n.log)
	if err != nil {
		return nil, err
	}

	return &SignResult{
		SessionID: ann.SessionID,
		WalletID:  ann.WalletID,
		Digest:    ann.Digest,
		NodeID:    n.cfg.NodeID,
		Signature: signatureToHex(sig),
		PublicKey: sh.PublicKey,
	}, nil
}

func findParty(roster tsslib.SortedPartyIDs, id string) *tsslib.PartyID {
	for _, p := range roster {
		if p.Id == id {
			return p
		}
	}
	return nil
}

// partyOwner returns the node that owns a roster party (node-a owns roster[0]).
func partyOwner(roster tsslib.SortedPartyIDs, target *tsslib.PartyID) string {
	for i, p := range roster {
		if p.Id == target.Id {
			if i < len(nodes) {
				return nodes[i]
			}
		}
	}
	return ""
}

func signatureToHex(sig *tssCommon.SignatureData) string {
	if sig == nil {
		return ""
	}
	v := byte(0)
	if len(sig.SignatureRecovery) > 0 {
		v = sig.SignatureRecovery[0]
	}
	out := make([]byte, 0, 65)
	out = append(out, sig.R...)
	out = append(out, sig.S...)
	out = append(out, v)
	if len(out) != 65 {
		return ""
	}
	return "0x" + hex.EncodeToString(out)
}

func zeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

func trim0x(s string) string {
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		return s[2:]
	}
	return s
}

// pickSigningPeer finds a healthy node (other than self) that holds a share and
// returns its roster index alongside.
func (n *Node) pickSigningPeer(ctx context.Context, walletID string) (string, int, int, error) {
	roster := n.reconstructRoster(walletID)
	if roster == nil {
		return "", -1, -1, fmt.Errorf("engine: no local roster for wallet %s", walletID)
	}
	myRosterIdx := nodeIndex(n.cfg.NodeID)
	for _, nodeID := range nodes {
		if nodeID == n.cfg.NodeID {
			continue
		}
		if n.ring.PingHealth(ctx, nodeID) != nil {
			continue
		}
		if !n.peerHasWallet(ctx, nodeID, walletID) {
			continue
		}
		peerRosterIdx := nodeIndex(nodeID)
		if peerRosterIdx < 0 || peerRosterIdx >= len(roster) {
			continue
		}
		return nodeID, myRosterIdx, peerRosterIdx, nil
	}
	return "", -1, -1, fmt.Errorf("engine: no healthy peer holds a share for wallet %s", walletID)
}

func (n *Node) peerHasWallet(ctx context.Context, nodeID, walletID string) bool {
	var res struct {
		WalletID string `json:"walletId"`
	}
	return n.ring.PostJSON(ctx, nodeID, "/api/v1/peer/wallet/"+walletID, struct{}{}, &res) == nil && res.WalletID != ""
}