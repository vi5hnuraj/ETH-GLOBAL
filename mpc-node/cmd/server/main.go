package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/globalpay/mpc-node/internal/config"
	"github.com/globalpay/mpc-node/internal/engine"
	"github.com/globalpay/mpc-node/internal/mtls"
	"github.com/globalpay/mpc-node/internal/tss"
)

func main() {
	// MPC_ENV selects the configuration loader. Anything other than
	// "production" boots the local-development/testnet node, preserving the
	// historical default behaviour exactly. Production is fail-closed: missing
	// security configuration aborts startup.
	env := strings.ToLower(os.Getenv("MPC_ENV"))
	nodeID := os.Getenv("MPC_NODE_ID")
	if nodeID == "" {
		nodeID = "node-a" // default to coordinator node-a (dev only)
	}

	var cfg *config.DevConfig
	var err error
	switch env {
	case "production":
		cfg, err = config.Load()
		if err != nil {
			log.Fatalf("Failed to load production configuration (MPC_ENV=production): %v", err)
		}
	default:
		cfg, err = config.LoadDev(nodeID)
		if err != nil {
			log.Fatalf("Failed to load dev configuration for node %s: %v", nodeID, err)
		}
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	logger.Info("Starting Go MPC Node Service",
		slog.String("mode", func() string { if env == "production" { return "production" }; return "dev" }()),
		slog.String("node_id", cfg.NodeID),
		slog.String("port", cfg.Port),
		slog.String("network", cfg.Network),
		slog.Uint64("chain_id", cfg.ChainID),
	)

	// Create application context
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// Initialize Go MPC engine Node
	node, err := engine.New(ctx, cfg, logger)
	if err != nil {
		logger.Error("Failed to initialize MPC engine", slog.Any("error", err))
		os.Exit(1)
	}
	defer node.Close()

	mux := http.NewServeMux()

	// Helper to write JSON responses
	writeJSON := func(w http.ResponseWriter, status int, data interface{}) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(data)
	}

	// Helper to write HTTP errors
	writeError := func(w http.ResponseWriter, status int, errMsg string) {
		writeJSON(w, status, map[string]string{"error": errMsg})
	}

	// Helper to check service tokens (for coordinator public API endpoints)
	authService := func(r *http.Request) bool {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			return false
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		for _, t := range cfg.ServiceTokens {
			if t == token {
				return true
			}
		}
		return false
	}

	// ── 1. Public Coordinator Routes ─────────────────────────────────────────

	// Create a new wallet session (DKG)
	mux.HandleFunc("POST /api/v1/wallets", func(w http.ResponseWriter, r *http.Request) {
		if !authService(r) {
			writeError(w, http.StatusUnauthorized, "Unauthorized: invalid bearer service token")
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		var req engine.DKGRequest
		if err := json.Unmarshal(body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON request")
			return
		}

		res, err := node.CreateWallet(r.Context(), &req)
		if err != nil {
			logger.Error("DKG CreateWallet failed", slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, res)
	})

	// Get wallet metadata by ID
	mux.HandleFunc("GET /api/v1/wallets/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !authService(r) {
			writeError(w, http.StatusUnauthorized, "Unauthorized: invalid bearer service token")
			return
		}
		walletID := r.PathValue("id")
		if walletID == "" {
			writeError(w, http.StatusBadRequest, "missing wallet ID path param")
			return
		}
		wallet, err := node.GetWallet(walletID)
		if err != nil || wallet == nil {
			writeError(w, http.StatusNotFound, "wallet not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"walletId": wallet.WalletID,
			"address":  wallet.Address,
			"chainId":  wallet.ChainID,
		})
	})

	// Request a threshold signature
	mux.HandleFunc("POST /api/v1/wallets/{id}/sign", func(w http.ResponseWriter, r *http.Request) {
		if !authService(r) {
			writeError(w, http.StatusUnauthorized, "Unauthorized: invalid bearer service token")
			return
		}

		walletID := r.PathValue("id")
		if walletID == "" {
			writeError(w, http.StatusBadRequest, "missing wallet ID path param")
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		var req engine.SignRequest
		if err := json.Unmarshal(body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON request")
			return
		}
		req.WalletID = walletID

		res, err := node.Sign(r.Context(), &req)
		if err != nil {
			logger.Error("Sign transaction failed", slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, res)
	})

	// Sign and broadcast a payment transaction
	mux.HandleFunc("POST /api/v1/wallets/{id}/send", func(w http.ResponseWriter, r *http.Request) {
		if !authService(r) {
			writeError(w, http.StatusUnauthorized, "Unauthorized: invalid bearer service token")
			return
		}

		walletID := r.PathValue("id")
		if walletID == "" {
			writeError(w, http.StatusBadRequest, "missing wallet ID path param")
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		var req engine.TxRequest
		if err := json.Unmarshal(body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON request")
			return
		}
		req.WalletID = walletID

		// Retrieve the mainnet approval token
		approvalToken := r.Header.Get("X-Mainnet-Approval")

		// 1. Sign
		resSign, err := node.SignAndBroadcast(r.Context(), &req, approvalToken)
		if err != nil {
			logger.Error("SignAndBroadcast failed", slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// 2. Broadcast
		resBroadcast, err := node.Broadcast(r.Context(), walletID, resSign.RawTx, approvalToken)
		if err != nil {
			logger.Error("Broadcast failed", slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, resBroadcast)
	})

	// ── 2. Peer-to-Peer Authenticated Routes ─────────────────────────────────

	// Peer Ping/Hello Endpoint
	mux.HandleFunc("POST /api/v1/peer/hello", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Inbound Keygen Announcement
	mux.HandleFunc("POST /api/v1/peer/keygen/{sessionId}/announce", func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.PathValue("sessionId")
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}

		var ann engine.DKGAnnounce
		if err := json.Unmarshal(body, &ann); err != nil {
			writeError(w, http.StatusBadRequest, "invalid announce payload")
			return
		}
		ann.SessionID = sessionID

		res, err := node.RunKeygenAnnounce(r.Context(), &ann)
		if err != nil {
			logger.Error("RunKeygenAnnounce failed", slog.String("session_id", sessionID), slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, res)
	})

	// Inbound Keygen Protocol Messaging
	mux.HandleFunc("POST /api/v1/peer/keygen/{sessionId}/message", func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.PathValue("sessionId")
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}

		var msg tss.SessionMessage
		if err := json.Unmarshal(body, &msg); err != nil {
			writeError(w, http.StatusBadRequest, "invalid session message payload")
			return
		}

		if err := node.Deliver(r.Context(), "keygen", sessionID, &msg); err != nil {
			logger.Error("Keygen message delivery failed", slog.String("session_id", sessionID), slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		w.WriteHeader(http.StatusOK)
	})

	// Inbound Sign Announcement
	mux.HandleFunc("POST /api/v1/peer/sign/{sessionId}/announce", func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.PathValue("sessionId")
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}

		var ann engine.SignAnnounce
		if err := json.Unmarshal(body, &ann); err != nil {
			writeError(w, http.StatusBadRequest, "invalid announce payload")
			return
		}
		ann.SessionID = sessionID

		res, err := node.RunSignAnnounce(r.Context(), &ann)
		if err != nil {
			logger.Error("RunSignAnnounce failed", slog.String("session_id", sessionID), slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, res)
	})

	// Inbound Sign Protocol Messaging
	mux.HandleFunc("POST /api/v1/peer/sign/{sessionId}/message", func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.PathValue("sessionId")
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}

		var msg tss.SessionMessage
		if err := json.Unmarshal(body, &msg); err != nil {
			writeError(w, http.StatusBadRequest, "invalid session message payload")
			return
		}

		if err := node.Deliver(r.Context(), "sign", sessionID, &msg); err != nil {
			logger.Error("Sign message delivery failed", slog.String("session_id", sessionID), slog.Any("error", err))
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		w.WriteHeader(http.StatusOK)
	})

	// Peer Wallet Metadata Query (has wallet check)
	mux.HandleFunc("POST /api/v1/peer/wallet/{id}", func(w http.ResponseWriter, r *http.Request) {
		walletID := r.PathValue("id")
		body, _ := io.ReadAll(r.Body)

		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}

		// Check if wallet share exists locally
		exists := node.HasWallet(walletID)

		if !exists {
			writeError(w, http.StatusNotFound, "wallet not found on this node")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"walletId": walletID})
	})

	// Peer pause control endpoint
	mux.HandleFunc("POST /api/v1/peer/control/pause", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read body")
			return
		}

		if _, err := node.VerifyPeer(r, body); err != nil {
			writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid peer signature: %v", err))
			return
		}

		var req struct {
			Paused bool `json:"paused"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		node.SetPaused(req.Paused)
		w.WriteHeader(http.StatusOK)
	})

	// Health route
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
	})

	// Start Server
	serverPort := cfg.Port
	if serverPort == "" || serverPort == "unused" {
		serverPort = "8080"
	}
	server := &http.Server{
		Addr:    ":" + serverPort,
		Handler: mux,
	}

	// Production serves every route (coordinator API and peer ring) over mutual
	// TLS: the node presents its certificate and REQUIRES a client certificate
	// signed by the trusted MPC CA. Dev mode (no cert configured) keeps the
	// plain-HTTP listener exactly as before.
	if cfg.TLSCertFile != "" {
		serverTLS, err := mtls.ServerTLS(cfg.TLSCAFile, cfg.TLSCertFile, cfg.TLSKeyFile)
		if err != nil {
			logger.Error("Failed to configure production server mTLS", slog.Any("error", err))
			os.Exit(1)
		}
		server.TLSConfig = serverTLS
	}

	go func() {
		if server.TLSConfig != nil {
			logger.Info("HTTP server listening with mutual TLS", slog.String("addr", server.Addr))
			if err := server.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
				logger.Error("HTTPS server failed", slog.Any("error", err))
				os.Exit(1)
			}
			return
		}
		logger.Info("HTTP server listening", slog.String("addr", server.Addr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("HTTP server failed", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	<-ctx.Done()
	logger.Info("Shutting down HTTP server gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = server.Shutdown(shutdownCtx)
	logger.Info("Service stopped cleanly.")
}
