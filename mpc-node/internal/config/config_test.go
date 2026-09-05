package config

import (
	"encoding/hex"
	"testing"
)

const (
	testSecretA  = "84deaf901f7febd6df4fa5220e96586ebfcccd132b978c7d99a367f3bd81415d"
	testSecretB  = "f6470e3c3e0a856d034035ad2b7ee89907864f8b2aad6c0136c459c28666a5b3"
	testSecretC  = "561ab333c9df59864332116279f14476a2337b4c38b14087fe3901a65a7ac35e"
	testShareKey = "23a96d6117bbf904ea8378f7f3b7d1aed8d4a8925c286fb897da5d328eb56c63"
)

// setProductionEnv loads a complete, valid production environment for node-a.
func setProductionEnv(t *testing.T) {
	t.Helper()
	t.Setenv("MPC_NODE_ID", "node-a")
	t.Setenv("MPC_NODE_URL", "https://a.mpc.internal")
	t.Setenv("MPC_NODE_A_URL", "https://a.mpc.internal")
	t.Setenv("MPC_NODE_B_URL", "https://b.mpc.internal")
	t.Setenv("MPC_NODE_C_URL", "https://c.mpc.internal")
	t.Setenv("SECRET_BACKEND", "vault")
	t.Setenv("MPC_SHARE_SECRET_REF", "kv/data/globalpay/mpc/prod/node-a/share")
	t.Setenv("MPC_MTLS_CA_FILE", "/run/secrets/mpc-ca.pem")
	t.Setenv("MPC_MTLS_CERT_FILE", "/run/secrets/node-a-cert.pem")
	t.Setenv("MPC_MTLS_KEY_FILE", "/run/secrets/node-a-key.pem")
	t.Setenv("MPC_NODE_A_TOKEN", "token-a")
	t.Setenv("MPC_NODE_B_TOKEN", "token-b")
	t.Setenv("MPC_NODE_C_TOKEN", "token-c")
	t.Setenv("MPC_NODE_A_SECRET", testSecretA)
	t.Setenv("MPC_NODE_B_SECRET", testSecretB)
	t.Setenv("MPC_NODE_C_SECRET", testSecretC)
	t.Setenv("MPC_SHARE_KEY_A", testShareKey)
	t.Setenv("MPC_ALLOWED_API_TOKENS", "prod-service-token")
	t.Setenv("MPC_SIGNING_PAUSED", "true")
}

func TestRejectsLocalSecretBackend(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("SECRET_BACKEND", "local")
	if _, err := Load(); err == nil {
		t.Fatal("expected unsafe local secret backend to fail")
	}
}

func TestRejectsMissingNodeID(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_ID", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing MPC_NODE_ID to fail")
	}
}

func TestRejectsPlainHTTPPeers(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_B_URL", "http://b.mpc.internal")
	if _, err := Load(); err == nil {
		t.Fatal("expected plain-http peer endpoint to fail")
	}
}

func TestRejectsDuplicatePeerEndpoints(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_B_URL", "https://a.mpc.internal")
	if _, err := Load(); err == nil {
		t.Fatal("expected duplicate peer endpoints to fail")
	}
}

func TestRejectsNodeURAMismatch(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_URL", "https://wrong.mpc.internal")
	if _, err := Load(); err == nil {
		t.Fatal("expected MPC_NODE_URL mismatch to fail")
	}
}

func TestRejectsMissingShareKey(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SHARE_KEY_A", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing share key to fail")
	}
}

func TestRejectsInvalidShareKey(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SHARE_KEY_A", "not-hex")
	if _, err := Load(); err == nil {
		t.Fatal("expected non-hex share key to fail")
	}
}

func TestRejectsMissingPeerSecrets(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_B_SECRET", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing peer HMAC secret to fail")
	}
}

func TestRejectsMissingServiceTokens(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_ALLOWED_API_TOKENS", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing service tokens to fail")
	}
}

func TestRejectsMissingMtlSFiles(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_MTLS_KEY_FILE", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected missing mTLS file path to fail")
	}
}

func TestRejectsNetworkChainMismatch(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NETWORK", "mainnet")
	t.Setenv("MPC_CHAIN_ID", "968")
	if _, err := Load(); err == nil {
		t.Fatal("expected mainnet with testnet chain id to fail")
	}
}

func TestSigningPausedByDefault(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SIGNING_PAUSED", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("valid production config should load: %v", err)
	}
	if !cfg.SigningPaused {
		t.Fatal("production must default to signing paused")
	}
}

func TestSigningUnpausedOnlyWhenExplicit(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SIGNING_PAUSED", "false")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("valid production config should load: %v", err)
	}
	if cfg.SigningPaused {
		t.Fatal("signing should only be paused when not explicitly disabled")
	}
	if cfg.NodeID != "node-a" {
		t.Fatalf("expected node-a, got %s", cfg.NodeID)
	}
	if cfg.OwnToken != "token-a" || string(cfg.OwnSecret) == "" || cfg.DevShareKey == nil {
		t.Fatal("production config must carry per-node credentials")
	}
	if len(cfg.ServiceTokens) != 1 {
		t.Fatalf("expected one service token, got %v", cfg.ServiceTokens)
	}
}

func TestRejectsNodeIDOutsideRoster(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_ID", "node-d")
	if _, err := Load(); err == nil {
		t.Fatal("expected out-of-roster node id to fail")
	}
}

func TestRejectsDevDefaultToken(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_A_TOKEN", "dev-token-a")
	if _, err := Load(); err == nil {
		t.Fatal("expected dev-default token to fail")
	}
}

func TestRejectsDevDefaultSecret(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_A_SECRET", DevOnlyDefaultSecretHex("node-a"))
	if _, err := Load(); err == nil {
		t.Fatal("expected dev-default HMAC secret to fail")
	}
}

func TestRejectsDevDefaultShareKey(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SHARE_KEY_A", DevOnlyDefaultShareKeyHex())
	if _, err := Load(); err == nil {
		t.Fatal("expected dev-default share key to fail")
	}
}

func TestRejectsDevDefaultServiceToken(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_ALLOWED_API_TOKENS", DevOnlyDefaultServiceToken())
	if _, err := Load(); err == nil {
		t.Fatal("expected dev-default service token to fail")
	}
}

func TestRejectsSharedPeerSecrets(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_B_SECRET", testSecretA)
	if _, err := Load(); err == nil {
		t.Fatal("expected a peer HMAC secret equal to another node's to fail")
	}
}

func TestRejectsSharedTokens(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_NODE_B_TOKEN", "token-a")
	if _, err := Load(); err == nil {
		t.Fatal("expected a peer token equal to another node's to fail")
	}
}

func TestRejectsShareKeyReusedAsPeerSecret(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SHARE_KEY_A", testSecretB)
	if _, err := Load(); err == nil {
		t.Fatal("expected a share key reused as a peer HMAC secret to fail")
	}
}

func TestRejectsDuplicateShareKeys(t *testing.T) {
	setProductionEnv(t)
	t.Setenv("MPC_SHARE_KEY_B", testShareKey)
	if _, err := Load(); err == nil {
		t.Fatal("expected a share key equal to another node's to fail")
	}
}

func TestAcceptsDistinctUniqueSecrets(t *testing.T) {
	setProductionEnv(t)
	cfg, err := Load()
	if err != nil {
		t.Fatalf("valid production config should load: %v", err)
	}
	if hex.EncodeToString(cfg.DevShareKey) != testShareKey {
		t.Fatal("share key mismatch")
	}
	if hex.EncodeToString(cfg.OwnSecret) != testSecretA {
		t.Fatal("own HMAC secret mismatch")
	}
	if cfg.OwnToken != "token-a" {
		t.Fatal("own token mismatch")
	}
}

func TestLoadDevStillUsesDevDefaults(t *testing.T) {
	t.Setenv("MPC_NODE_ID", "node-a")
	cfg, err := LoadDev("node-a")
	if err != nil {
		t.Fatalf("LoadDev should still work: %v", err)
	}
	if cfg.NodeID != "node-a" || cfg.Port != "8101" {
		t.Fatalf("unexpected dev identity: %+v", cfg)
	}
	if cfg.OwnToken != DevOnlyDefaultToken("node-a") {
		t.Fatalf("dev default token expected, got %q", cfg.OwnToken)
	}
	if hex.EncodeToString(cfg.OwnSecret) != DevOnlyDefaultSecretHex("node-a") {
		t.Fatal("dev default HMAC secret expected")
	}
	if hex.EncodeToString(cfg.DevShareKey) != DevOnlyDefaultShareKeyHex() {
		t.Fatal("dev default share key expected")
	}
	if cfg.TLSCertFile != "" {
		t.Fatal("dev mode must not configure mTLS")
	}
}
