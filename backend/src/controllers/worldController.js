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
import {
  createRpSignature,
  verifyIdkitProof,
  markUserVerified,
  getUserVerificationStatus,
  worldIdConfig
} from '../services/worldIdVerifyService.js';
import {
  startRegistration,
  getSessionStatus,
  cancelRegistration
} from '../services/agentBookRegistrationService.js';

/**
 * GET /api/developers/world/idkit/config
 * Public (authed) config for the IDKit widget: app_id, rp_id, environment.
 */
export const idkitConfig = async (req, res, next) => {
  try {
    return res.json({ success: true, config: worldIdConfig() });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/developers/world/idkit/sign — RP signature for IDKit (Step 3).
 * The signing key never leaves the server.
 */
export const idkitSign = async (req, res, next) => {
  try {
    const { action } = req.body || {};
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ success: false, message: 'action is required.' });
    }
    const signature = createRpSignature(action);
    return res.json({ success: true, ...signature });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

/**
 * POST /api/developers/world/idkit/verify — verify IDKit proof (Steps 5–6).
 * Forwards the proof byte-for-byte to World, stores the nullifier (UNIQUE),
 * then marks the selected agent World-verified.
 */
export const idkitVerify = async (req, res, next) => {
  try {
    const { idkitResponse, action } = req.body || {};
    const developerId = req.developerId;

    const result = await verifyIdkitProof({
      idkitResponse,
      expectedAction: action,
      developerId
    });

    // Verification is once per USER — stored on the profile; agents inherit.
    const updatedProfile = await markUserVerified({ developerId, nullifier: result.nullifier });

    return res.json({ success: true, verified: true, ...result, profileUpdated: Boolean(updatedProfile) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

/**
 * POST /api/developers/world/agentbook/register
 * Starts an AgentBook registration session via the official agentkit-cli.
 * Returns { sessionId, verifyUrl } — the frontend renders verifyUrl as a QR.
 */
export const agentBookRegister = async (req, res, next) => {
  try {
    const { agentId } = req.body || {};
    const developerId = req.developerId;
    if (!agentId) {
      return res.status(400).json({ success: false, message: 'agentId is required.' });
    }

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('agent_id, wallet_address, developer_id')
      .eq('agent_id', agentId)
      .single();
    if (error || !agent) {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }
    // Ownership check: the requesting developer must own the agent.
    if (String(agent.developer_id) !== String(developerId)) {
      return res.status(403).json({ success: false, message: 'You do not own this agent.' });
    }
    if (!agent.wallet_address) {
      return res.status(400).json({ success: false, message: 'Agent has no wallet address.' });
    }

    const session = await startRegistration({ agentId, wallet: agent.wallet_address });
    return res.json({ success: true, ...session });
  } catch (err) {
    if (err.message?.includes('60s')) return res.status(504).json({ success: false, message: err.message });
    next(err);
  }
};

/**
 * GET /api/developers/world/agentbook/session/:sessionId
 * Poll registration status — completes when AgentBook resolves the wallet on-chain.
 */
export const agentBookSession = async (req, res, next) => {
  try {
    const result = await getSessionStatus(req.params.sessionId);
    if (!result.found) {
      return res.status(404).json({ success: false, message: 'Session not found or expired.' });
    }
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/developers/world/agentbook/cancel
 * Cancel a pending registration session.
 */
export const agentBookCancel = async (req, res, next) => {
  try {
    const ok = cancelRegistration(req.body?.sessionId);
    return res.json({ success: ok });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/developers/world/user-status
 * User-level World verification — all agents of this user inherit it.
 */
export const userStatus = async (req, res, next) => {
  try {
    const status = await getUserVerificationStatus(req.developerId);
    return res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/developers/world/verify
 * Verify an agent's wallet against AgentBook.
 */
export const verify = async (req, res, next) => {
  try {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ success: false, message: 'agentId is required.' });

    const { data: ownedAgent, error: ownershipError } = await supabase
      .from('ai_agents')
      .select('agent_id')
      .eq('agent_id', agentId)
      .eq('developer_id', req.developerId)
      .maybeSingle();
    if (ownershipError) throw ownershipError;
    if (!ownedAgent) return res.status(404).json({ success: false, message: 'Agent not found.' });

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
    const { data: ownedAgent, error: ownershipError } = await supabase
      .from('ai_agents')
      .select('agent_id')
      .eq('agent_id', agentId)
      .eq('developer_id', req.developerId)
      .maybeSingle();
    if (ownershipError) throw ownershipError;
    if (!ownedAgent) return res.status(404).json({ success: false, message: 'Agent not found.' });

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
      .eq('developer_id', req.developerId)
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
      agentBookId: a.agent_book_id || null,
      agentBookTxHash: a.agentbook_tx_hash || null,
      verificationMethod: a.verification_method || null
    }));

    return res.json({ success: true, agents });
  } catch (err) {
    next(err);
  }
};
