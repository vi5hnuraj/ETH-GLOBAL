/**
 * QuotaMiddleware — enforces the developer/org monthly request quota for
 * authenticated developer API keys (not agent keys; agents get their own
 * quota in agentRateLimitMiddleware).
 *
 * The limit comes from the org's subscription plan (or the default free plan).
 * Usage is the real count of api_usage_logs rows for the org in the current
 * calendar month. When the quota is hit the request is rejected with 429
 * DEVELOPER_QUOTA_EXCEEDED; if the quota can't be computed the request is
 * allowed through (fail-open, transient-friendly).
 */

import { supabase } from '../config/supabaseClient.js';
import { getPlan } from '../config/config.js';
import { isFeatureEnabled } from '../config/featureFlags.js';

const quotaCache = new Map();
const QUOTA_CACHE_TTL_MS = 30 * 1000;

const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

export const readQuota = async (orgId, developerId) => {
  let limit;
  try {
    const orgScope = orgId || null;
    const key = orgScope ? { organization_id: orgScope } : { developer_id: developerId };
    const { data } = await supabase.from('subscriptions').select('plan').match(key).maybeSingle();
    limit = getPlan(data?.plan || 'free').requestLimit;
  } catch {
    limit = getPlan('free').requestLimit;
  }

  let used = 0;
  try {
    let query = supabase
      .from('api_usage_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart());
    if (orgId) query = query.eq('organization_id', orgId);
    else query = query.eq('developer_id', developerId);
    const { count, error } = await query;
    if (!error) used = count || 0;
  } catch {
    used = 0;
  }

  return { limit, used };
};

export const quotaMiddleware = async (req, res, next) => {
  if (!isFeatureEnabled('usageQuotas')) return next();
  // Only applies to authenticated developer API keys on tenant endpoints.
  if (!req.apiKey) return next();

  // Never block the quota report itself — the dashboard must always show it.
  if (req.method === 'GET' && (req.path === '/quota' || req.path.endsWith('/quota'))) return next();

  const orgId = req.organization?.id || req.apiKey.organization_id || null;
  const developerId = req.developerId || req.apiKey.developer_id;
  const cacheKey = orgId || `dev:${developerId}`;

  const cached = quotaCache.get(cacheKey);
  let quota = cached && cached.expiresAt > Date.now() ? cached.value : await readQuota(orgId, developerId);
  if (!cached || cached.expiresAt <= Date.now()) {
    quotaCache.set(cacheKey, { value: quota, expiresAt: Date.now() + QUOTA_CACHE_TTL_MS });
  }

  req.quota = quota;

  if (quota.limit !== null && quota.used >= quota.limit) {
    const err = new Error(`Monthly request quota exceeded (${quota.used}/${quota.limit}).`);
    err.status = 429;
    err.code = 'DEVELOPER_QUOTA_EXCEEDED';
    return next(err);
  }
  return next();
};

export default quotaMiddleware;