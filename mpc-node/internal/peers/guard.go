package peers

import (
	"errors"
	"sync"
	"time"
)

// ReplayGuard rejects duplicate nonces. Nonces are held until they age out of
// the acceptance window, after which the same (ts, nonce) tuple is invalid for
// another reason (time skew) anyway.
type ReplayGuard struct {
	mu       sync.Mutex
	seen     map[string]int64 // nonce -> unix millis seen
	window   time.Duration
	clock    func() time.Time
}

// NewReplayGuard creates a nonce cache that keeps entries for `window`.
func NewReplayGuard(window time.Duration) *ReplayGuard {
	return &ReplayGuard{seen: make(map[string]int64), window: window, clock: time.Now}
}

// Check returns nil if the (ts, nonce) pair is fresh, or an error otherwise.
func (g *ReplayGuard) Check(tsMs int64, nonce string) error {
	now := g.clock()
	nowMs := now.UnixMilli()
	if skew := nowMs - tsMs; skew < 0 || skew > int64(g.window.Milliseconds()) {
		return errors.New("replay guard: request timestamp outside acceptance window")
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, dup := g.seen[nonce]; dup {
		return errors.New("replay guard: duplicate nonce")
	}
	g.seen[nonce] = nowMs
	// opportunistic purge
	if len(g.seen) > 4096 {
		for n, at := range g.seen {
			if nowMs-at > int64(g.window.Milliseconds()) {
				delete(g.seen, n)
			}
		}
	}
	return nil
}

// RateLimiter is a simple fixed-window token bucket keyed by (node, endpoint).
// It is intentionally strict: overshoot is an instant, loud rejection.
type RateLimiter struct {
	mu       sync.Mutex
	perMin   int
	window   time.Duration
	used     map[string]int64 // key -> count in current window
	opened   map[string]int64 // key -> window open unix millis
}

// NewRateLimiter returns a limiter allowing `perMin` requests per minute per
// (node, endpoint). perMin<=0 disables limiting.
func NewRateLimiter(perMin int) *RateLimiter {
	if perMin <= 0 {
		perMin = -1
	}
	return &RateLimiter{perMin: perMin, window: time.Minute, used: make(map[string]int64), opened: make(map[string]int64)}
}

// Allow reports whether a request from node to path may proceed.
func (l *RateLimiter) Allow(node, path string) bool {
	if l.perMin < 0 {
		return true
	}
	key := node + "|" + path
	now := time.Now().UnixMilli()
	l.mu.Lock()
	defer l.mu.Unlock()
	open, ok := l.opened[key]
	if !ok || now-open >= l.window.Milliseconds() {
		l.opened[key] = now
		l.used[key] = 1
		return true
	}
	if l.used[key] >= int64(l.perMin) {
		return false
	}
	l.used[key]++
	return true
}