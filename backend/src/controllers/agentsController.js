import logger from '../utils/logger.js';
import {
createAgent,
  getAgentBalance,
  agentPay,
  getAgentHistory,
  getAgentStats,
  listAgentsByDeveloper,
  regenerateAgentApiKey,
  toPublicAgent
} from '../services/agentService.js';
import { ensurePersonalOrg } from '../services/organizationService.js';
import { DEFAULT_DEVELOPER_ID } from '../config/config.js';
// ==================== Agent Lifecycle ====================

/**
 * POST /api/agents/create
 * Create an AI agent programmatically (headless wallet + API key). No login.
 */
export const create = async (req, res) => {
  try {
    const { name, description, developerId } = req.body;
    const ownerId = developerId || DEFAULT_DEVELOPER_ID;
    const { org } = await ensurePersonalOrg(ownerId);
    const result = await createAgent({ name, description, developerId: ownerId, organizationId: org.id });
    return res.status(201).json({
      success: true,
      message: '🤖 AI Agent created — your bot now has a bank account on BOT Chain.',
      ...result
    });
  } catch (error) {
    logger.error('[AGENTS] create error:', error.message);
    const missingTable = /Could not find the table|PGRST205|relation .* does not exist/i.test(error.message || '');
    return res.status(500).json({
      success: false,
      message: missingTable
        ? 'AI Agent table missing. Run backend/src/config/agents_migration.sql in the Supabase SQL editor.'
        : error.message
    });
  }
};

/**
 * GET /api/agents?developerId=... (dev tooling)
 * List agents — protected by an agent key or, in dev, open for the hub demo.
 */
export const list = async (req, res) => {
  try {
    const developerId = req.developerId || req.query.developerId || req.agent?.developer_id || DEFAULT_DEVELOPER_ID;
    // IDOR fix: without a developer scope (query or agent key), never dump all agents.
    if (!developerId) {
      return res.status(200).json({ success: true, count: 0, agents: [] });
    }
    const agents = await listAgentsByDeveloper(developerId);
    return res.status(200).json({
      success: true,
      count: agents.length,
      agents: agents.map(toPublicAgent)
    });
  } catch (error) {
    logger.error('[AGENTS] list error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to list agents.' });
  }
};

// ==================== Authenticated (agent key) ====================

export const balance = async (req, res) => {
  try {
    const result = await getAgentBalance(req.agent);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('[AGENTS] balance error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to read agent balance.' });
  }
};

export const pay = async (req, res) => {
  try {
    const { to, amount, token, wei, note } = req.body;
    const result = await agentPay(req.agent, { to, amount, token, wei, note });
    return res.status(200).json({
      success: true,
      message: `💸 Agent paid ${result.amount} ${result.token} -> ${result.to}`,
      ...result
    });
  } catch (error) {
    logger.error('[AGENTS] pay error:', error.message);
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message || 'Failed to process agent payment.' });
  }
};

export const history = async (req, res) => {
  try {
    const { limit, page, offset } = req.query;
    const result = await getAgentHistory(req.agent, { limit, page, offset });
    const transactions = result.transactions || result;
    const meta = result.meta || null;
    return res.status(200).json({ success: true, count: transactions.length, transactions, ...(meta ? { meta } : {}) });
  } catch (error) {
    logger.error('[AGENTS] history error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch agent history.' });
  }
};

export const stats = async (req, res) => {
  try {
    const result = await getAgentStats(req.agent);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('[AGENTS] stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to compute agent stats.' });
  }
};

export const rotateKey = async (req, res) => {
  try {
    const result = await regenerateAgentApiKey(req.agent);
    return res.status(200).json({
      success: true,
      message: '🔑 API key rotated. The previous key is now invalid.',
      ...result
    });
  } catch (error) {
    logger.error('[AGENTS] rotateKey error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to rotate API key.' });
  }
};