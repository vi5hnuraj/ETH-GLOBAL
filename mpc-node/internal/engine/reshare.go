package engine

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"

	"github.com/globalpay/mpc-node/internal/store"
	"github.com/globalpay/mpc-node/internal/tss"

	tssKeygen "github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
	tssResharing "github.com/bnb-chain/tss-lib/v3/ecdsa/resharing"
	tsslib "github.com/bnb-chain/tss-lib/v3/tss"
)

// ReshareRequest triggers a 3-node resharing that produces a fresh key version
// while preserving the wallet's public address.
type ReshareRequest struct {
	WalletID string `json:"walletId"`
	ChainID  uint64 `json:"chainId"`
}

// ReshareAnnounce tells a peer to run its old+new committee resharing party.
type ReshareAnnounce struct {
	SessionID string `json:"sessionId"`
	WalletID  string `json:"walletId"`
	ChainID   uint64 `json:"chainId"`
	NodeID    string `json:"nodeId"`
	Seed      string `json:"seed"`
	OldVersion int    `json:"oldVersion"`
	NewVersion int    `json:"newVersion"`
}

// ReshareResult reports a node's participation outcome.
type ReshareResult struct {
	SessionID string `json:"sessionId"`
	WalletID  string `json:"walletId"`
	NodeID    string `json:"nodeId"`
	Address   string `json:"address"`
	NewVersion int    `json:"newVersion"`
}

// Reshare drives a full 3-node resharing. Every node keeps its own share (the
// address is preserved) and the version is bumped. Used by rotation/recovery.
func (n *Node) Reshare(ctx context.Context, req *ReshareRequest) (*ReshareResult, error) {
	if req == nil || req.WalletID == "" {
		return nil, errors.New("engine: reshare requires walletId")
	}
	w, err := n.store.GetWallet(req.WalletID)
	if err != nil {
		return nil, err
	}
	chainID := req.ChainID
	if chainID == 0 {
		chainID = w.ChainID
	}
	if err := n.signingGate(chainID, ""); err != nil {
		return nil, err
	}

	sh, err := n.store.CurrentShare(req.WalletID)
	if err != nil {
		return nil, err
	}
	newVersion := sh.Version + 1
	sessionID := req.WalletID + "-reshare-" + engineRandomHex(4)

	ann := &ReshareAnnounce{
		SessionID:  sessionID,
		WalletID:   req.WalletID,
		ChainID:    chainID,
		NodeID:     n.cfg.NodeID,
		Seed:       w.Seed,
		OldVersion: sh.Version,
		NewVersion: newVersion,
	}

	gather := make(chan *ReshareResult, 3)
	errG := make(chan error, 1)

	go n.runLocalReshare(ctx, ann, gather, errG)

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
			var res ReshareResult
			if err := n.ring.PostJSON(ctx, nid, "/api/v1/peer/reshare/"+sessionID+"/announce", ann, &res); err != nil {
				mu.Lock()
				annErrs = append(annErrs, fmt.Errorf("%s: %w", nid, err))
				mu.Unlock()
				return
			}
			mu.Lock()
			gather <- &res
			mu.Unlock()
		}(nodeID)
	}
	wg.Wait()

	select {
	case err := <-errG:
		if err != nil {
			return nil, err
		}
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if len(annErrs) > 0 {
		return nil, fmt.Errorf("engine: reshare failed: %s", annErrs[0])
	}

	results := make([]*ReshareResult, 0, 3)
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
		if !sameAddress(r.Address, ref.Address) {
			return nil, fmt.Errorf("engine: reshare parties disagree on the preserved address: %s vs %s", ref.Address, r.Address)
		}
	}
	return ref, nil
}

// RunReshareAnnounce handles an inbound reshare announce.
func (n *Node) RunReshareAnnounce(ctx context.Context, ann *ReshareAnnounce) (*ReshareResult, error) {
	if ann == nil {
		return nil, errors.New("engine: nil reshare announce")
	}
	if err := n.signingGate(ann.ChainID, ""); err != nil {
		return nil, err
	}
	return n.runLocalReshare(ctx, ann, nil, nil)
}

// runLocalReshare runs this node's old+new committee resharing party and
// persists the new encrypted share under the new version.
func (n *Node) runLocalReshare(ctx context.Context, ann *ReshareAnnounce, gather chan<- *ReshareResult, errG chan<- error) (*ReshareResult, error) {
	_, raw, err := n.loadShareData(ann.WalletID)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}
	oldSd, err := tss.DeserializeSaveData(raw)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}

	seedBytes, err := hex.DecodeString(ann.Seed)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, fmt.Errorf("engine: reshare seed: %w", err))
	}

	// Old and new committees are the same 3 roster parties.
	newRoster, err := tss.DeriveSortedPartyIDs(seedBytes, 3)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}
	oldRoster := tss.ReconstructSortedPartyIDs(oldSd.Ks)

	myNewIdx := nodeIndex(n.cfg.NodeID)
	oldCtx := tsslib.NewPeerContext(oldRoster)
	newCtx := tsslib.NewPeerContext(newRoster)

	params := tsslib.NewReSharingParameters(tsslib.S256(), oldCtx, newCtx, newRoster[myNewIdx], 3, 1, 3, 1)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}
	// Bind the session so messages can't be replayed into another reshare.
	params.SetSessionNonce(bigFromSeed(ann.SessionID))

	wire := n.newSessionWire(kindReshare, ann.SessionID, ann.WalletID)
	wire.ownerOf = rosterOwnerMap(newRoster)

	s, sctx, err := n.newParticipant(ctx, kindReshare, ann.SessionID, ann.WalletID, wire.ownerOf)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}
	defer n.unregisterSession(s)

	newSd, err := n.runReshareParty(sctx, params, oldSd, wire, s.inbox)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}

	pubKeyHex, address, err := derivePartyAddress(newSd)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}

	shareBlob, err := tss.SerializeSaveData(newSd)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}
	encBlob, err := n.encryptShare(shareBlob)
	if err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}

	wallet := &store.Wallet{
		WalletID:  ann.WalletID,
		Address:   address,
		PublicKey: pubKeyHex,
		Threshold: 2,
		Parties:   3,
		ChainID:   ann.ChainID,
		Seed:      ann.Seed,
		Status:    store.StatusReady,
	}
	if err := n.persistShare(ann.WalletID, wallet, newSd, myNewIdx, encBlob, ann.NewVersion); err != nil {
		return n.reshareOutcome(ctx, gather, errG, nil, err)
	}

	res := &ReshareResult{
		SessionID:  ann.SessionID,
		WalletID:   ann.WalletID,
		NodeID:     n.cfg.NodeID,
		Address:    address,
		NewVersion: ann.NewVersion,
	}
	if gather != nil {
		gather <- res
	}
	if errG != nil {
		errG <- nil
	}
	return res, nil
}

func (n *Node) reshareOutcome(ctx context.Context, gather chan<- *ReshareResult, errG chan<- error, res *ReshareResult, err error) (*ReshareResult, error) {
	if errG != nil && err != nil {
		select {
		case errG <- err:
		default:
		}
	}
	return res, err
}

// runReshareParty executes one resharing party (mirrors the keygen shape).
func (n *Node) runReshareParty(ctx context.Context, params *tsslib.ReSharingParameters, oldSd *tssKeygen.LocalPartySaveData, wire tss.Wire, inbox <-chan *tss.SessionMessage) (*tssKeygen.LocalPartySaveData, error) {
	outCh := make(chan tsslib.Message, 512)
	endCh := make(chan *tssKeygen.LocalPartySaveData, 1)
	errCh := make(chan *tsslib.Error, 1)

	localParty := tssResharing.NewLocalParty(params, *oldSd, outCh, endCh)

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	go func() {
		for {
			select {
			case <-runCtx.Done():
				return
			case msg, ok := <-outCh:
				if !ok {
					return
				}
				bz, _, err := msg.WireBytes()
				if err != nil {
					n.log.Warn("reshare: wire bytes failed", "error", err)
					continue
				}
				toIDs := []string{}
				if msg.GetTo() != nil {
					for _, d := range msg.GetTo() {
						toIDs = append(toIDs, d.Id)
					}
				}
				sm := tss.NewSessionMessage("", "", msg.GetFrom().Id, toIDs, msg.GetTo() == nil, 0, bz)
				if err := wire.SendMessage(ctx, sm); err != nil {
					n.log.Error("reshare: send failed", "error", err)
					cancel()
				}
			}
		}
	}()

	go func() {
		defer cancel()
		for {
			select {
			case <-runCtx.Done():
				return
			case pm, ok := <-inbox:
				if !ok {
					return
				}
				raw, err := pm.Payload()
				if err != nil {
					errCh <- tsslib.NewError(err, "reshare", 0, params.PartyID())
					return
				}
				sender := resolveParty(params.OldParties().IDs(), pm.From)
				if sender == nil {
					sender = resolveParty(params.NewParties().IDs(), pm.From)
				}
				if sender == nil {
					errCh <- tsslib.NewError(fmt.Errorf("unknown reshare sender %s", pm.From), "reshare", 0, params.PartyID())
					return
				}
				parsed, err := tsslib.ParseWireMessage(raw, sender, pm.IsBroadcast)
				if err != nil {
					errCh <- tsslib.NewError(err, "reshare", 0, params.PartyID())
					return
				}
				if _, err := localParty.Update(parsed); err != nil {
					errCh <- err
					return
				}
			}
		}
	}()

	if err := localParty.Start(); err != nil {
		return nil, fmt.Errorf("reshare: start: %w", err)
	}

	select {
	case terr := <-errCh:
		return nil, fmt.Errorf("reshare failed: %w", terr)
	case sd := <-endCh:
		if sd == nil {
			return nil, errors.New("reshare: nil save data")
		}
		return sd, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("reshare cancelled: %w", ctx.Err())
	}
}

func resolveParty(ids tsslib.SortedPartyIDs, id string) *tsslib.PartyID {
	for _, p := range ids {
		if p.Id == id {
			return p
		}
	}
	return nil
}

func bigFromSeed(seed string) *big.Int {
	return new(big.Int).SetBytes([]byte(seed))
}

func sameAddress(a, b string) bool {
	if len(a) >= 2 && a[:2] == "0x" {
		a = a[2:]
	}
	if len(b) >= 2 && b[:2] == "0x" {
		b = b[2:]
	}
	return a == b
}