/**
 * Developer Platform API client — wraps /api/developers/*.
 * Errors carry a `setupRequired` flag when the Supabase tables are missing,
 * which the UI uses to show the Phase 1 "Setup Required" state.
 */

import { getDeveloperId, getOrganizationId } from './identity.js';
import { API_BASE_URL } from './apiBase.js';

const API_URL = API_BASE_URL;

// ── Request cache & deduplication ────────────────────────────────
// Deduplicates identical in-flight requests and caches GET responses
// for a short TTL to avoid re-fetching on every navigation.
const inflight = new Map();
const responseCache = new Map();
const CACHE_TTL_MS = 8000; // 8 seconds — fast but prevents duplicate fetches
const CACHE_MAX = 100;

function cacheKey(path, opts) {
  // Scope the cache by organization. Without this, switching orgs in the
  // sidebar returns the previous org's cached responses (the remounted page
  // fetches the same path and hits the stale entry), so the dashboard keeps
  // showing the old org's data until a hard refresh.
  const org = getOrganizationId() || 'none';
  return `${opts?.method || 'GET'}:${org}:${path}`;
}

function cacheGet(key) {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  if (entry) responseCache.delete(key);
  return null;
}

function cacheSet(key, data) {
  if (responseCache.size >= CACHE_MAX) {
    const first = responseCache.keys().next().value;
    responseCache.delete(first);
  }
  responseCache.set(key, { data, ts: Date.now() });
}

const qs = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

export const ApiError = class ApiError extends Error {
  constructor(message, status, setupRequired) {
    super(message);
    this.status = status;
    this.setupRequired = !!setupRequired;
  }
};

const request = async (path, options = {}) => {
  const isGet = !options.method || options.method === 'GET';
  const key = cacheKey(path, options);

  // 1) Return cached GET response if available
  if (isGet && !options.skipCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  // 2) Deduplicate identical in-flight requests
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    // Only send X-Developer-Id when no JWT is available (JWT takes priority)
    ...(!token ? { 'X-Developer-Id': getDeveloperId() } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(getOrganizationId() ? { 'X-Organization-Id': getOrganizationId() } : {}),
    ...(options.headers || {})
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 20000);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Auto-clear stale org ID on 403/404 for any org-scoped request
      if ((res.status === 403 || res.status === 404) && getOrganizationId()) {
        localStorage.removeItem('gpay_org_id');
        // Force OrgSwitcher to reload with a valid org
        window.dispatchEvent(new CustomEvent('organizationchange', { detail: { id: null } }));
      }
      const err = new ApiError(data.message || `Request failed (${res.status})`, res.status, data.setupRequired);
      err.payload = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out. The platform API did not respond.', 0);
    }
    if (err instanceof TypeError || err.message === 'Failed to fetch') {
      throw new ApiError('Network error. Could not reach the platform API. Check your connection and try again.', 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    inflight.delete(key);
  }
  })();

  inflight.set(key, promise);
  try {
    const result = await promise;
    if (isGet) cacheSet(key, result);
    return result;
  } catch (err) {
    throw err;
  }
};

// Invalidate cached GET responses that match a prefix (called after mutations)
function invalidateCache(pathPrefix) {
  for (const key of responseCache.keys()) {
    if (key.endsWith(pathPrefix) || key.includes(pathPrefix)) {
      responseCache.delete(key);
    }
  }
}

export const developerApi = {
  status: () => request('/developers/status', { skipCache: true }),
  dashboard: () => request('/developers/dashboard').then((r) => r.dashboard),
  analytics: (range = 'month') => request(`/developers/analytics?range=${encodeURIComponent(range)}`).then((r) => r.analytics),
  usage: () => request('/developers/usage').then((r) => r.usage),
  revenue: () => request('/developers/revenue').then((r) => r.revenue),
  agents: (params) => request(`/developers/agents?${qs(params)}`),
  createAgent: (body) => request('/developers/agents', { method: 'POST', body: JSON.stringify(body) }),
  deleteAgent: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' }),
  suspendAgent: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}/suspend`, { method: 'POST' }),
  resumeAgent: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}/resume`, { method: 'POST' }),
  agentDetail: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}`).then((r) => r.agent),
  agentBalance: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}/balance`),
  agentPay: (agentId, body) => request(`/developers/agents/${encodeURIComponent(agentId)}/pay`, { method: 'POST', body: JSON.stringify(body) }),
  agentHistory: (agentId, params) => request(`/developers/agents/${encodeURIComponent(agentId)}/history?${qs(params)}`).then((r) => r.transactions),
  agentStats: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}/stats`),
  agentRotateKey: (agentId) => request(`/developers/agents/${encodeURIComponent(agentId)}/rotate-key`, { method: 'POST' }),
  monitoring: () => request('/developers/monitoring').then((r) => r.monitoring),
  audit: (params) => request(`/developers/audit?${qs(params)}`).then((r) => r.auditLogs),
  auditExport: async (format = 'csv') => {
    const url = `${API_URL}/developers/audit/export?format=${format}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          ...(!token ? { 'X-Developer-Id': getDeveloperId() } : {}),
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...(getOrganizationId() ? { 'X-Organization-Id': getOrganizationId() } : {})
        }
      });
      if (!res.ok) throw new Error(`Audit export failed (${res.status})`);
      return format === 'json' ? res.json() : res.text();
    } finally {
      clearTimeout(timer);
    }
  },
  quota: () => request('/developers/quota').then((r) => r.quota),
  openapi: () => request('/openapi.json'),
  platformHealth: () => request('/platform/health'),
  featureFlags: () => request('/platform/flags').then((r) => r.flags),
  environment: () => request('/platform/environment'),
  setMaintenance: (enabled) =>
    request('/developers/platform/maintenance', { method: 'POST', body: JSON.stringify({ enabled }) }).then((r) => r.maintenanceMode),
  billing: () => request('/developers/billing'),
  subscribe: (plan) => request('/developers/billing/subscribe', { method: 'POST', body: JSON.stringify({ plan }) }),
  paySubscription: (walletId) => request('/developers/billing/pay', { method: 'POST', body: JSON.stringify({ walletId }) }),
  paySubscriptionWithTxHash: (walletId, txHash) => request('/developers/billing/pay', { method: 'POST', body: JSON.stringify({ walletId, txHash }) }),

  getSettings: () => request('/developers/settings').then((r) => r.settings),
  saveSettings: (patch) => request('/developers/settings', { method: 'PUT', body: JSON.stringify(patch) }).then((r) => r.settings),

  apiKeys: () => request('/developers/api-keys').then((r) => r.apiKeys),
  createApiKey: ({ name, scopes, expiresAt, ipAllowlist }) =>
    request('/developers/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes, expiresAt, ipAllowlist }) }),
  updateApiKey: (id, { name, scopes, expiresAt, ipAllowlist }) =>
    request(`/developers/api-keys/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name, scopes, expiresAt, ipAllowlist }) }),
  rotateApiKey: (id) => request(`/developers/api-keys/${encodeURIComponent(id)}/rotate`, { method: 'POST' }),
  revokeApiKey: (id) => request(`/developers/api-keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  deleteApiKey: (id) => request(`/developers/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  requestLogs: (params) => request(`/developers/requests?${qs(params)}`),
  exportRequestLogs: async (params = {}, format = 'csv') => {
    const q = qs({ ...params, format });
    const res = await fetch(`${API_URL}/developers/requests/export?${q}`, {
      headers: {
        ...(!token ? { 'X-Developer-Id': getDeveloperId() } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(getOrganizationId() ? { 'X-Organization-Id': getOrganizationId() } : {})
      }
    });
    if (!res.ok) throw new Error(`Request log export failed (${res.status})`);
    return format === 'json' ? res.json() : res.text();
  },

  webhookEvents: () => request('/developers/webhooks/events').then((r) => r.events),
  webhooks: () => request('/developers/webhooks').then((r) => r.endpoints),
  createWebhook: (body) => request('/developers/webhooks', { method: 'POST', body: JSON.stringify(body) }),
  updateWebhook: (id, body) => request(`/developers/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteWebhook: (id) => request(`/developers/webhooks/${id}`, { method: 'DELETE' }),
  webhookDeliveries: (params) => request(`/developers/webhooks/deliveries?${qs(params)}`).then((r) => r.deliveries),
  retryWebhookDelivery: (id) => request(`/developers/webhooks/deliveries/${id}/retry`, { method: 'POST' }),
  verifyWebhookSignature: (body) => request('/developers/webhooks/verify', { method: 'POST', body: JSON.stringify(body) }),

  // ---- Service Marketplace ----
  marketplace: (params) => request(`/developers/marketplace?${qs(params)}`),
  marketplaceService: (serviceId) => request(`/developers/marketplace/${encodeURIComponent(serviceId)}`),
  marketplaceRevenue: () => request('/developers/marketplace/revenue'),
  services: (params) => request(`/developers/services?${qs(params)}`),
  createService: (body) => request('/developers/services', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.service),
  updateService: (serviceId, body) => request(`/developers/services/${encodeURIComponent(serviceId)}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.service),
  deleteService: (serviceId, agentId) =>
    request(`/developers/services/${encodeURIComponent(serviceId)}`, { method: 'DELETE', body: JSON.stringify({ agentId }) }),
  usageReports: (params) => request(`/developers/usage-reports?${qs(params)}`),
  reportUsage: (body) => request('/developers/usage-reports', { method: 'POST', body: JSON.stringify(body) }),
  invoices: (params) => request(`/developers/invoices?${qs(params)}`),
  invoice: (invoiceId) => request(`/developers/invoices/${encodeURIComponent(invoiceId)}`),
  payInvoice: (invoiceId, consumerAgentId) =>
    request(`/developers/invoices/${encodeURIComponent(invoiceId)}/pay`, { method: 'POST', body: JSON.stringify({ consumerAgentId }) }),

  // Prepaid purchase (atomic): intent -> pending payment; confirm only when the
  // user explicitly approves the charge. The invoice + credits are created
  // server-side only after the MPC payment is confirmed.
  prepaidIntent: ({ serviceId, consumerAgentId, quantity, reason }) =>
    request('/developers/commerce/prepaid', {
      method: 'POST',
      body: JSON.stringify({ serviceId, consumerAgentId, quantity: String(quantity), reason })
    }).then((r) => r.session),
  confirmPrepaidPurchase: (sessionId) =>
    request(`/developers/commerce/prepaid/${encodeURIComponent(sessionId)}/confirm`, { method: 'POST', body: '{}' }),

  // ---- Autonomous Commerce ----
  updateCapabilities: (serviceId, body) => request(`/developers/services/${encodeURIComponent(serviceId)}/capabilities`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.capabilities),
  recommendProviders: (body) => request('/developers/marketplace/recommend', { method: 'POST', body: JSON.stringify(body) }),
  commerceSessions: (params) => request(`/developers/commerce/sessions?${qs(params)}`),
  createCommerceSession: (body) => request('/developers/commerce/sessions', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.session),
  commerceSession: (sessionId) => request(`/developers/commerce/sessions/${encodeURIComponent(sessionId)}`).then((r) => r.session),
  sessionAction: (sessionId, action) => request(`/developers/commerce/sessions/${encodeURIComponent(sessionId)}/${action}`, { method: 'POST' }).then((r) => r.session),
  aiRecommendations: () => request('/developers/commerce/optimization').then((r) => r.recommendations),
  commerceDashboard: () => request('/developers/commerce/graph').then((r) => r.graph), // legacy alias
  commerceGraph: () => request('/developers/commerce/graph').then((r) => r.graph),
  commerceMonthlyReport: () => request('/developers/commerce/reports/monthly').then((r) => r.report),
  commerceCompliance: () => request('/developers/commerce/compliance').then((r) => r.logs),

  // ---- Organizations + RBAC ----
  organizations: () => request('/developers/orgs').then((r) => r.organizations),
  createOrganization: (body) => request('/developers/orgs', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.organization),
  currentOrganization: () => request('/developers/orgs/current'),
  updateOrganization: (orgId, body) => request(`/developers/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOrganization: (orgId) => request(`/developers/orgs/${orgId}`, { method: 'DELETE' }),
  orgMembers: (orgId) => request(`/developers/orgs/${orgId}/members`).then((r) => r.members),
  changeMemberRole: (orgId, memberId, role) => request(`/developers/orgs/${orgId}/members/${memberId}/role`, { method: 'POST', body: JSON.stringify({ role }) }),
  removeOrgMember: (orgId, memberId) => request(`/developers/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' }),
  leaveOrganization: (orgId) => request(`/developers/orgs/${orgId}/leave`, { method: 'POST' }),
  transferOwnership: (orgId, toDeveloperId) => request(`/developers/orgs/${orgId}/transfer`, { method: 'POST', body: JSON.stringify({ toDeveloperId }) }),
  orgInvitations: (orgId) => request(`/developers/orgs/${orgId}/invitations`).then((r) => r.invitations),
  inviteMember: (orgId, email, role) => request(`/developers/orgs/${orgId}/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  cancelInvitation: (orgId, token) => request(`/developers/orgs/${orgId}/invitations/${token}`, { method: 'DELETE' }),
  myInvitations: () => request('/developers/invitations').then((r) => r.invitations),
  acceptInvitation: (orgId, token) => request(`/developers/orgs/${orgId}/invitations/${token}/accept`, { method: 'POST' }),
  declineInvitation: (orgId, token) => request(`/developers/orgs/${orgId}/invitations/${token}/decline`, { method: 'POST' }),
  orgSettings: (orgId) => request(`/developers/orgs/${orgId}/settings`).then((r) => r.settings),
  saveOrgSettings: (orgId, patch) => request(`/developers/orgs/${orgId}/settings`, { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r.settings),
  orgAuditLogs: (orgId, params) => request(`/developers/orgs/${orgId}/audit-logs?${qs(params)}`).then((r) => r.auditLogs),
  rolesCatalog: (orgId) => request(`/developers/orgs/${orgId}/roles`).then((r) => r.roles),

  // ---- Notifications ----
  notifications: (unreadOnly) => request(`/developers/notifications${unreadOnly ? '?unread=true' : ''}`).then((r) => ({ notifications: r.notifications, unread: r.unread })),
  markNotificationRead: (id) => request(`/developers/notifications/read/${id}`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/developers/notifications/read-all', { method: 'POST' }),

  // ---- Tag-based search & invite ----
  searchUsersByTag: (q) => request(`/developers/users/search?q=${encodeURIComponent(q)}`).then((r) => r.users),
  inviteByTag: (orgId, tag, role) => request(`/developers/orgs/${orgId}/invite-by-tag`, { method: 'POST', body: JSON.stringify({ tag, role }) }).then((r) => r.invitation),

  // ---- AI Service Advisor (formerly Smart Procurement) ----
  aiServiceAdvisor: (body) => request('/developers/network/smart-procurement', { method: 'POST', body: JSON.stringify(body) }),
  autoRoute: (body) => request('/developers/network/route', { method: 'POST', body: JSON.stringify(body) }),
  workflowTemplates: (params) => request(`/developers/network/workflow-templates?${qs(params)}`).then((r) => r.templates),
  createWorkflowTemplate: (body) => request('/developers/network/workflow-templates', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.template),
  updateWorkflowTemplate: (templateId, body) => request(`/developers/network/workflow-templates/${encodeURIComponent(templateId)}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.template),
  deleteWorkflowTemplate: (templateId) => request(`/developers/network/workflow-templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' }),
  deployWorkflowTemplate: (templateId, body) => request(`/developers/network/workflow-templates/${encodeURIComponent(templateId)}/deploy`, { method: 'POST', body: JSON.stringify(body), timeout: 120000 }).then((r) => r),
  runWorkflow: (body) => request('/developers/network/workflows', { method: 'POST', body: JSON.stringify(body), timeout: 120000 }).then((r) => r),
  workflowRuns: (params) => request(`/developers/network/workflows?${qs(params)}`),
  workflowRun: (runId) => request(`/developers/network/workflows/${encodeURIComponent(runId)}`).then((r) => r),
  cancelWorkflowRun: (runId) => request(`/developers/network/workflows/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }).then((r) => r.run),
  networkAnalytics: () => request('/developers/network/analytics').then((r) => r.analytics),
  networkTimeline: (days = 30) => request(`/developers/network/analytics/timeline?days=${days}`).then((r) => r.timeline),
  networkActivity: (limit = 20) => request(`/developers/network/analytics/activity?limit=${limit}`).then((r) => r.activity),
  networkHealth: () => request('/developers/network/analytics/health').then((r) => r.health),
  networkLeaderboard: () => request('/developers/network/analytics/leaderboard').then((r) => r.leaderboard),

  // ---- Company Profiles (Network) ----
  networkProfile: () => request('/developers/network/profile').then((r) => r.profile),
  saveNetworkProfile: (body) => request('/developers/network/profile', { method: 'PUT', body: JSON.stringify(body) }),
  networkProfiles: (params) => request(`/developers/network/profiles?${qs(params)}`).then((r) => r.profiles),

  // ---- AI Agent Marketplace (v2) ----
  marketplaceBrowse: (params) => request(`/developers/agent-marketplace/browse?${qs(params)}`),
  marketplaceListing: (listingId) => request(`/developers/agent-marketplace/browse/${encodeURIComponent(listingId)}`),
  marketplaceReviews: (listingId, params) => request(`/developers/agent-marketplace/browse/${encodeURIComponent(listingId)}/reviews?${qs(params)}`).then((r) => r),
  marketplaceInstall: (body) => request('/developers/agent-marketplace/install', { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplaceInstallations: (params) => request(`/developers/agent-marketplace/installations?${qs(params)}`).then((r) => r),
  marketplaceInstallation: (installationId) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}`).then((r) => r),
  marketplaceUpdateInstallation: (installationId, body) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r),
  marketplaceCancelInstallation: (installationId) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}/cancel`, { method: 'POST' }).then((r) => r),
  marketplaceInvoke: (installationId, body) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}/invoke`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplaceReview: (installationId, body) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}/review`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplaceSubscriptions: (params) => request(`/developers/agent-marketplace/subscriptions?${qs(params)}`).then((r) => r),
  marketplaceChangeSubscription: (installationId, body) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}/subscription`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplaceRenewSubscription: (installationId, body) => request(`/developers/agent-marketplace/installations/${encodeURIComponent(installationId)}/subscription/renew`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplacePublishableAgents: (params) => request(`/developers/agent-marketplace/agents-publishable?${qs(params)}`).then((r) => r),
  marketplaceMyListings: (params) => request(`/developers/agent-marketplace/listings?${qs(params)}`).then((r) => r),
  marketplacePublish: (agentId, body) => request(`/developers/agent-marketplace/agents/${encodeURIComponent(agentId)}/publish`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplaceUpdateListing: (listingId, body) => request(`/developers/agent-marketplace/listing/${encodeURIComponent(listingId)}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r),
  marketplaceDeleteListing: (listingId) => request(`/developers/agent-marketplace/listing/${encodeURIComponent(listingId)}`, { method: 'DELETE' }).then((r) => r),
  marketplacePublishVersion: (listingId, body) => request(`/developers/agent-marketplace/listing/${encodeURIComponent(listingId)}/versions`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r),
  marketplaceVersions: (listingId) => request(`/developers/agent-marketplace/listing/${encodeURIComponent(listingId)}/versions`).then((r) => r),
  marketplaceStoreDashboard: () => request('/developers/agent-marketplace/store/dashboard').then((r) => r.dashboard),
  marketplaceConsumerDashboard: () => request('/developers/agent-marketplace/consumer/dashboard').then((r) => r.dashboard),

  // ---- Enterprise (gated behind isEnterprise flag) ----
  businessDirectory: (params) => request(`/developers/business/directory?${qs(params)}`),
  businessProfilePublic: (slug) => request(`/developers/business/directory/${encodeURIComponent(slug)}`).then((r) => r.profile),
  updateBusinessProfileExtended: (body) => request('/developers/business/profile/extended', { method: 'PATCH', body: JSON.stringify(body) }),
  businessRelationships: (params) => request(`/developers/business/relationships?${qs(params)}`),
  refreshBusinessRelationship: (body) => request('/developers/business/relationships/refresh', { method: 'POST', body: JSON.stringify(body) }),
  businessPartnerships: (params) => request(`/developers/business/partnerships?${qs(params)}`),
  respondBusinessPartnership: (id, action) => request(`/developers/business/partnerships/${encodeURIComponent(id)}/respond`, { method: 'POST', body: JSON.stringify({ action }) }),
  businessProjects: (params) => request(`/developers/business/projects?${qs(params)}`),
  createBusinessProject: (body) => request('/developers/business/projects', { method: 'POST', body: JSON.stringify(body) }),
  businessProjectDetail: (projectId) => request(`/developers/business/projects/${encodeURIComponent(projectId)}`).then((r) => r.project),
  addBusinessProjectParticipant: (projectId, body) => request(`/developers/business/projects/${encodeURIComponent(projectId)}/participants`, { method: 'POST', body: JSON.stringify(body) }),
  businessTrustScore: () => request('/developers/business/trust-score').then((r) => r.trustScore),
  refreshBusinessTrustScore: () => request('/developers/business/trust-score/refresh', { method: 'POST' }),
  businessInsights: () => request('/developers/business/insights').then((r) => r.insights),
  businessNetworkDashboard: () => request('/developers/business/network-dashboard').then((r) => r.dashboard),
  businessActivityFeed: (params) => request(`/developers/business/activity?${qs(params)}`),
  businessGlobalActivityFeed: (params) => request(`/developers/business/activity/global?${qs(params)}`),
  businessWorkspaces: () => request('/developers/business/workspaces'),
  createBusinessWorkspace: (body) => request('/developers/business/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  businessWorkspaceDetail: (workspaceId) => request(`/developers/business/workspaces/${encodeURIComponent(workspaceId)}`),
  inviteOrgToBusinessWorkspace: (workspaceId, body) => request(`/developers/business/workspaces/${encodeURIComponent(workspaceId)}/invite`, { method: 'POST', body: JSON.stringify(body) }),

  // ---- Generic passthrough for raw payload access ----
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (path, body) =>
    request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: (path, body) =>
    request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: (path) => request(path, { method: 'DELETE' })
};

export default developerApi;
