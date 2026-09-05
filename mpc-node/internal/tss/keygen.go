package tss

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
	"github.com/bnb-chain/tss-lib/v3/tss"
)

// RunKeygenParty executes ONE keygen party in this process. It exchanges
// protocol messages with the other parties over the supplied Wire and consumes
// inbound messages from inbox. On success it returns this node's LocalPartySaveData
// (which the caller must persist immediately, encrypted, and zero afterwards).
func RunKeygenParty(
	ctx context.Context,
	roster tss.SortedPartyIDs,
	myIndex int,
	preparams *keygen.LocalPreParams,
	wire Wire,
	inbox <-chan *SessionMessage,
	logger *slog.Logger,
) (*keygen.LocalPartySaveData, error) {
	if myIndex < 0 || myIndex >= len(roster) {
		return nil, fmt.Errorf("keygen: own party index %d out of range", myIndex)
	}
	p2pCtx := tss.NewPeerContext(roster)
	// tss-lib threshold t = k-1. For a 2-of-3 wallet (parties=3, threshold=2)
	// the DKG is run as t=1 with all 3 parties.
	params := tss.NewParameters(tss.S256(), p2pCtx, roster[myIndex], len(roster), 1)

	outCh := make(chan tss.Message, 512)
	endCh := make(chan *keygen.LocalPartySaveData, 1)
	errCh := make(chan *tss.Error, 1)

	var localParty tss.Party
	if preparams != nil {
		localParty = keygen.NewLocalParty(params, outCh, endCh, *preparams)
	} else {
		localParty = keygen.NewLocalParty(params, outCh, endCh)
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// outbound drain: serialize every message the party emits and hand it to Wire.
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
					logger.Warn("keygen: wire bytes failed", slog.Any("error", err))
					continue
				}
				toIDs := make([]string, 0)
				if msg.GetTo() != nil {
					for _, d := range msg.GetTo() {
						toIDs = append(toIDs, d.Id)
					}
				}
				sm := NewSessionMessage("", "", msg.GetFrom().Id, toIDs, msg.GetTo() == nil, 0, bz)
				if err := wire.SendMessage(ctx, sm); err != nil {
					logger.Error("keygen: send message failed", slog.Any("error", err))
					cancel()
				}
			}
		}
	}()

	// inbound feed: parse incoming wire messages into this party.
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
				sender := resolveParty(roster, pm.From)
				if sender == nil {
					logger.Error("keygen: message from unknown party", slog.String("from", pm.From))
					errCh <- tss.NewError(fmt.Errorf("unknown sender %s", pm.From), "keygen", 0, roster[myIndex])
					return
				}
				raw, err := pm.Payload()
				if err != nil {
					errCh <- tss.NewError(err, "keygen", 0, roster[myIndex])
					return
				}
				parsed, err := tss.ParseWireMessage(raw, sender, pm.IsBroadcast)
				if err != nil {
					errCh <- tss.NewError(err, "keygen", 0, roster[myIndex])
					return
				}
				if ok, err := localParty.Update(parsed); err != nil || (ok && pm.Round == 0) {
					if err != nil {
						errCh <- tss.NewError(err, "keygen", 0, roster[myIndex])
						return
					}
				}
			}
		}
	}()

	if err := localParty.Start(); err != nil {
		return nil, fmt.Errorf("keygen: start party: %w", err)
	}

	select {
	case err := <-errCh:
		return nil, fmt.Errorf("keygen failed: %w", err)
	case sd := <-endCh:
		if sd == nil {
			return nil, fmt.Errorf("keygen: nil save data")
		}
		return sd, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("keygen cancelled: %w", ctx.Err())
	case <-time.After(20 * time.Minute):
		return nil, fmt.Errorf("keygen timed out after 20 minutes")
	}
}

func resolveParty(roster tss.SortedPartyIDs, id string) *tss.PartyID {
	for _, p := range roster {
		if p.Id == id {
			return p
		}
	}
	return nil
}