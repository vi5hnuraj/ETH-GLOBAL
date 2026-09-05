/**
 * MaintenanceModeMiddleware — blocks mutating requests while the platform is
 * in maintenance mode.
 *
 * Health/status endpoints and all read-only GET requests remain available so
 * operators (and the status dashboard) can still observe the system. Write
 * methods (POST/PUT/PATCH/DELETE) and non-GET/HEAD/OPTIONS receive 503 with
 * code MAINTENANCE_MODE and a Retry-After hint.
 */

import { isFeatureEnabled } from '../config/featureFlags.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const maintenanceModeMiddleware = (req, res, next) => {
  if (!isFeatureEnabled('maintenanceMode')) return next();

  // Allow the health check / openapi / status endpoints through.
  const healthPath = req.path === '/' || req.path.startsWith('/api/health') || req.path.startsWith('/api/openapi.json');
  if (healthPath && req.method === 'GET') return next();

  // Escapes: the maintenance toggle itself must always be reachable so an
  // operator can disable maintenance from the API (no lockouts).
  if (req.method === 'POST' && /\/platform\/maintenance\/?$/.test(req.path)) return next();

  if (WRITE_METHODS.has(req.method)) {
    res.set('Retry-After', '60');
    return res.status(503).json({
      success: false,
      message: 'Platform is under maintenance. Please try again shortly.',
      code: 'MAINTENANCE_MODE'
    });
  }
  return next();
};

export default maintenanceModeMiddleware;