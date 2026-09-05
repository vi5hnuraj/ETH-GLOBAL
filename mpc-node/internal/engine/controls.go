package engine

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// ControlState is the mutable control-plane state an operator may query.
type ControlState struct {
	NodeID                  string   `json:"nodeId"`
	SigningPaused           bool     `json:"signingPaused"`
	MainnetBroadcastEnabled bool     `json:"mainnetBroadcastEnabled"`
	AllowedChainIDs         []string `json:"allowedChainIds"`
	MainnetApprovalRequired bool     `json:"mainnetApprovalRequired"`
}

// GetControls returns a snapshot of the control plane.
func (n *Node) GetControls(_ context.Context) (*ControlState, error) {
	c := n.Controls()
	return &ControlState{
		NodeID:                  c["nodeId"].(string),
		SigningPaused:           c["signingPaused"].(bool),
		MainnetBroadcastEnabled: c["mainnetBroadcastEnabled"].(bool),
		AllowedChainIDs:         c["allowedChainIds"].([]string),
		MainnetApprovalRequired: n.cfg.MainnetApprovalToken != "",
	}, nil
}

// SetSigningPaused toggles the signing gate.
func (n *Node) SetSigningPaused(ctx context.Context, paused bool) error {
	// Persist the gate to local node state so it survives restart.
	st, err := n.store.GetState()
	if err != nil {
		return err
	}
	if paused {
		st.Epoch++
	}
	st.SigningPaused = paused
	st.LastUpdated = time.Now().UTC()
	if err := n.store.SaveState(st); err != nil {
		return err
	}
	n.SetPaused(paused)
	return nil
}

// PauseAll instructs every reachable peer to pause signing.
func (n *Node) PauseAll(ctx context.Context) error {
	var errs []string
	for _, nodeID := range nodes {
		if nodeID == n.cfg.NodeID {
			n.SetPaused(true)
			continue
		}
		if err := n.ring.PostJSON(ctx, nodeID, "/api/v1/peer/control/pause", struct {
			Paused bool `json:"paused"`
		}{true}, nil); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", nodeID, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("engine: pause-all partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

// TransferToSelf is a reserved helper for recovery tests (also serves as a
// no-op when unused). It is defined to keep the recovery surface explicit.
func (n *Node) TransferToSelf(_ context.Context, _ string) error {
	return nil
}
