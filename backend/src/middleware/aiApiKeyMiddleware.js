import { getAgentByApiKey } from '../services/aiAgentWalletService.js';
import logger from '../utils/logger.js';
/**
 * Authenticates an AI bot via its scoped API key.
 * Expects: Authorization: Bearer gp_ai_...
 * Attaches the resolved agent to req.agent.
 */
const aiApiKeyMiddleware = async (req, res, next) => {
  try {
    const header = req.header('Authorization') || '';
    const apiKey = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : req.header('x-api-key')?.trim();

    if (!apiKey) {
      return res.status(401).json({ message: 'Missing API key. Provide it as: Authorization: Bearer <key>' });
    }

    const agent = await getAgentByApiKey(apiKey);
    if (!agent) {
      return res.status(401).json({ message: 'Invalid or revoked API key.' });
    }

    req.agent = agent;
    next();
  } catch (err) {
    logger.error('[AI API KEY] Auth error:', err.message);
    res.status(500).json({ message: 'AI agent authentication service unavailable.' });
  }
};

export default aiApiKeyMiddleware;