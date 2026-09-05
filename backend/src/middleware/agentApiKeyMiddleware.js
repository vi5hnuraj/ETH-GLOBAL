import { getAgentByApiKey } from '../services/agentService.js';
import logger from '../utils/logger.js';
/**
 * Authenticates an AI agent via its API key.
 * Header: Authorization: Bearer gpay_sk_...
 * Also accepts `x-api-key`. Attaches the resolved agent to req.agent.
 */
const agentApiKeyMiddleware = async (req, res, next) => {
  try {
    const header = req.header('Authorization') || '';
    const apiKey = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : req.header('x-api-key')?.trim();

    if (!apiKey) {
      return res.status(401).json({ message: 'Missing API key. Provide it as: Authorization: Bearer gpay_sk_...' });
    }

    const agent = await getAgentByApiKey(apiKey);
    if (!agent) {
      return res.status(401).json({ message: 'Invalid or revoked API key.' });
    }

    req.agent = agent;
    next();
  } catch (err) {
    logger.error('[AGENT AUTH] error:', err.message);
    res.status(500).json({ message: 'Agent authentication service unavailable.' });
  }
};

export default agentApiKeyMiddleware;