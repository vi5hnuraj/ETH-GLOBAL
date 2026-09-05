package tss

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"

	"github.com/bnb-chain/tss-lib/v3/common"
	"github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
	"github.com/bnb-chain/tss-lib/v3/ecdsa/signing"
	"github.com/bnb-chain/tss-lib/v3/tss"
)

// RunSignParty executes ONE threshold-signing party with this node's own share.
// cohort is the sorted 2-party set participating in this signing session;
// myIndex is the position of this node within that cohort. The parties exchange
// protocol messages over Wire; a node that is absent contributes nothing, so a
// single node can never produce a signature alone.
func RunSignParty(
	ctx context.Context,
	cohort tss.SortedPartyIDs,
	myIndex int,
	sd *keygen.LocalPartySaveData,
	msgInt *big.Int,
	wire Wire,
	inbox <-chan *SessionMessage,
	logger *slog.Logger,
) (*common.SignatureData, error) {
	if len(cohort) < 2 {
		return nil, fmt.Errorf("sign: a 2-of-3 signing cohort needs 2 parties, got %d", len(cohort))
	}
	if myIndex < 0 || myIndex >= len(cohort) {
		return nil, fmt.Errorf("sign: own party index %d out of cohort range", myIndex)
	}
	if sd == nil {
		return nil, fmt.Errorf("sign: nil local save data (share missing)")
	}

	p2pCtx := tss.NewPeerContext(cohort)
	params := tss.NewParameters(tss.S256(), p2pCtx, cohort[myIndex], len(cohort), 1)

	outCh := make(chan tss.Message, 512)
	endCh := make(chan *common.SignatureData, 1)
	errCh := make(chan *tss.Error, 1)

	localParty := signing.NewLocalParty(msgInt, params, *sd, outCh, endCh)

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// outbound drain
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
					logger.Warn("sign: wire bytes failed", slog.Any("error", err))
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
					logger.Error("sign: send message failed", slog.Any("error", err))
					cancel()
				}
			}
		}
	}()

	// inbound feed
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
				sender := resolveParty(cohort, pm.From)
				if sender == nil {
					logger.Error("sign: message from unknown party", slog.String("from", pm.From))
					errCh <- tss.NewError(fmt.Errorf("unknown sender %s", pm.From), "sign", 0, cohort[myIndex])
					return
				}
				raw, err := pm.Payload()
				if err != nil {
					errCh <- tss.NewError(err, "sign", 0, cohort[myIndex])
					return
				}
				parsed, err := tss.ParseWireMessage(raw, sender, pm.IsBroadcast)
				if err != nil {
					errCh <- tss.NewError(err, "sign", 0, cohort[myIndex])
					return
				}
				if _, err := localParty.Update(parsed); err != nil {
					errCh <- tss.NewError(err, "sign", 0, cohort[myIndex])
					return
				}
			}
		}
	}()

	if err := localParty.Start(); err != nil {
		return nil, fmt.Errorf("sign: start party: %w", err)
	}

	select {
	case err := <-errCh:
		return nil, fmt.Errorf("signing session failed: %w", err)
	case sig := <-endCh:
		if sig == nil {
			return nil, fmt.Errorf("sign: nil signature data")
		}
		return sig, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("signing cancelled: %w", ctx.Err())
	}
}