import express from 'express';
import { handleAgentChat } from '../controllers/aiAgentController.js';
import { createWallet, getBalance, sendPayment, getTransactions } from '../controllers/aiWalletController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import aiApiKeyMiddleware from '../middleware/aiApiKeyMiddleware.js';
import { validate, agentChatSchema, createAiWalletSchema, aiAgentSendSchema } from '../middleware/validators.js';

const router = express.Router();

// POST /api/agent/chat - Protected by authMiddleware + validated
router.post('/chat', authMiddleware, validate(agentChatSchema), handleAgentChat);

// ==================== Headless AI Wallet ("Bank for Bots") ====================
// Priority 1 of the AI-to-AI Payments roadmap.

// POST /api/agent/wallet - Mint a headless Arc vault for a new AI agent
router.post('/wallet', validate(createAiWalletSchema), createWallet);

// Bot-scoped endpoints (authenticated with the bot's API key)
router.get('/wallet/balance', aiApiKeyMiddleware, getBalance);
router.post('/wallet/send', aiApiKeyMiddleware, validate(aiAgentSendSchema), sendPayment);
router.get('/wallet/transactions', aiApiKeyMiddleware, getTransactions);

export default router;
