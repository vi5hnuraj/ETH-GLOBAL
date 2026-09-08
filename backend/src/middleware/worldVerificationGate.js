/**
 * World Verification Gate — middleware that requires World AgentKit
 * verification before allowing service publishing.
 *
 * This is an AUTHORIZATION layer, not a reputation layer.
 * World proves WHO you are. The Graph proves HOW TRUSTWORTHY you are.
 */
import { getVerificationStatus } from '../services/worldAgentKitService.js';

/**
 * Express middleware that checks if the developer's primary agent
 * is verified in World AgentKit before allowing service creation.
 *
 * Returns 403 if not verified, with a clear error message.
 */
export const requireWorldVerification = async (req, res, next) => {
  try {
    const developerId = req.developerId;
    if (!developerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    // Find the developer's first agent (the one they publish with)
    const { supabase } = await import('../config/supabaseClient.js');
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('agent_id, wallet_address, world_verified, human_backed')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (!agents?.length) {
      return res.status(403).json({
        success: false,
        message: 'No agent found. Create an AI agent before publishing.',
        code: 'NO_AGENT',
        action: 'create_agent'
      });
    }

    const agent = agents[0];
    if (agent.world_verified) {
      // Already verified — allow publish
      req.worldVerifiedAgent = agent;
      return next();
    }

    // Not verified — block with clear guidance
    return res.status(403).json({
      success: false,
      message: 'World AgentKit verification required before publishing a service. Verify your identity with World ID to prove you are a real human.',
      code: 'WORLD_VERIFICATION_REQUIRED',
      action: 'verify_world',
      agentId: agent.agent_id,
      walletAddress: agent.wallet_address,
      verificationUrl: '/developer/world-verification'
    });
  } catch (err) {
    // If World AgentKit service is unavailable, fail closed
    return res.status(503).json({
      success: false,
      message: 'World verification service temporarily unavailable. Please try again.',
      code: 'WORLD_UNAVAILABLE'
    });
  }
};
