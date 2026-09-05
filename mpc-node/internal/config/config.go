// Package config contains node configuration loading and validation.
//
// Two loaders exist and are intentionally kept apart:
//
//   - LoadDev (devconfig.go) builds a LOCAL DEVELOPMENT/TESTNET node. It fills
//     in readable dev defaults so a node boots on a laptop without ceremony.
//   - Load (this file) builds a PRODUCTION node. It is fail-closed: every
//     security-critical value must be supplied explicitly, secrets are never
//     defaulted, and any missing or unsafe configuration is a hard error.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Load builds the PRODUCTION configuration for an MPC node. The caller is
// expected to have set MPC_ENV=production before invoking it; this function
// itself is deliberately strict and will not fill in any security-critical
// default.
//
// Required (fail closed):
//   - MPC_NODE_ID ∈ {node-a, node-b, node-c}
//   - SECRET_BACKEND ∈ {vault, aws-kms, gcp-kms, azure-key-vault, hsm}
//   - MPC_SHARE_SECRET_REF (reference to this node's share secret)
//   - MPC_MTLS_CA_FILE, MPC_MTLS_CERT_FILE, MPC_MTLS_KEY_FILE (consumed once
//     the mTLS transport lands)
//   - MPC_NODE_URL equal to this node's MPC_NODE_{A,B,C}_URL, all HTTPS and
//     distinct
//   - per-node bearer tokens and 32-byte hex HMAC secrets
//     (MPC_NODE_{A,B,C}_TOKEN / MPC_NODE_{A,B,C}_SECRET)
//   - per-node share encryption key (MPC_SHARE_KEY_{A,B,C})
//   - MPC_ALLOWED_API_TOKENS (at least one service credential)
//
// Signing is PAUSED by default in production; it can only be unlocked
// explicitly with MPC_SIGNING_PAUSED=false. Mainnet broadcast is disabled by
// default and requires MAINNET_BROADCAST_ENABLED=true.
//
// NOTE (STEP 1): until the SECRET_BACKEND integration lands, the share
// encryption key and peer HMAC secrets are supplied as environment variables
// and held in-process, exactly as in the dev loader. Moving them behind
// Vault/KMS/HSM is a separate step and does not change this interface.
func Load() (*DevConfig, error) {
	nodeID := os.Getenv("MPC_NODE_ID")
	switch nodeID {
	case "node-a", "node-b", "node-c":
	default:
		return nil, fmt.Errorf("MPC_NODE_ID must be node-a, node-b, or node-c (got %q)", nodeID)
	}

	var errs []string
	require := func(name string, ok bool) {
		if !ok {
			errs = append(errs, fmt.Sprintf("%s is required in production", name))
		}
	}

	// --- Secret custody backend (never local in production) ---

	secretBackend := strings.ToLower(os.Getenv("SECRET_BACKEND"))
	switch secretBackend {
	case "vault", "aws-kms", "gcp-kms", "azure-key-vault", "hsm":
	default:
		errs = append(errs, fmt.Sprintf(
			"SECRET_BACKEND must be Vault, KMS, Key Vault, or HSM (got %q); local secret material is never allowed in production",
			secretBackend,
		))
	}

	require("MPC_SHARE_SECRET_REF", os.Getenv("MPC_SHARE_SECRET_REF") != "")
	require("MPC_MTLS_CA_FILE", os.Getenv("MPC_MTLS_CA_FILE") != "")
	require("MPC_MTLS_CERT_FILE", os.Getenv("MPC_MTLS_CERT_FILE") != "")
	require("MPC_MTLS_KEY_FILE", os.Getenv("MPC_MTLS_KEY_FILE") != "")

	// --- Identity and peer topology ---

	nodeURL := os.Getenv("MPC_NODE_URL")
	peers := map[string]string{
		"node-a": os.Getenv("MPC_NODE_A_URL"),
		"node-b": os.Getenv("MPC_NODE_B_URL"),
		"node-c": os.Getenv("MPC_NODE_C_URL"),
	}
	seen := map[string]bool{}
	for name, raw := range peers {
		envName := "MPC_NODE_" + strings.ToUpper(name[5:]) + "_URL"
		if raw == "" {
			require(envName, false)
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			errs = append(errs, fmt.Sprintf("%s must be an HTTPS endpoint (got %q)", envName, raw))
		}
		if seen[raw] {
			errs = append(errs, "MPC node endpoints must be distinct")
		}
		seen[raw] = true
	}
	if nodeURL != peers[nodeID] {
		errs = append(errs, "MPC_NODE_URL must match this node's configured endpoint (MPC_NODE_"+strings.ToUpper(nodeID[5:])+"_URL)")
	}

	// --- Per-node peer credentials (no defaults, never shared) ---

	decodeHex32Key := func(name, val string) []byte {
		raw, err := decodeHex32(val)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s must be a 32-byte hex secret: %v", name, err))
			return nil
		}
		return raw
	}

	// Development-only default values are rejected outright so a development
	// credential can never be mistaken for production custody.
	devTokens := map[string]bool{}
	devSecrets := map[string]bool{}
	for _, id := range []string{"node-a", "node-b", "node-c"} {
		devTokens[DevOnlyDefaultToken(id)] = true
		devSecrets[DevOnlyDefaultSecretHex(id)] = true
	}
	rejectDevValue := func(envName string) {
		errs = append(errs, fmt.Sprintf("%s must not be the known development default value", envName))
	}

	nodeTokens := map[string]string{}
	nodeTokenRaw := map[string]string{}
	nodeSecrets := map[string][]byte{}
	nodeSecretHex := map[string]string{}
	for _, id := range []string{"node-a", "node-b", "node-c"} {
		suffix := strings.ToUpper(id[5:])
		tokEnv := "MPC_NODE_" + suffix + "_TOKEN"
		tok := os.Getenv(tokEnv)
		if tok == "" {
			require(tokEnv, false)
			continue
		}
		if devTokens[tok] {
			rejectDevValue(tokEnv)
			continue
		}
		nodeTokens[id] = tok
		nodeTokenRaw[id] = tok

		secEnv := "MPC_NODE_" + suffix + "_SECRET"
		sec := os.Getenv(secEnv)
		if sec == "" {
			require(secEnv, false)
			continue
		}
		if devSecrets[sec] {
			rejectDevValue(secEnv)
			continue
		}
		if key := decodeHex32Key(secEnv, sec); key != nil {
			nodeSecrets[id] = key
			nodeSecretHex[id] = sec
		}
	}

	// Peer tokens and HMAC secrets must be unique per node. Every node's
	// environment carries all three credentials (the ring must authenticate
	// each peer), so pairwise uniqueness is enforceable here.
	for _, idA := range []string{"node-a", "node-b", "node-c"} {
		for _, idB := range []string{"node-a", "node-b", "node-c"} {
			if idA == idB {
				continue
			}
			if nodeTokenRaw[idA] != "" && nodeTokenRaw[idA] == nodeTokenRaw[idB] {
				errs = append(errs, fmt.Sprintf("MPC_NODE_%s_TOKEN must be unique per node and must not equal MPC_NODE_%s_TOKEN", strings.ToUpper(idA[5:]), strings.ToUpper(idB[5:])))
			}
			if nodeSecretHex[idA] != "" && nodeSecretHex[idA] == nodeSecretHex[idB] {
				errs = append(errs, fmt.Sprintf("MPC_NODE_%s_SECRET must be unique per node and must not equal MPC_NODE_%s_SECRET", strings.ToUpper(idA[5:]), strings.ToUpper(idB[5:])))
			}
		}
	}

	// --- Per-node share encryption key (fail closed, never defaulted) ---

	shareKeyEnv := "MPC_SHARE_KEY_" + strings.ToUpper(nodeID[5:])
	var shareKey []byte
	raw := os.Getenv(shareKeyEnv)
	switch {
	case raw == "":
		require(shareKeyEnv, false)
	case raw == DevOnlyDefaultShareKeyHex() || devSecrets[raw]:
		rejectDevValue(shareKeyEnv)
	default:
		if key := decodeHex32Key(shareKeyEnv, raw); key != nil {
			shareKey = key
			// The share key encrypts this node's share at rest. It must never be
			// reused as (or equal to) any peer HMAC secret.
			for _, id := range []string{"node-a", "node-b", "node-c"} {
				if nodeSecretHex[id] == raw {
					errs = append(errs, fmt.Sprintf("%s must not reuse a peer HMAC secret (MPC_NODE_%s_SECRET)", shareKeyEnv, strings.ToUpper(id[5:])))
				}
				if id != nodeID && os.Getenv("MPC_SHARE_KEY_"+strings.ToUpper(id[5:])) == raw {
					errs = append(errs, fmt.Sprintf("%s must be unique per node and must not equal MPC_SHARE_KEY_%s", shareKeyEnv, strings.ToUpper(id[5:])))
				}
			}
		}
	}

	// --- Service/API authorization (fail closed) ---

	serviceTokens := []string{}
	for _, t := range strings.Split(os.Getenv("MPC_ALLOWED_API_TOKENS"), ",") {
		if t = strings.TrimSpace(t); t != "" {
			if t == DevOnlyDefaultServiceToken() {
				errs = append(errs, "MPC_ALLOWED_API_TOKENS must not contain the known development default service token")
				continue
			}
			serviceTokens = append(serviceTokens, t)
		}
	}
	if len(serviceTokens) == 0 {
		require("MPC_ALLOWED_API_TOKENS", false)
	}

	// --- Network / chain policy (canonical pairs only) ---

	net := strings.ToLower(getEnvOr("MPC_NETWORK", "testnet"))
	if net != "testnet" && net != "mainnet" {
		errs = append(errs, fmt.Sprintf("MPC_NETWORK must be testnet or mainnet (got %q)", net))
	}
	chainID := uint64(968)
	if raw := os.Getenv("MPC_CHAIN_ID"); raw != "" {
		cid, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			errs = append(errs, fmt.Sprintf("MPC_CHAIN_ID must be an integer (got %q)", raw))
		} else {
			chainID = cid
		}
	}
	// Mirror the backend's canonical NETWORK -> chain ID mapping so a
	// misconfigured node fails loudly instead of signing on the wrong chain.
	expectedChain := uint64(968)
	if net == "mainnet" {
		expectedChain = 677
	}
	if chainID != expectedChain {
		errs = append(errs, fmt.Sprintf("MPC_NETWORK=%q requires MPC_CHAIN_ID=%d (got %d)", net, expectedChain, chainID))
	}
	allowedChains := []string{"968"}
	if strings.EqualFold(getEnvOr("MPC_ALLOW_MAINNET", "false"), "true") {
		allowedChains = []string{"968", "677"}
	}

	if len(errs) > 0 {
		return nil, fmt.Errorf("unsafe MPC production configuration: %s", strings.Join(errs, "; "))
	}

	// --- Non-secret derived values ---

	ttl, _ := time.ParseDuration(getEnvOr("MPC_REQUEST_TTL_SECONDS", "60s"))
	pt, _ := time.ParseDuration(getEnvOr("MPC_PROTOCOL_TIMEOUT_MS", "15000ms"))
	rl := 60
	if v := os.Getenv("MPC_RATE_LIMIT_PER_MINUTE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			rl = n
		}
	}

	apiKeys := map[string]string{}
	for _, pair := range strings.Split(os.Getenv("MPC_API_KEYS"), ",") {
		p := strings.Split(strings.TrimSpace(pair), ":")
		if len(p) == 2 && p[0] != "" {
			apiKeys[p[0]] = p[1]
		}
	}

	dataDir := os.Getenv("MPC_NODE_DATA_DIR")
	if dataDir == "" {
		dataDir = fmt.Sprintf("./data/%s-prod", nodeID)
	}

	return &DevConfig{
		NodeID:                  nodeID,
		Port:                    getEnvOr("MPC_NODE_PORT", "8080"),
		PeerURLs:                peers,
		NodeTokens:              nodeTokens,
		NodeSecrets:             nodeSecrets,
		OwnToken:                nodeTokens[nodeID],
		OwnSecret:               nodeSecrets[nodeID],
		DevShareKey:             shareKey,
		TLSCAFile:               os.Getenv("MPC_MTLS_CA_FILE"),
		TLSCertFile:             os.Getenv("MPC_MTLS_CERT_FILE"),
		TLSKeyFile:              os.Getenv("MPC_MTLS_KEY_FILE"),
		DataDir:                 dataDir,
		ChainID:                 chainID,
		Network:                 net,
		RPCURL:                  getEnvOr("BOT_RPC_URL", "https://rpc.bohr.life"),
		AllowedChainIDs:         allowedChains,
		SigningPaused:           getEnvOr("MPC_SIGNING_PAUSED", "true") != "false",
		MainnetBroadcastEnabled: strings.EqualFold(getEnvOr("MAINNET_BROADCAST_ENABLED", "false"), "true"),
		MainnetApprovalToken:    os.Getenv("MAINNET_APPROVAL_TOKEN"),
		ServiceTokens:           serviceTokens,
		RequestTTLSeconds:       ttl,
		ProtocolTimeout:         pt,
		RateLimitPerMin:         rl,
		APITokens:               apiKeys,
	}, nil
}
