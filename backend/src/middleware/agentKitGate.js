/**
 * AgentKit Gate — distinguishes human-backed agents from bots on premium routes.
 *
 * Implements the AgentKit docs' "free-trial" pattern (docs.world.org/agents/agent-kit/integrate)
 * for Express:
 *
 *   Request arrives at a premium endpoint
 *     ├─ Agent presents its wallet (X-AGENT-WALLET header or x402 payer)
 *     ├─ AgentBook lookup (canonical World Chain contract) resolves the wallet
 *     │    ├─ registered  → human-backed ✅ → grant free-trial uses (n free requests)
 *     │    └─ unregistered → bot ❌ → must pay via x402 like everyone else
 *     └─ Usage counters per (endpoint, humanId) live in agentkit_usage.
 *
 * Storage note: the docs ship InMemoryAgentKitStorage for local testing and
 * recommend durable storage in production — we use the agentkit_usage table.
 */
import logger from '../utils/logger.js';
import { supabase } from '../config/supabaseClient.js';
import { lookupAgentBook } from '../services/worldAgentKitService.js';
import { TtlCache } from '../utils/ttlCache.js';

const FREE_TRIAL_USES_DEFAULT = Number(process.env.AGENTKIT_FREE_TRIAL_USES || 3);
const FREE_TRIAL_USES_VERIFIED = Number(process.env.AGENTKIT_VERIFIED_TRIAL_USES || 10);
const HUMAN_ID_TTL_MS = 5 * 60 * 1000;

// Cache AgentBook resolutions per wallet to avoid an RPC hit on every request.
const humanIdCache = new TtlCache({ ttlMs: HUMAN_ID_TTL_MS, maxSize: 5000 });

const resolveHumanId = async (wallet) => {
  if (!wallet) return null;
  const key = String(wallet).toLowerCase();
  const hit = humanIdCache.get(key);
  if (hit !== undefined) return hit;
  const humanId = await lookupAgentBook(wallet);
  humanIdCache.set(key, humanId);
  return humanId;
};

/**
 * Free-trial counter — atomic-ish conditional increment (docs: tryIncrementUsage).
 * Returns true if a free use was granted, false when the allowance is exhausted.
 */
const tryIncrementUsage = async (endpoint, humanId, limit) => {
  const { data: existing, error: selErr } = await supabase
    .from('agentkit_usage')
    .select('id, uses')
    .eq('endpoint', endpoint)
    .eq('human_id', humanId)
    .single();

  if (selErr && selErr.code !== 'PGRST116') {
    throw new Error(`agentkit_usage read failed: ${selErr.message}`);
  }

  if (!existing) {
    const { error: insErr } = await supabase
      .from('agentkit_usage')
      .insert({ endpoint, human_id: humanId, uses: 1 });
    if (!insErr) return true;
    // Race: another request inserted first — fall through to the update path.
  } else if (existing.uses >= limit) {
    return false;
  } else {
    const { data: updated, error: updErr } = await supabase
      .from('agentkit_usage')
      .update({ uses: existing.uses + 1, last_used_at: new Date().toISOString() })
      .eq('id', existing.id)
      .lt('uses', limit) // conditional — guards concurrent over-spend
      .select();
    if (!updErr && updated?.length) return true;
    return false;
  }
  return false;
};

/**
 * Express middleware factory.
 * @param {object} opts
 * @param {string} opts.purpose  Shown in the 402/401 responses for debuggability.
 */
export const agentKitGate = ({ purpose = 'Premium API' } = {}) =>
  async (req, res, next) => {
    const wallet = req.headers['x-agent-wallet'] || req.headers['X-AGENT-WALLET'] || null;

    if (!wallet) {
      // No agent identity presented → treat as a plain bot; x402 payment path applies.
      return next();
    }

    let humanId = null;
    try {
      humanId = await resolveHumanId(wallet);
    } catch (err) {
      // AgentBook lookup failure fails OPEN to payment (availability over strictness) —
      // a bot can still pay via x402; it just never gets free trial uses.
      logger.warn('[AGENTKIT] lookup failed, falling back to x402-only:', err.message);
    }

    if (!humanId) {
      return res.status(403).json({
        status: 403,
        agentKit: {
          humanBacked: false,
          message: 'This wallet is not registered in AgentBook. Bots must pay via x402; register your agent with World ID to prove human backing.',
          register: 'POST /api/developers/world/agentbook/register'
        },
        purpose
      });
    }

    try {
      const granted = await tryIncrementUsage(req.originalUrl, humanId, FREE_TRIAL_USES_VERIFIED);
      req.agentKit = {
        humanBacked: true,
        humanId,
        freeTrialUsed: granted,
        freeTrialRemaining: null // resolved client-side from responses so far
      };
      if (!granted) {
        // Free trials exhausted — continue but flag that x402 payment is expected.
        req.agentKit.requiresPayment = true;
      }
      logger.info(`[AGENTKIT] human-backed agent ${wallet} → ${granted ? 'FREE trial use' : 'trial exhausted, payment required'} (${purpose}, limit=${FREE_TRIAL_USES_VERIFIED})`);
      return next();
    } catch (err) {
      logger.error('[AGENTKIT] usage accounting failed:', err.message);
      // Fail open to the paid path rather than blocking a verified human's agent.
      req.agentKit = { humanBacked: true, humanId, freeTrialUsed: false };
      return next();
    }
  };

export default agentKitGate;
