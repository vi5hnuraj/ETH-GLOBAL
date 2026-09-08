/**
 * World AgentKit Controller — Express handlers for human-verification endpoints.
 */
import logger from '../utils/logger.js';
import {
  verifyAgent,
  getVerificationStatus,
  lookupAgentBook,
  getBulkVerificationStatus,
  enrichServicesWithVerification
} from '../services/worldAgentKitService.js';
import { supabase } from '../config/supabaseClient.js';

/**
 * POST /api/developers/world/verify
 * Verify an agent's wallet against AgentBook.
 */
export const verify = async (req, res, next) => {
  try {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ success: false, message: 'agentId is required.' });

    const result = await verifyAgent(agentId);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/developers/world/status/:agentId
 * Get World verification status for an agent.
 */
export const status = async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const result = await getVerificationStatus(agentId);
    if (!result) return res.status(404).json({ success: false, message: 'Agent not found.' });
    return res.json({
      success: true,
      verified: result.world_verified || false,
      humanBacked: result.human_backed || false,
      agentBookId: result.agent_book_id || null,
      verifiedAt: result.world_verified_at || null,
      verificationMethod: result.verification_method || null,
      walletAddress: result.wallet_address || null
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/developers/world/lookup
 * Look up a wallet address in AgentBook (without persisting).
 */
export const lookup = async (req, res, next) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ success: false, message: 'walletAddress is required.' });

    const humanId = await lookupAgentBook(walletAddress);
    return res.json({
      success: true,
      registered: Boolean(humanId),
      humanId: humanId || null
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/developers/world/agents
 * List all agents with their verification status.
 */
export const listVerifiedAgents = async (req, res, next) => {
  try {
    const organizationId = req.organization?.id;
    let query = supabase
      .from('ai_agents')
      .select('agent_id, agent_name, wallet_address, world_verified, human_backed, world_verified_at, agent_book_id')
      .order('created_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query.limit(50);
    if (error) throw error;

    const agents = (data || []).map((a) => ({
      agentId: a.agent_id,
      name: a.agent_name,
      walletAddress: a.wallet_address,
      worldVerified: a.world_verified || false,
      humanBacked: a.human_backed || false,
      verifiedAt: a.world_verified_at || null,
      agentBookId: a.agent_book_id || null
    }));

    return res.json({ success: true, agents });
  } catch (err) {
    next(err);
  }
};
