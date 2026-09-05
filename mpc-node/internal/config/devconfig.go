package config

import (
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// DevConfig is the LOCAL DEVELOPMENT/TESTNET configuration. It deliberately
// uses in-process AES-256-GCM dev keys and plain-HTTP peer transport. It is
// clearly labelled DEV and must never be used for production custody.
type DevConfig struct {
	NodeID     string
	Port       string
	PeerURLs   map[string]string // nodeID -> http(s)://host:port
	NodeTokens map[string]string // nodeID -> bearer token (dev)
	NodeSecrets map[string][]byte // nodeID -> 32-byte HMAC secret (dev)
	OwnToken   string
	OwnSecret  []byte
	DevShareKey []byte
	// Production mTLS material. Empty in dev mode, where the node serves and
	// dials plain HTTP exactly as before.
	TLSCAFile   string
	TLSCertFile string
	TLSKeyFile  string
	DataDir    string
	ChainID    uint64
	Network    string
	RPCURL     string
	AllowedChainIDs []string
	SigningPaused bool
	MainnetBroadcastEnabled bool
	MainnetApprovalToken string
	ServiceTokens []string // allowed public API bearer tokens
	RequestTTLSeconds time.Duration
	ProtocolTimeout time.Duration
	RateLimitPerMin int
	APITokens map[string]string // token -> walletId ("*" allowed) for authorization
}

func getEnvOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// LoadDev loads the local development configuration. It is intentionally
// separate from the audited production Load() and is labelled DEV/TEST.
func LoadDev(nodeID string) (*DevConfig, error) {
	switch nodeID {
	case "node-a", "node-b", "node-c":
	default:
		return nil, fmt.Errorf("LoadDev: MPC_NODE_ID must be node-a, node-b, or node-c (got %q)", nodeID)
	}

	peers := map[string]string{
		"node-a": getEnvOr("MPC_NODE_A_URL", "http://127.0.0.1:8101"),
		"node-b": getEnvOr("MPC_NODE_B_URL", "http://127.0.0.1:8102"),
		"node-c": getEnvOr("MPC_NODE_C_URL", "http://127.0.0.1:8103"),
	}
	if peers[nodeID] == "" {
		return nil, fmt.Errorf("LoadDev: no peer url for self node %q", nodeID)
	}

	tokens := map[string]string{
		"node-a": getEnvOr("MPC_NODE_A_TOKEN", DevOnlyDefaultToken("node-a")),
		"node-b": getEnvOr("MPC_NODE_B_TOKEN", DevOnlyDefaultToken("node-b")),
		"node-c": getEnvOr("MPC_NODE_C_TOKEN", DevOnlyDefaultToken("node-c")),
	}
	secrets := map[string][]byte{}
	for id, name := range map[string]string{"node-a": "MPC_NODE_A_SECRET", "node-b": "MPC_NODE_B_SECRET", "node-c": "MPC_NODE_C_SECRET"} {
		h := getEnvOr(name, DevOnlyDefaultSecretHex(id))
		raw, err := decodeHex32(h)
		if err != nil {
			return nil, fmt.Errorf("LoadDev: %s: %w", name, err)
		}
		secrets[id] = raw
	}

	ownShareKey := getEnvOr("MPC_DEV_SHARE_KEY_"+strings.ToUpper(nodeID[4:]), "")
	if ownShareKey == "" {
		ownShareKey = DevOnlyDefaultShareKeyHex()
	}
	shareKey, err := decodeHex32(ownShareKey)
	if err != nil {
		return nil, fmt.Errorf("LoadDev: dev share key for %s: %w", nodeID, err)
	}

	dataDir := os.Getenv("MPC_NODE_DATA_DIR")
	if dataDir == "" {
		dataDir = fmt.Sprintf("./data/%s-dev", nodeID)
	}

	// Validate peer URLs are distinct (no self-duplicate endpoints).
	seen := map[string]bool{}
	for name, raw := range peers {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return nil, fmt.Errorf("LoadDev: MPC_NODE_%s_URL is not a valid http(s) endpoint: %s", name, raw)
		}
		if seen[raw] {
			return nil, fmt.Errorf("LoadDev: duplicate peer endpoints")
		}
		seen[raw] = true
	}

	net := getEnvOr("MPC_NETWORK", "testnet")
	chainIDStr := getEnvOr("MPC_CHAIN_ID", "968")
	cid, err := strconv.ParseUint(chainIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("LoadDev: invalid MPC_CHAIN_ID %q", chainIDStr)
	}
	allowMainnet := getEnvOr("MPC_ALLOW_MAINNET", "false") == "true"

	if cid != 968 && !(allowMainnet && cid == 677) {
		return nil, fmt.Errorf("LoadDev: LOCAL DEVELOPMENT ONLY allows testnet chain id 968 (got %d); set MPC_ALLOW_MAINNET=true to use chain 677", cid)
	}
	if net != "testnet" && !(allowMainnet && net == "mainnet") {
		return nil, fmt.Errorf("LoadDev: LOCAL DEVELOPMENT ONLY; NETWORK must be testnet (or mainnet with MPC_ALLOW_MAINNET=true)")
	}

	allowedChains := []string{"968"}
	if allowMainnet {
		allowedChains = []string{"968", "677"}
	}

	ttl, _ := time.ParseDuration(getEnvOr("MPC_REQUEST_TTL_SECONDS", "60s"))
	pt, _ := time.ParseDuration(getEnvOr("MPC_PROTOCOL_TIMEOUT_MS", "15000ms"))
	rl := 60
	if v := os.Getenv("MPC_RATE_LIMIT_PER_MINUTE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			rl = n
		}
	}

	pubTokens := []string{}
	for _, t := range strings.Split(getEnvOr("MPC_ALLOWED_API_TOKENS", DevOnlyDefaultServiceToken()), ",") {
		if t = strings.TrimSpace(t); t != "" {
			pubTokens = append(pubTokens, t)
		}
	}

	apiKeys := map[string]string{}
	for _, pair := range strings.Split(os.Getenv("MPC_API_KEYS"), ",") {
		p := strings.Split(strings.TrimSpace(pair), ":")
		if len(p) == 2 && p[0] != "" {
			apiKeys[p[0]] = p[1]
		}
	}

	return &DevConfig{
		NodeID:                  nodeID,
		Port:                    getEnvOr("MPC_NODE_PORT", portFor(nodeID)),
		PeerURLs:                peers,
		NodeTokens:              tokens,
		NodeSecrets:             secrets,
		OwnToken:                tokens[nodeID],
		OwnSecret:               secrets[nodeID],
		DevShareKey:             shareKey,
		DataDir:                 dataDir,
		ChainID:                 cid,
		Network:                 net,
		RPCURL:                  getEnvOr("BOT_RPC_URL", "https://rpc.bohr.life"),
		AllowedChainIDs:         allowedChains,
		SigningPaused:           getEnvOr("MPC_SIGNING_PAUSED", "true") == "true",
		MainnetBroadcastEnabled: getEnvOr("MAINNET_BROADCAST_ENABLED", "false") == "true",
		MainnetApprovalToken:    os.Getenv("MAINNET_APPROVAL_TOKEN"),
		ServiceTokens:           pubTokens,
		RequestTTLSeconds:       ttl,
		ProtocolTimeout:         pt,
		RateLimitPerMin:         rl,
		APITokens:               apiKeys,
	}, nil
}

func portFor(nodeID string) string {
	switch nodeID {
	case "node-a": return "8101"
	case "node-b": return "8102"
	case "node-c": return "8103"
	}
	return "8100"
}

func decodeHex32(h string) ([]byte, error) {
	b, err := hex.DecodeString(h)
	if err != nil {
		return nil, err
	}
	if len(b) != 32 {
		return nil, fmt.Errorf("must be 32 bytes, got %d", len(b))
	}
	return b, nil
}