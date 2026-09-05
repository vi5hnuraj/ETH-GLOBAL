package tss

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"time"
)

// SessionMessage is the JSON form of a tss-lib protocol message travelling
// between nodes over the authenticated ring. Payload is base64 so the raw
// wire bytes survive JSON marshalling losslessly.
type SessionMessage struct {
	SessionID   string    `json:"sessionId"`
	WalletID    string    `json:"walletId"`
	From        string    `json:"from"` // party id of the sender
	To          []string  `json:"to,omitempty"`
	IsBroadcast bool      `json:"isBroadcast"`
	Round       int       `json:"round"`
	PayloadB64  string    `json:"payload"`
	Timestamp   time.Time `json:"timestamp"`
}

// NewSessionMessage builds a wire message carrying raw tss-lib bytes.
func NewSessionMessage(sessionID, walletID, from string, to []string, isBroadcast bool, round int, payload []byte) *SessionMessage {
	return &SessionMessage{
		SessionID:   sessionID,
		WalletID:    walletID,
		From:        from,
		To:          to,
		IsBroadcast: isBroadcast,
		Round:       round,
		PayloadB64:  base64.StdEncoding.EncodeToString(payload),
		Timestamp:   time.Now().UTC(),
	}
}

// EncodeJSON marshals a SessionMessage.
func (m *SessionMessage) EncodeJSON() ([]byte, error) { return json.Marshal(m) }

// Payload decodes the base64 payload (nil for empty).
func (m *SessionMessage) Payload() ([]byte, error) {
	if m.PayloadB64 == "" {
		return nil, nil
	}
	return base64.StdEncoding.DecodeString(m.PayloadB64)
}

// Wire is the abstract outbound channel the local party uses to reach remote
// parties. The node engine implements it by mapping party ids to their owning
// nodes and posting signed messages over the ring.
type Wire interface {
	// SendMessage delivers one protocol message. to==nil means broadcast to
	// every other participating node.
	SendMessage(ctx context.Context, msg *SessionMessage) error
}

type noopWire struct{}

// NoopWire drops messages (useful for single-process unit tests).
func NoopWire() Wire { return noopWire{} }

func (noopWire) SendMessage(_ context.Context, _ *SessionMessage) error { return nil }