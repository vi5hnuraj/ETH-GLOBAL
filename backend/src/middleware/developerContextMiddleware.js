/**
 * DeveloperContextMiddleware — resolves the acting developer for platform APIs.
 *
 * Identity precedence:
 *  1. An authenticated developer API key (req.developerId set by
 *     developerKeyAuthMiddleware).
 *  2. A valid JWT bearer token — decoded locally first, Supabase API fallback.
 *  3. In NON-production, X-Developer-Id header as convenience fallback.
 */

import { DEFAULT_DEVELOPER_ID } from '../config/config.js';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabaseClient.js';
import logger from '../utils/logger.js';

// Test runs use the same header-based developer context as development. Only
// the production deployment requires a bearer developer API key.
const isProduction = () => (process.env.NODE_ENV || '').toLowerCase() === 'production';

// ── JWT validation cache ──────────────────────────────────────────
// Cache the result of Supabase API getUser() calls to avoid repeated
// network round-trips for the same token. Entries expire after 60s.
const JWT_CACHE_MAX = 500;
const JWT_CACHE_TTL_MS = 60_000;
const jwtCache = new Map();
function jwtCacheGet(token) {
  const entry = jwtCache.get(token);
  if (entry && Date.now() - entry.ts < JWT_CACHE_TTL_MS) return entry.user;
  if (entry) jwtCache.delete(token);
  return null;
}
function jwtCacheSet(token, user) {
  if (jwtCache.size >= JWT_CACHE_MAX) {
    // Evict oldest entry
    const first = jwtCache.keys().next().value;
    jwtCache.delete(first);
  }
  jwtCache.set(token, { user, ts: Date.now() });
}

/**
 * Extract JWT user — tries local decode first (fast, no network),
 * falls back to Supabase API validation (slower but always works).
 * Returns { id, email } or null.
 */
const extractJwtUser = async (req) => {
  const auth = req.header('authorization') || '';
  const match = auth.match(/^Bearer\s+(?!gpay_dev_)(\S+)$/i);
  if (!match) return null;
  const token = match[1];

  // Try local decode first (fast)
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '';
  if (secret) {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
      const id = decoded.sub || decoded.user_id || decoded.id || null;
      if (id) {
        req._jwtDecoded = decoded;
        return { id, email: decoded.email || null };
      }
    } catch { /* secret mismatch, try Supabase API */ }
  }

  // Check cache first (avoids repeated Supabase API calls for same token)
  const cached = jwtCacheGet(token);
  if (cached) {
    req._jwtDecoded = cached;
    return { id: cached.id, email: cached.email || null };
  }

  // Fallback: validate JWT via Supabase API (works even with different secret)
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      req._jwtDecoded = user;
      jwtCacheSet(token, user);
      return { id: user.id, email: user.email || null };
    }
    if (error) {
      logger.warn('[DEV CTX] Supabase auth.getUser failed:', error.message);
    }
  } catch (err) {
    logger.warn('[DEV CTX] Supabase auth.getUser exception:', err.message);
  }

  return null;
};

const developerContextMiddleware = async (req, _res, next) => {
  try {
    if (req.developerId) {
      req.callerDefaulted = false;
      // If we have a developerId from API key auth, also try to attach the JWT user
      if (!req.user) {
        const jwtUser = await extractJwtUser(req);
        if (jwtUser) {
          req.jwtUserId = jwtUser.id;
          req.user = jwtUser;
          // Upgrade developerId to the real JWT user ID
          req.developerId = jwtUser.id;
        }
      }
      return next();
    }

    // Try JWT auth first (web frontend)
    const jwtUser = await extractJwtUser(req);
    if (jwtUser) {
      req.user = jwtUser;
      req.jwtUserId = jwtUser.id;
      req.developerId = jwtUser.id;
      req.callerDefaulted = false;
      return next();
    }

    if (!isProduction()) {
      const headerId = String(req.header('x-developer-id') || '').trim();
      if (headerId) {
        logger.warn('[DEV CTX] Falling back to X-Developer-Id:', headerId, '- JWT validation failed');
        req.developerId = headerId;
        req.callerDefaulted = false;
        return next();
      }
      req.developerId = DEFAULT_DEVELOPER_ID;
      req.callerDefaulted = true;
      return next();
    }

    const err = new Error('Unauthorized: a valid developer API key is required.');
    err.status = 401;
    next(err);
  } catch (err) {
    logger.error('[DEV CTX] Middleware error:', err.message);
    // Don't crash — fall through to default
    if (!req.developerId) {
      req.developerId = DEFAULT_DEVELOPER_ID;
      req.callerDefaulted = true;
    }
    next();
  }
};

export default developerContextMiddleware;
