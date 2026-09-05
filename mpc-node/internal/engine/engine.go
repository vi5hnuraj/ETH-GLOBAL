// Package engine is the distributed MPC node engine. Each running node holds at
// most ONE key share per wallet and runs at most ONE tss-lib party per active
// session. Protocol messages are exchanged over the authenticated peer ring so
// that no single node can reconstruct the private key or sign alone.
package engine

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/globalpay/mpc-node/internal/botchain"
	"github.com/globalpay/mpc-node/internal/config"
	"github.com/globalpay/mpc-node/internal/keys"
	"github.com/globalpay/mpc-node/internal/mtls"
	"github.com/globalpay/mpc-node/internal/peers"
	"github.com/globalpay/mpc-node/internal/store"
	"github.com/globalpay/mpc-node/internal/tss"

	tssKeygen "github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
	tsslib "github.com/bnb-chain/tss-lib/v3/tss"
)

const (
	kindDKG     = "keygen"
	kindSign    = "sign"
	kindReshare = "reshare"
)

// Node is a single MPC node process participating in threshold sessions.
type Node struct {
	mu           sync.Mutex
	cfg          *config.DevConfig
	log          *slog.Logger
	store        *store.Store
	devKey       []byte
	bot          *botchain.Client
	ring         *peers.RingClient
	peerAuth     *peers.Verifier
	preparams    *tssKeygen.LocalPreParams
	networkNonce map[string]uint64 // wallet -> last signing counter
	sessions     map[string]*localSession
	pending      map[string][]*tss.SessionMessage // unregistered-session message buffer
	paused       bool
	completedSigs map[string]*SignResult
}

// New constructs a dev/local node.
func New(ctx context.Context, cfg *config.DevConfig, log *slog.Logger) (*Node, error) {
	bot, err := botchain.Dial(cfg.RPCURL, cfg.ChainID)
	if err != nil {
		return nil, fmt.Errorf("engine: botchain dial: %w", err)
	}
	st, err := store.New(cfg.DataDir, cfg.NodeID)
	if err != nil {
		return nil, fmt.Errorf("engine: store: %w", err)
	}
	signer := peers.NewSigner(cfg.NodeID, cfg.OwnToken, cfg.OwnSecret)
	allowedTokens := map[string]string{}
	allowedSecrets := map[string][]byte{}
	for id, tok := range cfg.NodeTokens {
		allowedTokens[id] = tok
		allowedSecrets[id] = cfg.NodeSecrets[id]
	}
	verifier := peers.NewVerifier(allowedTokens, cfg.RequestTTLSeconds, cfg.RateLimitPerMin,
		peers.WithNodeSecrets(allowedSecrets))

	// Production nodes dial peers over mutual TLS (each node presents its own
	// certificate and requires a CA-signed peer). Dev mode leaves TLSCertFile
	// empty and keeps the plain-HTTP transport exactly as before.
	var ringTLS *tls.Config
	if cfg.TLSCertFile != "" {
		ringTLS, err = mtls.ClientTLS(cfg.TLSCAFile, cfg.TLSCertFile, cfg.TLSKeyFile)
		if err != nil {
			return nil, err
		}
	}

	n := &Node{
		cfg:          cfg,
		log:          log,
		store:        st,
		devKey:       cfg.DevShareKey,
		bot:          bot,
		ring:         peers.NewRingClient(cfg.PeerURLs, signer, cfg.ProtocolTimeout, ringTLS),
		peerAuth:     verifier,
		networkNonce: map[string]uint64{},
		sessions:     map[string]*localSession{},
		pending:      map[string][]*tss.SessionMessage{},
		paused:       cfg.SigningPaused,
		completedSigs: make(map[string]*SignResult),
	}
	ppCache := tss.NewPreParamCache(
		filepath.Join(cfg.DataDir, "preparams", "preparams.json.enc"),
		func(b []byte) ([]byte, error) { return keys.Encrypt(n.devKey, b) },
		func(b []byte) ([]byte, error) { return keys.Decrypt(n.devKey, b) },
	)
	pp, err := ppCache.LoadOrGenerate(ctx, 3)
	if err != nil {
		return nil, fmt.Errorf("engine: preparams: %w", err)
	}
	n.preparams = pp
	return n, nil
}

// Close releases the RPC connection.
func (n *Node) Close() {
	if n.bot != nil {
		n.bot.Close()
	}
}

// Controls reports the operational control-plane state.
func (n *Node) Controls() map[string]any {
	n.mu.Lock()
	defer n.mu.Unlock()
	return map[string]any{
		"nodeId":                  n.cfg.NodeID,
		"signingPaused":           n.paused,
		"mainnetBroadcastEnabled": n.cfg.MainnetBroadcastEnabled,
		"allowedChainIds":         n.cfg.AllowedChainIDs,
	}
}

// Paused reports whether the signing gate is closed.
func (n *Node) Paused() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.paused
}

// SetPaused toggles the signing gate (control plane).
func (n *Node) SetPaused(p bool) {
	n.mu.Lock()
	n.paused = p
	n.mu.Unlock()
}

// VerifyPeer authenticates a peer HTTP request (fail-closed).
func (n *Node) VerifyPeer(r *http.Request, body []byte) (string, error) {
	return n.peerAuth.Verify(r, body)
}

// RemoteBot exposes the RPC client to coordinators.
func (n *Node) RemoteBot() *botchain.Client { return n.bot }

// LocalSession tracks an in-flight protocol session on this node.
type localSession struct {
	id        string
	walletID  string
	kind      string
	myPartyID string
	ownerOf   map[string]string // partyID -> nodeID
	inbox     chan *tss.SessionMessage
	cancel    context.CancelFunc
	result    chan error
}

func (n *Node) sessionKey(kind, id string) string { return kind + "/" + id }

func (n *Node) registerSession(s *localSession) {
	n.mu.Lock()
	key := n.sessionKey(s.kind, s.id)
	if old, exists := n.sessions[key]; exists {
		// A duplicate registration never silently replaces a live session.
		if old != s {
			delete(n.sessions, key)
		}
	}
	n.sessions[key] = s
	if pending := n.pending[s.id]; len(pending) > 0 {
		delete(n.pending, s.id)
		go n.flushPending(s, pending)
	}
	n.mu.Unlock()
}

func (n *Node) flushPending(s *localSession, pending []*tss.SessionMessage) {
	for _, sm := range pending {
		select {
		case s.inbox <- sm:
		case <-time.After(2 * time.Second):
			return
		}
	}
}

func (n *Node) unregisterSession(s *localSession) {
	n.mu.Lock()
	key := n.sessionKey(s.kind, s.id)
	if cur, ok := n.sessions[key]; ok && cur == s {
		delete(n.sessions, key)
	}
	n.mu.Unlock()
	s.cancel()
}

func (n *Node) lookupSession(kind, id string) *localSession {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.sessions[n.sessionKey(kind, id)]
}

// Deliver routes an inbound peer protocol message into the right session inbox.
// Messages for an as-yet-unregistered session are buffered briefly so a
// coordinator that announces to several peers atomically does not lose the
// cross-peer broadcasts exchanged while the last peer is still registering.
func (n *Node) Deliver(ctx context.Context, kind, sessionID string, sm *tss.SessionMessage) error {
	s := n.lookupSession(kind, sessionID)
	if s == nil {
		n.mu.Lock()
		if s = n.sessions[n.sessionKey(kind, sessionID)]; s == nil {
			p := n.pending[sessionID]
			if len(p) >= 4096 {
				n.mu.Unlock()
				return fmt.Errorf("engine: pending buffer for session %q is full on %s (fail-closed)", sessionID, n.cfg.NodeID)
			}
			n.pending[sessionID] = append(p, sm)
			n.mu.Unlock()
			return nil
		}
		n.mu.Unlock()
	}
	select {
	case s.inbox <- sm:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("engine: session %q inbox full on %s (fail-closed)", sessionID, n.cfg.NodeID)
	}
}

// sessionWire routes this node's party outbound messages over the peer ring.
type sessionWire struct {
	node      *Node
	sessionID string
	walletID  string
	kind      string
	ownerOf   map[string]string // partyID -> nodeID
}

func (w *sessionWire) SendMessage(ctx context.Context, msg *tss.SessionMessage) error {
	msg.SessionID = w.sessionID
	msg.WalletID = w.walletID
	if msg.IsBroadcast || len(msg.To) == 0 {
		recips := map[string]bool{}
		for _, owner := range w.ownerOf {
			if owner != "" && owner != w.node.cfg.NodeID {
				recips[owner] = true
			}
		}
		var errs []string
		for node := range recips {
			if err := w.node.ring.PostJSON(ctx, node, w.peerPath(), msg, nil); err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", node, err))
			}
		}
		if len(errs) > 0 {
			return fmt.Errorf("engine: broadcast partial failure: %s", strings.Join(errs, "; "))
		}
		return nil
	}
	seen := map[string]bool{}
	var errs []string
	for _, to := range msg.To {
		node, ok := w.ownerOf[to]
		if !ok {
			errs = append(errs, fmt.Sprintf("no owner for party %s", to))
			continue
		}
		if node == w.node.cfg.NodeID {
			// Defensive: a party should never target itself, but deliver locally
			// if it does rather than dropping.
			s := w.node.lookupSession(w.kind, w.sessionID)
			if s != nil {
				select {
				case s.inbox <- msg:
				case <-ctx.Done():
				}
			}
			continue
		}
		if seen[node] {
			continue
		}
		seen[node] = true
		if err := w.node.ring.PostJSON(ctx, node, w.peerPath(), msg, nil); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", node, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("engine: p2p partial failure: %s", strings.Join(errs, "; "))
	}
	return nil
}

func (w *sessionWire) peerPath() string {
	return "/api/v1/peer/" + w.kind + "/" + w.sessionID + "/message"
}

// newSessionWire builds a wire for a participant.
func (n *Node) newSessionWire(kind, sessionID, walletID string) *sessionWire {
	ownerOf := map[string]string{}
	// Default mapping party index -> node (used instead of per-session rosters
	// when not supplied). Callers may override afterwards.
	for i, node := range []string{"node-a", "node-b", "node-c"} {
		ownerOf[fmt.Sprintf("%d", i+1)] = node
	}
	return &sessionWire{node: n, sessionID: sessionID, walletID: walletID, kind: kind, ownerOf: ownerOf}
}

// newParticipant registers an inbox-driven session participant.
func (n *Node) newParticipant(ctx context.Context, kind, sessionID, walletID string, ownerOf map[string]string) (*localSession, context.Context, error) {
	ctx2, cancel := context.WithCancel(ctx)
	s := &localSession{
		id:        sessionID,
		walletID:  walletID,
		kind:      kind,
		ownerOf:   ownerOf,
		inbox:     make(chan *tss.SessionMessage, 4096),
		cancel:    cancel,
		result:    make(chan error, 1),
	}
	if n.lookupSession(kind, sessionID) != nil {
		cancel()
		return nil, nil, fmt.Errorf("engine: duplicate session %s/%s", kind, sessionID)
	}
	n.registerSession(s)
	return s, ctx2, nil
}

// ---------------------------------------------------------------------------
// Address/public-key derivation from a completed DKG save data
// ---------------------------------------------------------------------------

// derivePartyAddress extracts the EVM address from a LocalPartySaveData.
func derivePartyAddress(sd *tssKeygen.LocalPartySaveData) (pubKeyHex, address string, err error) {
	if sd == nil || sd.ECDSAPub == nil {
		return "", "", fmt.Errorf("engine: save data has no public key")
	}
	xBytes := sd.ECDSAPub.X().Bytes()
	yBytes := sd.ECDSAPub.Y().Bytes()
	xPad := make([]byte, 32)
	yPad := make([]byte, 32)
	copy(xPad[32-len(xBytes):], xBytes)
	copy(yPad[32-len(yBytes):], yBytes)
	pubKeyBytes := append([]byte{0x04}, append(xPad, yPad...)...)
	pubKeyHex = fmt.Sprintf("%x", pubKeyBytes)
	address, err = AddressFromPublicKey(pubKeyHex)
	if err != nil {
		return "", "", err
	}
	return pubKeyHex, address, nil
}

// HasWallet checks if this node holds a share record for the wallet.
func (n *Node) HasWallet(walletID string) bool {
	_, raw, err := n.loadShareData(walletID)
	if err == nil {
		zeroBytes(raw)
		return true
	}
	return false
}

// GetWallet returns the stored wallet metadata for the given wallet ID.
func (n *Node) GetWallet(walletID string) (*store.Wallet, error) {
	return n.store.GetWallet(walletID)
}

var _ = tsslib.PartyID{}