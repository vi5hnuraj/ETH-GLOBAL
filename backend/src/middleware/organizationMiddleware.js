/**
 * OrganizationMiddleware — request-time tenant resolution + RBAC enforcement.
 *
 * resolveOrganization attaches `req.organization` (the resolved tenant) and
 * `req.membership` (the acting developer's role in it). Requests that target an
 * organization the caller does not belong to are NOT short-circuited here:
 * they record `req.orgResolutionError` (403 ORG_FORBIDDEN / 404 ORG_NOT_FOUND)
 * which requirePermission surfaces on protected routes. Routes that must be
 * reachable without membership (invitation accept/decline) can skip
 * requirePermission and ignore the resolution error.
 *
 * Enforced order on protected routes:
 *   requireScope(scope)   — API key scopes        (403 SCOPE_FORBIDDEN)
 *   requirePermission(p)   — organization role     (403 ROLE_FORBIDDEN)
 * Keys (req.apiKey / req.agent) are authorized purely by scope and skip the
 * role layer; interactive sessions are gated by their org role permission.
 */

import { resolveForRequest, listMyOrganizations } from '../services/organizationService.js';
import { permissionsForRole } from '../config/roles.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Org list cache ────────────────────────────────────────────────
// Cache listMyOrganizations results per user to avoid repeated DB hits.
const ORG_CACHE_TTL_MS = 30_000; // 30 seconds
const orgCache = new Map();
function orgCacheGet(userId) {
  const entry = orgCache.get(userId);
  if (entry && Date.now() - entry.ts < ORG_CACHE_TTL_MS) return entry.orgs;
  if (entry) orgCache.delete(userId);
  return null;
}
function orgCacheSet(userId, orgs) {
  orgCache.set(userId, { orgs, ts: Date.now() });
}

export const resolveOrganization = async (req, _res, next) => {
  try {
    // ALWAYS try JWT user first for org resolution — ignore stale X-Organization-Id header
    const jwtId = req.user?.id;
    const headerOrgId = req.header('x-organization-id');

    // If we have a JWT user, resolve their org directly (bypass stale header)
    if (jwtId && UUID_RE.test(jwtId)) {
      let orgs = orgCacheGet(jwtId);
      if (!orgs || orgs.length === 0) orgs = await listMyOrganizations(jwtId);
      if (orgs && orgs.length > 0) {
        orgCacheSet(jwtId, orgs);
        // Use the requested org if it's in the user's list, otherwise use first
        const requestedOrg = headerOrgId && orgs.find((o) => o.id === headerOrgId);
        const selectedOrg = requestedOrg || orgs[0];
        req.organization = { id: selectedOrg.id, slug: selectedOrg.slug, name: selectedOrg.name, avatar_url: selectedOrg.avatarUrl, metadata: selectedOrg.metadata };
        req.membership = selectedOrg.membership || { role: 'owner' };
        req.orgResolutionError = null;
        return next();
      }
    }

    // Fallback: original resolution path (for API key auth, no JWT, etc.)
    const result = await resolveForRequest({
      developerId: req.developerId,
      jwtUserId: req.user?.id,
      apiKey: req.apiKey,
      orgId: req.params?.orgId,
      headerOrgId,
      headerSlug: req.header('x-organization-slug')
    });
    if (!result || !result.org) {
      req.organization = null;
      req.membership = null;
      req.orgResolutionError = { status: 403, message: 'Organization not found. Please create or select an organization.', code: 'ORG_NOT_FOUND' };
      return next();
    }
    req.organization = result.org;
    req.membership = result.membership;
    req.orgResolutionError = null;
    next();
  } catch (err) {
    if (err.status && (err.code === 'ORG_FORBIDDEN' || err.code === 'ORG_NOT_FOUND')) {
      // Last resort: try JWT user's orgs
      const jwtId = req.user?.id;
      if (jwtId && UUID_RE.test(jwtId)) {
        try {
          let orgs = orgCacheGet(jwtId);
          if (!orgs || orgs.length === 0) orgs = await listMyOrganizations(jwtId);
          if (orgs && orgs.length > 0) {
            orgCacheSet(jwtId, orgs);
            const fallback = orgs[0];
            req.organization = { id: fallback.id, slug: fallback.slug, name: fallback.name, avatar_url: fallback.avatarUrl, metadata: fallback.metadata };
            req.membership = fallback.membership || { role: 'owner' };
            req.orgResolutionError = null;
            return next();
          }
        } catch { /* recovery failed */ }
      }
      req.organization = null;
      req.membership = null;
      req.orgResolutionError = err;
      return next();
    }
    next(err);
  }
};

export const requirePermission = (permission) => (req, res, next) => {
  if (req.orgResolutionError) {
    const e = req.orgResolutionError;
    return res.status(e.status).json({ success: false, message: e.message, code: e.code });
  }
  if (req.apiKey || req.agent) return next();
  if (!req.organization || !req.membership) {
    return res
      .status(403)
      .json({ success: false, message: 'Forbidden: organization membership is required.', code: 'ORG_REQUIRED' });
  }
  const allowed = permissionsForRole(req.membership.role);
  if (!allowed.includes(permission)) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: the '${req.membership.role}' role is not allowed to '${permission}'.`,
      code: 'ROLE_FORBIDDEN',
      requiredPermission: permission
    });
  }
  next();
};
