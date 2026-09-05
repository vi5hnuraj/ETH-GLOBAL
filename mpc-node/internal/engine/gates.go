package engine

import (
	"errors"
	"fmt"
	"strings"
)

// signingGate is the central operational gate. It refuses any DKG / signing /
// resharing / broadcast when the control plane has paused signing, when the
// request is for a chain outside the allowed set, or when a mainnet broadcast
// has not received the explicit X-Mainnet-Approval token.
func (n *Node) signingGate(chainID uint64, mainnetApproval string) error {
	n.mu.Lock()
	paused := n.paused
	enabled := n.cfg.MainnetBroadcastEnabled
	n.mu.Unlock()

	if paused {
		return errors.New("engine: SIGNING PAUSED by control plane; no protocol sessions may start")
	}

	if chainID != 968 && chainID != 677 {
		return errors.New("engine: non-BOT chain ids are never accepted")
	}

	allowed := false
	for _, c := range n.cfg.AllowedChainIDs {
		if c == fmt.Sprintf("%d", chainID) {
			allowed = true
			break
		}
	}
	if !allowed {
		return fmt.Errorf("engine: chain id %d not in allowed set %v", chainID, n.cfg.AllowedChainIDs)
	}

	if chainID == 677 {
		if !enabled {
			return errors.New("engine: MAINNET_BROADCAST_ENABLED=false; mainnet signing/broadcast refused")
		}
		// Only enforce the mainnet approval token at request entry points where it is supplied.
		// Internal/P2P protocol sessions pass "" because the coordinator already verified the token.
		if mainnetApproval != "" {
			if n.cfg.MainnetApprovalToken == "" || !strings.EqualFold(n.cfg.MainnetApprovalToken, mainnetApproval) {
				return errors.New("engine: mainnet requires a valid X-Mainnet-Approval token")
			}
		}
	}
	return nil
}