/**
 * AgentRateLimitMiddleware — per-agent rate limiting and monthly request quota.
 *
 * The global aiLimiter caps total agent traffic; this middleware enforces limits
 * per individual agent API key:
 *   1. Rate limit: sliding-window per agent (AGENT_RATE_LIMIT_PER_MIN).
 *   2. Monthly quota: each agent's plan request limit (from the org's
 *      subscription) counted against api_usage_logs for the current month.
 *
 * Failures are transient-friendly: if the quota can't be computed (table
 * missing, DB hiccup) the request is allowed through rather than blocked.
 */

import { supabase } from '../config/supabaseClient.js';
import { AGENT_RATE_LIMIT_PER_MIN } from '../config/config.js';
import { getPlan } from '../config/config.js';

const WINDOW_MS = 60 * 1000;
const hitsByAgent = new Map();

// Cache plan request limits per org to avoid a DB read on every request.
const planLimitCache = new Map();
const PLAN_LIMIT_TTL_MS = 60 * 1000;

const readOrgRequestLimit = async (agent) => {
  const orgId = agent.organization_id || null;
  const cacheKey = orgId || `dev:${agent.developer_id || 'anon'}`;
  const cached = planLimitCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.limit;

  let limit = getPlan('free').requestLimit;
  try {
    if (orgId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('organization_id', orgId)
        .maybeSingle();
      limit = getPlan(data?.plan || 'free').requestLimit;
    } else {
      // Backward compat: no org — read the agent's own stored plan subscription
      // keyed by developer, else fall back to the free plan.
      const { data } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('developer_id', agent.developer_id)
        .maybeSingle();
      limit = getPlan(data?.plan || 'free').requestLimit;
    }
  } catch {
    limit = getPlan('free').requestLimit;
  }

  planLimitCache.set(cacheKey, { limit, expiresAt: Date.now() + PLAN_LIMIT_TTL_MS });
  return limit;
};

const countMonthUsage = async (agent) => {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { count, error } = await supabase
    .from('api_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .gte('created_at', start);
  if (error) return null;
  return count || 0;
};

const agentRateLimitMiddleware = async (req, _res, next) => {
  if (!req.agent) return next();

  const agentId = req.agent.id;
  const now = Date.now();

  // 1. Sliding-window per-agent rate limit.
  const window = (hitsByAgent.get(agentId) || []).filter((t) => now - t < WINDOW_MS);
  if (window.length >= AGENT_RATE_LIMIT_PER_MIN) {
    const err = new Error(`Agent rate limit exceeded. Maximum ${AGENT_RATE_LIMIT_PER_MIN} requests per minute.`);
    err.status = 429;
    err.code = 'AGENT_RATE_LIMITED';
    return next(err);
  }
  window.push(now);
  hitsByAgent.set(agentId, window);

  // 2. Monthly request quota — enforced before the handler runs, but if the
  // quota cannot be computed (table missing, DB hiccup) allow the request
  // through rather than blocking traffic on an unreliable check.
  try {
    const limit = await readOrgRequestLimit(req.agent);
    const used = await countMonthUsage(req.agent);
    if (used !== null && used >= limit) {
      const err = new Error(`Monthly request quota exceeded (${used}/${limit}). Upgrade your plan to increase the limit.`);
      err.status = 429;
      err.code = 'AGENT_QUOTA_EXCEEDED';
      err.retryable = false;
      return next(err);
    }
  } catch {
    /* quota is best-effort — never block on DB errors */
  }

  next();
};

export default agentRateLimitMiddleware;
