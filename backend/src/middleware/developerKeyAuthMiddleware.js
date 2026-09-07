/**
 * DeveloperKeyAuthMiddleware — authenticates programmatic API calls made with
 * a developer API key.
 *
 *   Authorization: Bearer gpay_dev_...
 *
 * Optional middleware: if no developer key is presented, the request falls
 * through to the X-Developer-Id header-based context (internal dashboard).
 * If a key IS presented it must be valid, active, unexpired, and from an
 * allowed IP (when an allowlist is set) — otherwise the call is rejected.
 *
 * Lookup strategy: the Supabase PostgREST gateway is tried first (fast,
 * connection-pooled). When the gateway degrades to anon — which silently
 * filters every row via RLS and surfaces as a null lookup — the middleware
 * falls back to a direct PostgreSQL query through selectViaDb. This is the
 * same resilience pattern already used by listApiKeys, assertUniqueName and
 * other service-layer reads.
 */

import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { selectViaDb } from '../utils/db.js';
import logger from '../utils/logger.js';
const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

/** Check if the Supabase result indicates a possible anon-degraded gateway.
 *  A degraded gateway returns 200 with an empty array because RLS strips all
 *  rows — .maybeSingle() then surfaces this as { data: null, error: null }. */
const isDegradedLookup = (error, data) => !error && data === null;

const developerKeyAuthMiddleware = async (req, res, next) => {
  try {
    const auth = req.header('authorization') || '';
    const match = auth.match(/^Bearer\s+(gpay_dev_\S+)$/i);

    if (!match) {
      return next();
    }

    const token = match[1];
    const keyHash = hashKey(token);

    // 1) Primary path: Supabase PostgREST (connection-pooled, fast).
    let { data, error } = await supabase
      .from('developer_api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .maybeSingle();

    // 2) Fallback: direct PostgreSQL when the gateway degrades to anon.
    //    The anon role is subject to the dev_keys_owner RLS policy which
    //    filters every row because auth.uid() is null — so .maybeSingle()
    //    returns null even though the key exists and is active.
    if (isDegradedLookup(error, data)) {
      logger.warn('[DEV KEY AUTH] Supabase gateway returned empty — falling back to direct DB lookup');
      const fb = await selectViaDb('developer_api_keys', {
        where: { key_hash: keyHash },
        single: true
      });
      if (fb.data) {
        data = fb.data;
        error = null;
      } else if (fb.error) {
        logger.error('[DEV KEY AUTH] direct DB fallback error:', fb.error.message);
      }
    }

    if (error) {
      logger.error('[DEV KEY AUTH] key lookup error:', error.message || JSON.stringify(error));
      return res.status(401).json({ message: 'Invalid API key.' });
    }
    if (!data) {
      logger.warn('[DEV KEY AUTH] no key found for hash prefix:', token.slice(0, 6) + '***');
      return res.status(401).json({ message: 'Invalid API key.' });
    }
    if (data.status !== 'active') {
      return res.status(403).json({ message: 'API key is revoked or inactive.' });
    }
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ message: 'API key has expired.' });
    }

    const allowlist = data.ip_allowlist || [];
    if (allowlist.length && !allowlist.includes(req.ip)) {
      return res.status(403).json({ message: 'Request not allowed from this IP.' });
    }

    req.developerId = data.developer_id;
    req.apiKey = {
      id: data.id,
      name: data.name,
      scopes: data.scopes || [],
      organizationId: data.organization_id || null
    };

    // Bump last-used + usage counter (fire-and-forget).
    supabase
      .from('developer_api_keys')
      .update({
        last_used_at: new Date().toISOString(),
        usage_count: (data.usage_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.id)
      .then(() => {})
      .catch(() => {});

    next();
  } catch (err) {
    logger.error('[DEV KEY AUTH] error:', err.message);
    res.status(500).json({ message: 'API key authentication service unavailable.' });
  }
};

export default developerKeyAuthMiddleware;
