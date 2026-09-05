/**
 * Scopes — canonical developer API key authorization scopes.
 *
 * V1 scopes (verb:noun format) are preserved for backward compatibility.
 * V3 scopes (noun.verb format) are the canonical GlobalPay V3 permission
 * catalog. Routes accept both formats; SUPPORTED_SCOPES includes both.
 *
 * Every protected developer-platform endpoint is attached to one of these
 * scopes. A developer API key is granted a subset of scopes at creation time
 * and is authorized only for endpoints whose scope it holds. The wildcard
 * scope `*` grants access to every endpoint (admin keys).
 */

export const WILDCARD_SCOPE = '*';

export const SCOPES = {
  // Agents
  AGENTS_CREATE: 'agents:create',
  AGENTS_READ: 'agents:read',
  AGENTS_UPDATE: 'agents:update',
  AGENTS_DELETE: 'agents:delete',
  // Wallets
  WALLETS_READ: 'wallets:read',
  WALLETS_WRITE: 'wallets:write',
  // Payments
  PAYMENTS_CREATE: 'payments:create',
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_REFUND: 'payments:refund',
  PAYMENTS_CANCEL: 'payments:cancel',
  // Transactions
  TRANSACTIONS_READ: 'transactions:read',
  // Webhooks (granular; legacy `webhooks:manage` retained for backward compat)
  WEBHOOKS_READ: 'webhooks:read',
  WEBHOOKS_CREATE: 'webhooks:create',
  WEBHOOKS_UPDATE: 'webhooks:update',
  WEBHOOKS_DELETE: 'webhooks:delete',
  // Billing
  BILLING_READ: 'billing:read',
  BILLING_MANAGE: 'billing:manage',
  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
  // Service marketplace
  SERVICES_READ: 'services:read',
  SERVICES_CREATE: 'services:create',
  SERVICES_UPDATE: 'services:update',
  SERVICES_DELETE: 'services:delete',
  USAGE_READ: 'usage:read',
  USAGE_WRITE: 'usage:write',
  INVOICES_READ: 'invoices:read',
  INVOICES_WRITE: 'invoices:write',
  // Autonomous commerce
  POLICY_READ: 'policy:read',
  POLICY_MANAGE: 'policy:manage',
  SESSIONS_READ: 'sessions:read',
  SESSIONS_MANAGE: 'sessions:manage',
  COMMERCE_READ: 'commerce:read',
  // Legacy aliases (accepted for backward compatibility; not shown in the UI)
  HISTORY_READ: 'history:read',
  WEBHOOKS_MANAGE: 'webhooks:manage'
};

/**
 * V3 Scope Catalog — canonical GlobalPay V3 permission scopes.
 * These use the `resource.action` format and are the primary scopes shown
 * in the Developer Platform UI. Legacy V1 scopes (above) are still accepted
 * by the authorization middleware for backward compatibility.
 */
export const V3_SCOPES = {
  // Organizations
  ORGANIZATIONS_READ: 'organizations.read',
  ORGANIZATIONS_WRITE: 'organizations.write',
  // Members
  MEMBERS_READ: 'members.read',
  MEMBERS_WRITE: 'members.write',
  // API Keys
  API_KEYS_READ: 'api_keys.read',
  API_KEYS_WRITE: 'api_keys.write',
  // AI Agents
  AGENTS_READ: 'agents.read',
  AGENTS_WRITE: 'agents.write',
  AGENTS_EXECUTE: 'agents.execute',
  // AI Marketplace
  MARKETPLACE_READ: 'marketplace.read',
  MARKETPLACE_PUBLISH: 'marketplace.publish',
  MARKETPLACE_INSTALL: 'marketplace.install',
  // AI Services
  SERVICES_READ: 'services.read',
  SERVICES_WRITE: 'services.write',
  SERVICES_MANAGE: 'services.manage',
  // Workflow Marketplace
  WORKFLOWS_READ: 'workflows.read',
  WORKFLOWS_PUBLISH: 'workflows.publish',
  WORKFLOWS_INSTALL: 'workflows.install',
  // Commerce
  SESSIONS_READ: 'sessions.read',
  SESSIONS_CREATE: 'sessions.create',
  SESSIONS_MANAGE: 'sessions.manage',
  // Usage
  USAGE_READ: 'usage.read',
  USAGE_WRITE: 'usage.write',
  // Invoices
  INVOICES_READ: 'invoices.read',
  INVOICES_PAY: 'invoices.pay',
  // Payments
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_SEND: 'payments.send',
  PAYMENTS_REFUND: 'payments.refund',
  // Wallets
  WALLETS_READ: 'wallets.read',
  WALLETS_MANAGE: 'wallets.manage',
  // Transactions
  TRANSACTIONS_READ: 'transactions.read',
  // Revenue
  REVENUE_READ: 'revenue.read',
  // Business Network
  NETWORK_READ: 'network.read',
  NETWORK_MANAGE: 'network.manage',
  // Partnerships
  PARTNERSHIPS_READ: 'partnerships.read',
  PARTNERSHIPS_MANAGE: 'partnerships.manage',
  // Projects
  PROJECTS_READ: 'projects.read',
  PROJECTS_MANAGE: 'projects.manage',
  // Workspaces
  WORKSPACES_READ: 'workspaces.read',
  WORKSPACES_MANAGE: 'workspaces.manage',
  // Trust Score
  TRUST_READ: 'trust.read',
  // Analytics
  ANALYTICS_READ: 'analytics.read',
  // Audit Logs
  AUDIT_READ: 'audit.read',
  // Webhooks
  WEBHOOKS_READ: 'webhooks.read',
  WEBHOOKS_WRITE: 'webhooks.write',
  // Billing
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  // Settings
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write'
};

// Deduplicate and combine all supported scopes (V1 legacy + V3 canonical + wildcard)
export const SUPPORTED_SCOPES = [
  ...new Set([
    WILDCARD_SCOPE,
    ...Object.values(SCOPES),
    ...Object.values(V3_SCOPES)
  ])
];

/**
 * Scope equivalence — maps legacy V1 scopes (verb:noun, e.g. `agents:create`)
 * to their canonical V3 equivalents (noun.verb, e.g. `agents.write`).
 *
 * Keys are created from the UI with V3 scopes only, while some routes still
 * guard on the older V1 strings. Without this map a UI-created key that holds
 * `agents.write` is wrongly rejected for `agents:create` (403 SCOPE_FORBIDDEN),
 * even though the permissions mean the same thing. GlobalPay V3 collapses the
 * granular V1 verbs into coarser resource scopes, so several V1 verbs share one
 * V3 scope.
 */
export const SCOPE_EQUIVALENTS = {
  // Agents
  'agents:create': 'agents.write',
  'agents:update': 'agents.write',
  'agents:delete': 'agents.write',
  'agents:read': 'agents.read',
  // Wallets
  'wallets:read': 'wallets.read',
  'wallets:write': 'wallets.manage',
  // Payments
  'payments:create': 'payments.send',
  'payments:read': 'payments.read',
  'payments:refund': 'payments.refund',
  'payments:cancel': 'payments.refund',
  // Transactions
  'transactions:read': 'transactions.read',
  'history:read': 'transactions.read',
  // Webhooks
  'webhooks:read': 'webhooks.read',
  'webhooks:create': 'webhooks.write',
  'webhooks:update': 'webhooks.write',
  'webhooks:delete': 'webhooks.write',
  'webhooks:manage': 'webhooks.write',
  // Billing
  'billing:read': 'billing.read',
  'billing:manage': 'billing.manage',
  // Settings
  'settings:read': 'settings.read',
  'settings:manage': 'settings.write',
  // Services
  'services:read': 'services.read',
  'services:create': 'services.write',
  'services:update': 'services.write',
  'services:delete': 'services.write',
  // Usage
  'usage:read': 'usage.read',
  'usage:write': 'usage.write',
  // Invoices
  'invoices:read': 'invoices.read',
  'invoices:write': 'invoices.pay',
  // Sessions / Commerce policy
  'sessions:read': 'sessions.read',
  'sessions:manage': 'sessions.manage',
  'policy:read': 'sessions.read',
  'policy:manage': 'sessions.manage',
  'commerce:read': 'sessions.read'
};

/**
 * Resolve every V1 and V3 spelling of a scope to its authorization set. A key
 * holding any member of the set satisfies a route requiring any member.
 */
export const resolveScopeGroup = (scope) => {
  if (!scope) return [];
  const group = new Set([scope]);
  const v3 = SCOPE_EQUIVALENTS[scope];
  if (v3 && !group.has(v3)) group.add(v3);
  for (const [v1, canonical] of Object.entries(SCOPE_EQUIVALENTS)) {
    if (canonical === scope && !group.has(v1)) group.add(v1);
  }
  return [...group];
};
