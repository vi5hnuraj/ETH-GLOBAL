/**
 * World Verification Gate — middleware that requires World ID verification
 * before allowing service publishing.
 *
 * Verification is ONCE PER USER: the profile holds the flag, every agent the
 * user owns (current and future) inherits it. The agent-level column is only
 * consulted as a legacy fallback.
 *
 * This is an AUTHORIZATION layer, not a reputation layer.
 * World proves WHO you are. The Graph proves HOW TRUSTWORTHY you are.
 */
import { getUserVerificationStatus } from '../services/worldIdVerifyService.js';

export const requireWorldVerification = async (req, res, next) => {
  try {
    const developerId = req.developerId;
    if (!developerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { supabase } = await import('../config/supabaseClient.js');

    // 1) User-level verification (authoritative, once per user)
    const userStatus = await getUserVerificationStatus(developerId);
    if (userStatus.verified) {
      req.worldVerifiedUser = true;
      return next();
    }

    // 2) Legacy fallback — an agent verified via AgentBook before user-level existed
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('agent_id, wallet_address, world_verified, human_backed')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (agents?.[0]?.world_verified) {
      // Promote to user-level so future checks are profile-driven
      await supabase
        .from('profiles')
        .update({ world_verified: true, world_verified_at: new Date().toISOString() })
        .eq('id', developerId);
      req.worldVerifiedUser = true;
      return next();
    }

    if (!agents?.length) {
      return res.status(403).json({
        success: false,
        message: 'No agent found. Create an AI agent before publishing.',
        code: 'NO_AGENT',
        action: 'create_agent'
      });
    }

    return res.status(403).json({
      success: false,
      message: 'World ID verification required before publishing a service. Verify once as a human — every agent you own inherits it.',
      code: 'WORLD_VERIFICATION_REQUIRED',
      action: 'verify_world',
      verificationUrl: '/developer/world-verification'
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      message: 'World verification service temporarily unavailable. Please try again.',
      code: 'WORLD_UNAVAILABLE'
    });
  }
};
