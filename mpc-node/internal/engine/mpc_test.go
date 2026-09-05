package engine

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/globalpay/mpc-node/internal/config"
	"github.com/globalpay/mpc-node/internal/peers"
	"github.com/globalpay/mpc-node/internal/tss"
)

func TestMPC_EndToEnd(t *testing.T) {
	// 1. Fast testing mode: disable ZK-proofs to run keygen/signing instantly
	os.Setenv("MPC_DISABLE_PROOFS", "true")
	defer os.Unsetenv("MPC_DISABLE_PROOFS")

	// Relaxed timeout budgets for heavy cryptographic safe-prime generations
	initCtx, initCancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer initCancel()

	runCtx, runCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer runCancel()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	// Create temporary directories for each node
	dirA, err := os.MkdirTemp("", "node-a-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dirA)

	dirB, err := os.MkdirTemp("", "node-b-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dirB)

	dirC, err := os.MkdirTemp("", "node-c-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dirC)

	// Declare nodes
	var nodeA, nodeB, nodeC *Node

	// Setup mutual peer routing handlers
	peerHandler := func(nodeName string, targetNode **Node) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			node := *targetNode
			if node == nil {
				http.Error(w, "node not initialized", http.StatusInternalServerError)
				return
			}

			// Read body
			body, _ := io.ReadAll(r.Body)
			r.Body = io.NopCloser(strings.NewReader(string(body)))

			// Basic verifier bypass for local tests
			path := r.URL.Path
			parts := strings.Split(strings.Trim(path, "/"), "/")

			if len(parts) >= 4 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "peer" {
				kind := parts[3]
				switch kind {
				case "hello":
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"status":"ok"}`))
					return
				case "control":
					if len(parts) == 5 && parts[4] == "pause" {
						var req struct {
							Paused bool `json:"paused"`
						}
						_ = json.Unmarshal(body, &req)
						node.SetPaused(req.Paused)
						w.WriteHeader(http.StatusOK)
						return
					}
				case "keygen":
					if len(parts) == 6 {
						sessionID := parts[4]
						action := parts[5]
						if action == "announce" {
							var ann DKGAnnounce
							_ = json.Unmarshal(body, &ann)
							res, err := node.RunKeygenAnnounce(r.Context(), &ann)
							if err != nil {
								http.Error(w, err.Error(), http.StatusBadRequest)
								return
							}
							w.Header().Set("Content-Type", "application/json")
							_ = json.NewEncoder(w).Encode(res)
							return
						} else if action == "message" {
							var msg tss.SessionMessage
							_ = json.Unmarshal(body, &msg)
							err := node.Deliver(r.Context(), "keygen", sessionID, &msg)
							if err != nil {
								http.Error(w, err.Error(), http.StatusInternalServerError)
								return
							}
							w.WriteHeader(http.StatusOK)
							return
						}
					}
				case "sign":
					if len(parts) == 6 {
						sessionID := parts[4]
						action := parts[5]
						if action == "announce" {
							var ann SignAnnounce
							_ = json.Unmarshal(body, &ann)
							res, err := node.RunSignAnnounce(r.Context(), &ann)
							if err != nil {
								http.Error(w, err.Error(), http.StatusBadRequest)
								return
							}
							w.Header().Set("Content-Type", "application/json")
							_ = json.NewEncoder(w).Encode(res)
							return
						} else if action == "message" {
							var msg tss.SessionMessage
							_ = json.Unmarshal(body, &msg)
							err := node.Deliver(r.Context(), "sign", sessionID, &msg)
							if err != nil {
								http.Error(w, err.Error(), http.StatusInternalServerError)
								return
							}
							w.WriteHeader(http.StatusOK)
							return
						}
					}
				case "wallet":
					if len(parts) == 5 {
						walletID := parts[4]
						_, _, err := node.loadShareData(walletID)
						if err != nil {
							http.Error(w, "wallet not found", http.StatusNotFound)
							return
						}
						w.Header().Set("Content-Type", "application/json")
						_, _ = w.Write([]byte(`{"walletId":"` + walletID + `"}`))
						return
					}
				}
			}
			http.Error(w, "not found", http.StatusNotFound)
		}
	}

	// Spin up HTTP test servers for all 3 nodes
	tsA := httptest.NewServer(peerHandler("node-a", &nodeA))
	defer tsA.Close()

	tsB := httptest.NewServer(peerHandler("node-b", &nodeB))
	defer tsB.Close()

	tsC := httptest.NewServer(peerHandler("node-c", &nodeC))
	defer tsC.Close()

	// Configuration
	peerURLs := map[string]string{
		"node-a": tsA.URL,
		"node-b": tsB.URL,
		"node-c": tsC.URL,
	}

	defaultKey, _ := hex.DecodeString("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")

	buildConfig := func(id, dir string) *config.DevConfig {
		return &config.DevConfig{
			NodeID:                  id,
			Port:                    "unused",
			PeerURLs:                peerURLs,
			NodeTokens:              map[string]string{"node-a": "tok-a", "node-b": "tok-b", "node-c": "tok-c"},
			NodeSecrets:             map[string][]byte{"node-a": defaultKey, "node-b": defaultKey, "node-c": defaultKey},
			OwnToken:                "tok-" + id[5:],
			OwnSecret:               defaultKey,
			DevShareKey:             defaultKey,
			DataDir:                 dir,
			ChainID:                 968,
			Network:                 "testnet",
			RPCURL:                  "https://rpc.bohr.life",
			AllowedChainIDs:         []string{"677", "968"},
			SigningPaused:           false,
			MainnetBroadcastEnabled: false,
			ProtocolTimeout:         5 * time.Minute,
		}
	}

	// Initialize engines with initCtx
	var errA, errB, errC error
	nodeA, errA = New(initCtx, buildConfig("node-a", dirA), logger)
	if errA != nil {
		t.Fatal(errA)
	}
	nodeB, errB = New(initCtx, buildConfig("node-b", dirB), logger)
	if errB != nil {
		t.Fatal(errB)
	}
	nodeC, errC = New(initCtx, buildConfig("node-c", dirC), logger)
	if errC != nil {
		t.Fatal(errC)
	}

	defer nodeA.Close()
	defer nodeB.Close()
	defer nodeC.Close()

	t.Run("DKG Execution", func(t *testing.T) {
		req := &DKGRequest{
			WalletID: "wallet-test-id",
			Seed:     "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			Parties:  3,
			ChainID:  968,
		}
		res, err := nodeA.CreateWallet(runCtx, req)
		if err != nil {
			t.Fatalf("DKG CreateWallet failed: %v", err)
		}

		if res.Address == "" || res.PublicKey == "" {
			t.Fatal("empty DKG outputs")
		}

		// Ensure the share files exist on all 3 nodes
		_, rawA, err := nodeA.loadShareData("wallet-test-id")
		if err != nil {
			t.Fatal(err)
		}
		sdA, _ := tss.DeserializeSaveData(rawA)
		if sdA.LocalSecrets.Xi == nil || sdA.LocalSecrets.Xi.Sign() == 0 {
			t.Fatal("Node A share has no secret keys")
		}

		_, rawB, err := nodeB.loadShareData("wallet-test-id")
		if err != nil {
			t.Fatal(err)
		}
		sdB, _ := tss.DeserializeSaveData(rawB)

		_, rawC, err := nodeC.loadShareData("wallet-test-id")
		if err != nil {
			t.Fatal(err)
		}
		sdC, _ := tss.DeserializeSaveData(rawC)

		// Assert: No node holds other node's private share Xi
		if sdA.LocalSecrets.Xi.Cmp(sdB.LocalSecrets.Xi) == 0 || sdA.LocalSecrets.Xi.Cmp(sdC.LocalSecrets.Xi) == 0 {
			t.Fatal("nodes hold duplicate key material - not real MPC")
		}

		// Assert: Same public address derived by all nodes
		_, addrA, _ := derivePartyAddress(sdA)
		_, addrB, _ := derivePartyAddress(sdB)
		_, addrC, _ := derivePartyAddress(sdC)

		if addrA != res.Address || addrB != res.Address || addrC != res.Address {
			t.Fatalf("Derived addresses mismatch: a=%s b=%s c=%s", addrA, addrB, addrC)
		}
		t.Logf("DKG address matched for all parties: %s", res.Address)
	})

	t.Run("Threshold 2-of-3 signing success", func(t *testing.T) {
		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}

		// Cohort A + B
		resAB, err := nodeA.Sign(runCtx, req)
		if err != nil {
			t.Fatalf("A+B sign failed: %v", err)
		}
		if resAB.Signature == "" {
			t.Fatal("empty signature")
		}

		// Cohort B + C
		resBC, err := nodeB.Sign(runCtx, req)
		if err != nil {
			t.Fatalf("B+C sign failed: %v", err)
		}
		if resBC.Signature == "" {
			t.Fatal("empty signature")
		}

		// Cohort C + A
		resCA, err := nodeC.Sign(runCtx, req)
		if err != nil {
			t.Fatalf("C+A sign failed: %v", err)
		}
		if resCA.Signature == "" {
			t.Fatal("empty signature")
		}
	})

	t.Run("Failover: Node A offline -> B+C works", func(t *testing.T) {
		// Mock Node A offline: point peer URL for node-a to a dead port
		originalRingB := nodeB.ring
		originalRingC := nodeC.ring

		deadURLsB := map[string]string{"node-a": "http://127.0.0.1:9999", "node-b": tsB.URL, "node-c": tsC.URL}
		nodeB.ring = peers.NewRingClient(deadURLsB, peers.NewSigner("node-b", "tok-b", defaultKey), 5*time.Minute)

		deadURLsC := map[string]string{"node-a": "http://127.0.0.1:9999", "node-b": tsB.URL, "node-c": tsC.URL}
		nodeC.ring = peers.NewRingClient(deadURLsC, peers.NewSigner("node-c", "tok-c", defaultKey), 5*time.Minute)

		defer func() {
			nodeB.ring = originalRingB
			nodeC.ring = originalRingC
		}()

		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}

		res, err := nodeB.Sign(runCtx, req)
		if err != nil {
			t.Fatalf("B+C sign failed when A is offline: %v", err)
		}
		if res.Signature == "" {
			t.Fatal("empty signature")
		}
		t.Log("Node A offline -> B+C signed successfully!")
	})

	t.Run("Failover: Node B offline -> A+C works", func(t *testing.T) {
		originalRingA := nodeA.ring
		originalRingC := nodeC.ring

		deadURLsA := map[string]string{"node-a": tsA.URL, "node-b": "http://127.0.0.1:9999", "node-c": tsC.URL}
		nodeA.ring = peers.NewRingClient(deadURLsA, peers.NewSigner("node-a", "tok-a", defaultKey), 5*time.Minute)

		deadURLsC := map[string]string{"node-a": tsA.URL, "node-b": "http://127.0.0.1:9999", "node-c": tsC.URL}
		nodeC.ring = peers.NewRingClient(deadURLsC, peers.NewSigner("node-c", "tok-c", defaultKey), 5*time.Minute)

		defer func() {
			nodeA.ring = originalRingA
			nodeC.ring = originalRingC
		}()

		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}

		res, err := nodeA.Sign(runCtx, req)
		if err != nil {
			t.Fatalf("A+C sign failed when B is offline: %v", err)
		}
		if res.Signature == "" {
			t.Fatal("empty signature")
		}
		t.Log("Node B offline -> A+C signed successfully!")
	})

	t.Run("Failover: Node C offline -> A+B works", func(t *testing.T) {
		originalRingA := nodeA.ring
		originalRingB := nodeB.ring

		deadURLsA := map[string]string{"node-a": tsA.URL, "node-b": tsB.URL, "node-c": "http://127.0.0.1:9999"}
		nodeA.ring = peers.NewRingClient(deadURLsA, peers.NewSigner("node-a", "tok-a", defaultKey), 5*time.Minute)

		deadURLsB := map[string]string{"node-a": tsA.URL, "node-b": tsB.URL, "node-c": "http://127.0.0.1:9999"}
		nodeB.ring = peers.NewRingClient(deadURLsB, peers.NewSigner("node-b", "tok-b", defaultKey), 5*time.Minute)

		defer func() {
			nodeA.ring = originalRingA
			nodeB.ring = originalRingB
		}()

		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}

		res, err := nodeA.Sign(runCtx, req)
		if err != nil {
			t.Fatalf("A+B sign failed when C is offline: %v", err)
		}
		if res.Signature == "" {
			t.Fatal("empty signature")
		}
		t.Log("Node C offline -> A+B signed successfully!")
	})

	t.Run("Node B alone fails to sign (1-of-3)", func(t *testing.T) {
		originalRingB := nodeB.ring
		deadURLs := map[string]string{"node-a": "http://127.0.0.1:9999", "node-b": tsB.URL, "node-c": "http://127.0.0.1:9999"}
		nodeB.ring = peers.NewRingClient(deadURLs, peers.NewSigner("node-b", "tok-b", defaultKey), 5*time.Minute)
		defer func() {
			nodeB.ring = originalRingB
		}()

		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}
		_, err := nodeB.Sign(runCtx, req)
		if err == nil {
			t.Fatal("signing should have failed with only Node B available")
		}
	})

	t.Run("Node C alone fails to sign (1-of-3)", func(t *testing.T) {
		originalRingC := nodeC.ring
		deadURLs := map[string]string{"node-a": "http://127.0.0.1:9999", "node-b": "http://127.0.0.1:9999", "node-c": tsC.URL}
		nodeC.ring = peers.NewRingClient(deadURLs, peers.NewSigner("node-c", "tok-c", defaultKey), 5*time.Minute)
		defer func() {
			nodeC.ring = originalRingC
		}()

		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}
		_, err := nodeC.Sign(runCtx, req)
		if err == nil {
			t.Fatal("signing should have failed with only Node C available")
		}
	})

	t.Run("All nodes offline -> sign fails", func(t *testing.T) {
		originalRingA := nodeA.ring
		deadURLs := map[string]string{"node-a": "http://127.0.0.1:9999", "node-b": "http://127.0.0.1:9999", "node-c": "http://127.0.0.1:9999"}
		nodeA.ring = peers.NewRingClient(deadURLs, peers.NewSigner("node-a", "tok-a", defaultKey), 5*time.Minute)
		defer func() {
			nodeA.ring = originalRingA
		}()

		req := &SignRequest{
			WalletID: "wallet-test-id",
			Digest:   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			ChainID:  968,
		}
		_, err := nodeA.Sign(runCtx, req)
		if err == nil {
			t.Fatal("signing should have failed with all peers offline")
		}
	})
}
