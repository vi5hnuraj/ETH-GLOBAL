/**
 * RequireScopeMiddleware — reusable authorization middleware that enforces
 * developer API key scopes on protected endpoints.
 *
 * Decision rules:
 *  - Request authenticated with a developer API key (req.apiKey): the key
 *    must hold at least one of the required scopes (or the `*` wildcard) —
 *    otherwise the request is rejected with 403 SCOPE_FORBIDDEN.
 *  - Request authenticated with an agent API key (req.agent): authorized.
 *    Agent keys are inherently scoped to the owning agent's own operations.
 *  - Request with no API key (browser dashboard via X-Developer-Id): allowed
 *    for backward compatibility — scopes only constrain programmatic keys.
 *
 * Usage: router.get('/agents', usageMiddleware, requireScope(SCOPES.AGENTS_READ), agents);
 *        router.post('/billing/subscribe', requireAnyScope(...scopes), subscribe);
 */

import { WILDCARD_SCOPE, resolveScopeGroup } from '../config/scopes.js';

const rejectForbidden = (res, scope) =>
  res.status(403).json({
    success: false,
    message: `Forbidden: this API key is not authorized for the required scope '${scope}'.`,
    code: 'SCOPE_FORBIDDEN',
    requiredScope: scope
  });

const hasScope = (keyScopes, scope) => {
  const granted = keyScopes || [];
  if (granted.includes(WILDCARD_SCOPE)) return true;
  // Accept the requested scope in either spelling: V1 (agents:create) and the
  // canonical V3 equivalent (agents.write) are interchangeable. Otherwise a
  // UI-created key (which only grants V3 scopes) is wrongly 403'd on routes
  // that still guard with the legacy V1 string.
  return resolveScopeGroup(scope).some((s) => granted.includes(s));
};

/**
 * requireScope(...scopes) — authorize the request if the key holds ANY of the
 * given scopes. Pass a single scope for most endpoints.
 */
export const requireScope =
  (...required) =>
  (req, res, next) => {
    if (req.agent) return next();
    if (req.apiKey) {
      const holds = required.some((scope) => hasScope(req.apiKey.scopes, scope));
      if (!holds) return rejectForbidden(res, required[0]);
    }
    next();
  };

/**
 * requireAllScopes(...scopes) — authorize the request only if the key holds
 * ALL of the given scopes.
 */
export const requireAllScopes =
  (...required) =>
  (req, res, next) => {
    if (req.agent) return next();
    if (req.apiKey) {
      const missing = required.find((scope) => !hasScope(req.apiKey.scopes, scope));
      if (missing) return rejectForbidden(res, missing);
    }
    next();
  };

export default requireScope;
