import logger from '../utils/logger.js';
import {
createAiWallet,
  getAgentBalance,
  sendAgentPayment,
  getAgentLedger
} from '../services/aiAgentWalletService.js';

// ==================== Bot Wallet Lifecycle ====================

/**
 * POST /api/agent/wallet (public/dev)
 * Mint a headless Arc Chain vault for a new AI agent.
 * Returns the bot's wallet address + a one-time API key.
 */
export const createWallet = async (req, res) => {
  try {
    const { name, ownerEmail } = req.body;
    const result = await createAiWallet({ name, ownerEmail });
    return res.status(201).json({
      success: true,
      message: '🤖 Headless AI wallet created. Your bot now has a bank account on Arc Chain.',
      ...result
    });
  } catch (error) {
    logger.error('[AI AGENT] createWallet error:', error.message);
    const isMissingTable = /Could not find the table|PGRST205|relation .* does not exist/i.test(error.message || '');
    if (isMissingTable) {
      return res.status(500).json({
        message: 'AI Agent table missing. Run backend/src/config/ai_agents_migration.sql in the Supabase SQL editor.',
        hint: isMissingTable
      });
    }
    res.status(500).json({ message: 'Failed to create AI wallet.' });
  }
};

/**
 * GET /api/agent/wallet/balance
 * Read the agent's live on-chain USDC balance. Scoped by API key.
 */
export const getBalance = async (req, res) => {
  try {
    const agent = req.agent;
    const balance = await getAgentBalance(agent);
    return res.status(200).json({
      success: true,
      agentId: agent.id,
      name: agent.name,
      walletAddress: agent.wallet_address,
      balance
    });
  } catch (error) {
    logger.error('[AI] getBalance error:', error.message);
    res.status(500).json({ message: 'Failed to read agent balance.' });
  }
};

/**
 * POST /api/agent/wallet/send
 * Autonomous machine-to-machine / micro-settlement payment from the bot wallet.
 * Body: { destinationAddress, amount?, wei?, note? }
 */
export const sendPayment = async (req, res) => {
  try {
    const agent = req.agent;
    const { destinationAddress, amount, wei, note } = req.body;
    const result = await sendAgentPayment(agent, { destinationAddress, amount, wei, note });
    return res.status(200).json({
      success: true,
      message: `💸 AI payment sent: ${result.amount} USDC -> ${result.to}`,
      ...result
    });
  } catch (error) {
    logger.error('[AI] sendPayment error:', error.message);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Failed to send agent payment.' });
  }
};

/**
 * GET /api/agent/wallet/transactions
 * Ledger of all payments the bot has made. Scoped by API key.
 */
export const getTransactions = async (req, res) => {
  try {
    const agent = req.agent;
    const limit = req.query.limit;
    const ledger = await getAgentLedger(agent, limit);
    return res.status(200).json({
      success: true,
      agentId: agent.id,
      count: ledger.length,
      transactions: ledger
    });
  } catch (error) {
    logger.error('[AI] getTransactions error:', error.message);
    res.status(500).json({ message: 'Failed to fetch agent ledger.' });
  }
};
