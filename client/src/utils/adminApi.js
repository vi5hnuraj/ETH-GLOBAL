/**
 * Admin Console API client — wraps /api/admin/*.
 * Only accessible to super_admin users.
 */

import { API_BASE_URL } from './apiBase.js';

const API_URL = API_BASE_URL;

const qs = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

export const AdminApiError = class AdminApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};

const request = async (path, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new AdminApiError(data.message || `Request failed (${res.status})`, res.status);
      err.payload = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AdminApiError('Request timed out.', 0);
    }
    if (err instanceof TypeError || err.message === 'Failed to fetch') {
      throw new AdminApiError('Network error. Could not reach the platform API.', 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export const adminApi = {
  // ---- Dashboard ----
  dashboard: () => request('/admin/dashboard').then((r) => r.dashboard),

  // ---- Developers ----
  developers: (params) => request(`/admin/developers?${qs(params)}`),
  developerDetail: (developerId) => request(`/admin/developers/${encodeURIComponent(developerId)}`),
  suspendDeveloper: (developerId) => request(`/admin/developers/${encodeURIComponent(developerId)}/suspend`, { method: 'POST' }),
  unsuspendDeveloper: (developerId) => request(`/admin/developers/${encodeURIComponent(developerId)}/unsuspend`, { method: 'POST' }),
  deleteDeveloper: (developerId) => request(`/admin/developers/${encodeURIComponent(developerId)}`, { method: 'DELETE' }),
  resetDeveloperKeys: (developerId) => request(`/admin/developers/${encodeURIComponent(developerId)}/reset-keys`, { method: 'POST' }),
  developerOrgs: (developerId) => request(`/admin/developers/${encodeURIComponent(developerId)}/organizations`).then((r) => r.organizations),
  developerPayments: (developerId, params) => request(`/admin/developers/${encodeURIComponent(developerId)}/payments?${qs(params)}`),

  // ---- Organizations ----
  organizations: (params) => request(`/admin/organizations?${qs(params)}`),
  organizationDetail: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}`),
  organizationMembers: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}/members`).then((r) => r.members),
  suspendOrganization: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}/suspend`, { method: 'POST' }),
  unsuspendOrganization: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}/unsuspend`, { method: 'POST' }),
  deleteOrganization: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}`, { method: 'DELETE' }),
  approveOrganizationProfile: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}/approve-profile`, { method: 'POST' }),
  rejectOrganizationProfile: (orgId) => request(`/admin/organizations/${encodeURIComponent(orgId)}/reject-profile`, { method: 'POST' }),

  // ---- Marketplace ----
  marketplaceServices: (params) => request(`/admin/marketplace/services?${qs(params)}`),
  marketplaceServiceDetail: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}`),
  approveService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}/approve`, { method: 'POST' }),
  rejectService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}/reject`, { method: 'POST' }),
  hideService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}/hide`, { method: 'POST' }),
  unhideService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}/unhide`, { method: 'POST' }),
  featureService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}/feature`, { method: 'POST' }),
  unfeatureService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}/unfeature`, { method: 'POST' }),
  removeService: (serviceId) => request(`/admin/marketplace/services/${encodeURIComponent(serviceId)}`, { method: 'DELETE' }),

  // ---- Payments ----
  payments: (params) => request(`/admin/payments?${qs(params)}`),
  paymentDetail: (paymentId) => request(`/admin/payments/${encodeURIComponent(paymentId)}`),
  paymentReceipts: (params) => request(`/admin/payments/receipts?${qs(params)}`),
  failedPayments: (params) => request(`/admin/payments/failed?${qs(params)}`),
  refundPayment: (paymentId) => request(`/admin/payments/${encodeURIComponent(paymentId)}/refund`, { method: 'POST' }),
  blockchainTransaction: (txHash) => request(`/admin/payments/transaction/${encodeURIComponent(txHash)}`),

  // ---- Wallets ----
  wallets: (params) => request(`/admin/wallets?${qs(params)}`),
  walletDetail: (walletId) => request(`/admin/wallets/${encodeURIComponent(walletId)}`),
  walletBalances: (params) => request(`/admin/wallets/balances?${qs(params)}`),
  freezeWallet: (walletId) => request(`/admin/wallets/${encodeURIComponent(walletId)}/freeze`, { method: 'POST' }),
  unfreezeWallet: (walletId) => request(`/admin/wallets/${encodeURIComponent(walletId)}/unfreeze`, { method: 'POST' }),
  walletTransactions: (walletId, params) => request(`/admin/wallets/${encodeURIComponent(walletId)}/transactions?${qs(params)}`),

  // ---- Platform Status ----
  platformHealth: () => request('/admin/platform/health').then((r) => r.health),
  featureFlags: () => request('/admin/platform/feature-flags').then((r) => r.flags),
  updateFeatureFlag: (flagId, enabled) => request(`/admin/platform/feature-flags/${encodeURIComponent(flagId)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  maintenanceMode: () => request('/admin/platform/maintenance').then((r) => r.maintenance),
  setMaintenance: (enabled) => request('/admin/platform/maintenance', { method: 'POST', body: JSON.stringify({ enabled }) }),
  systemWorkers: () => request('/admin/platform/workers').then((r) => r.workers),

  // ---- Profile Approvals ----
  pendingProfiles: () => request('/admin/profiles/pending').then((r) => r.profiles),
  profileDetail: (profileId) => request(`/admin/profiles/${encodeURIComponent(profileId)}`).then((r) => r.profile),

  // ---- Audit Logs ----
  auditLogs: (params) => request(`/admin/audit-logs?${qs(params)}`),
  auditLogDetail: (logId) => request(`/admin/audit-logs/${encodeURIComponent(logId)}`),
  auditLogsExport: async (params = {}, format = 'csv') => {
    const q = qs({ ...params, format });
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/admin/audit-logs/export?${q}`, {
      headers: { Authorization: token ? `Bearer ${token}` : {} }
    });
    if (!res.ok) throw new Error(`Audit export failed (${res.status})`);
    return format === 'json' ? res.json() : res.text();
  },

  // ---- Generic passthrough ----
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

export default adminApi;
