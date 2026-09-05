/**
 * Admin Middleware — gates admin routes behind super_admin role check.
 *
 * Reads the JWT, resolves the developer, then checks the profiles table
 * for platform_role = 'super_admin'. Returns 403 for non-admins.
 */

import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';
import logger from '../utils/logger.js';
export const requireAdmin = async (req, res, next) => {
  try {
    // authMiddleware sets req.user (the full profile row)
    const userId = req.user?.id || req.developerId;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Use platform_role from the profile already loaded by authMiddleware
    let platformRole = req.user?.platform_role;

    // Fallback: direct DB lookup if not already set
    if (!platformRole) {
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT platform_role FROM profiles WHERE id = $1',
        [userId]
      );
      platformRole = rows[0]?.platform_role;
    }

    if (platformRole !== 'super_admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    req.adminRole = platformRole;
    next();
  } catch (err) {
    logger.error('[ADMIN] middleware error:', err.message);
    return res.status(500).json({ message: 'Admin check failed.' });
  }
};
