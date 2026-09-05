/**
 * Roles — canonical organization roles and the RBAC permission matrix.
 *
 * Every protected endpoint verifies, in order:
 *   1. Authentication       (developer key / context)          -> 401
 *   2. Organization access   (membership + org resolution)     -> 403
 *   3. Organization role     (PERMISSIONS lookup)              -> 403 ROLE_FORBIDDEN
 *   4. API scope             (developer key scopes)            -> 403 SCOPE_FORBIDDEN
 *   5. Resource ownership    (org-scoped queries)              -> 404/403
 *
 * Roles (hierarchical for convenience, but each permission is explicit):
 *   owner          — full control incl. delete org + transfer ownership
 *   admin          — everything except ownership transfer / org deletion
 *   developer      — agents, keys, payments; no billing / no member mgmt
 *   billing_manager— billing, invoices, plans, usage; no agents / members mgmt
 *   viewer         — read-only across the org
 */

export const ROLES = ['owner', 'admin', 'developer', 'billing_manager', 'viewer'];

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  billing_manager: 'Billing Manager',
  viewer: 'Viewer'
};

export const ROLE_DESCRIPTIONS = {
  owner: 'Full control: manage the organization, members, billing, agents, API keys, webhooks and settings. Can delete the organization and transfer ownership.',
  admin: 'Manages members, agents, API keys, webhooks and settings. Cannot transfer ownership or delete the organization.',
  developer: 'Creates and manages AI agents, rotates API keys and sends payments. Read-only billing/usage access. No member or settings management.',
  billing_manager: 'Manages billing, invoices, plans and usage analytics. Read-only for agents, keys and webhooks.',
  viewer: 'Read-only access to agents, analytics, usage, billing and settings.'
};

// Role -> permission catalog. Add a permission here and it is enforced
// everywhere requirePermission(permission) is used.
export const PERMISSIONS = {
  'org.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'org.manage': ['owner'],
  'members.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'members.manage': ['owner', 'admin'],
  'invitations.read': ['owner', 'admin'],
  'invitations.manage': ['owner', 'admin'],
  'audit.read': ['owner', 'admin'],

  'agents.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'agents.manage': ['owner', 'admin', 'developer'],
  'payments.create': ['owner', 'admin', 'developer'],
  'wallets.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'history.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],

  'keys.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'keys.manage': ['owner', 'admin', 'developer'],
  'webhooks.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'webhooks.manage': ['owner', 'admin', 'developer'],

  'billing.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'billing.manage': ['owner', 'admin', 'billing_manager'],
  'usage.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],

  'settings.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'settings.manage': ['owner', 'admin'],

  // Service marketplace
  'services.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'services.manage': ['owner', 'admin', 'developer'],
  'usage.report': ['owner', 'admin', 'developer'],
  'usage.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'invoices.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'invoices.pay': ['owner', 'admin', 'developer'],
  'marketplace.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],

  // Autonomous commerce
  'policy.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'policy.manage': ['owner', 'admin', 'developer'],
  'sessions.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'sessions.manage': ['owner', 'admin', 'developer'],
  'commerce.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],

  // V3 Business Network
  'network.read': ['owner', 'admin', 'developer', 'billing_manager', 'viewer'],
  'network.manage': ['owner', 'admin', 'developer']
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

/** Permissions granted to a single role. */
export const permissionsForRole = (role) =>
  ALL_PERMISSIONS.filter((p) => (PERMISSIONS[p] || []).includes(role));

/** True when the role may perform the permission. Owner always passes. */
export const roleHasPermission = (role, permission) =>
  (PERMISSIONS[permission] || []).includes(role);

/** Roles a member is allowed to be invited/assigned to (never 'owner'). */
export const INVITABLE_ROLES = ['admin', 'developer', 'billing_manager', 'viewer'];
