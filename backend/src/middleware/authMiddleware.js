import { supabase } from '../config/supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from '../utils/boundedFetch.js';
import { getPool } from '../utils/db.js';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const authUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const authAnonKey = process.env.SUPABASE_ANON_KEY;
const authClient = createClient(authUrl || 'https://placeholder.supabase.co', authAnonKey || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: boundedFetch }
});

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token with dedicated stateless Auth Client
    let supabaseUser = null;
    const { data: { user }, error } = await authClient.auth.getUser(token);
    if (user) {
      supabaseUser = user;
    } else {
      // Fallback: decode JWT locally when Supabase auth API is degraded
      try {
        const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '';
        if (secret) {
          const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
          supabaseUser = { id: decoded.sub || decoded.user_id || decoded.id, email: decoded.email };
        }
      } catch (jwtErr) {
        logger.error('[AUTH] JWT decode fallback failed', { error: jwtErr.message });
      }
      if (!supabaseUser) {
        logger.error('[AUTH] getUser failed', { error: error?.message || 'no user, jwt fallback failed' });
        return res.status(401).json({ message: 'Authentication failed' });
      }
    }

    // Fetch user public profile from public.profiles table
    const { data: profile, error: dbErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    // Direct DB fallback if Supabase gateway degraded
    if (dbErr || !profile) {
      logger.warn('[AUTH] Supabase profiles query failed — trying DB fallback', { error: dbErr?.message });
      try {
        const pool = getPool();
        const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1 LIMIT 1', [supabaseUser.id]);
        if (rows && rows.length > 0) {
          req.user = rows[0];
          return next();
        }
      } catch (dbFallbackErr) {
        logger.error('[AUTH] DB fallback also failed', { error: dbFallbackErr.message });
      }
      return res.status(401).json({ message: 'Authentication failed' });
    }

    // Attach full profile object to request (shape is matching Mongoose user document fields)
    req.user = profile;

    next();
  } catch (err) {
    logger.error('[AUTH] Token verification error', { error: err.message });
    res.status(500).json({ message: 'Authentication service unavailable' });
  }
};

export default authMiddleware;
