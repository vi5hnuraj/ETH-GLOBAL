/**
 * AdminController — request handlers for /api/admin/*.
 */

import * as adminService from '../services/adminService.js';
import logger from '../utils/logger.js';
const ok = (res, data, status = 200) => res.status(status).json({ success: true, ...data });
const fail = (res, err, ctx = 'admin') => {
  logger.error(`[${ctx}]`, err.message);
  res.status(err.status || 500).json({ message: err.message || 'Internal error' });
};

// ---- Dashboard ----
export const dashboard = async (req, res) => {
  try { ok(res, { dashboard: await adminService.getDashboard() }); }
  catch (e) { fail(res, e, 'dashboard'); }
};

// ---- Developers ----
export const listDevelopers = async (req, res) => {
  try { ok(res, await adminService.listDevelopers(req.query)); }
  catch (e) { fail(res, e, 'developers'); }
};

// ---- Organizations ----
export const listOrganizations = async (req, res) => {
  try { ok(res, await adminService.listOrganizations(req.query)); }
  catch (e) { fail(res, e, 'organizations'); }
};

export const approveProfile = async (req, res) => {
  try { ok(res, { profile: await adminService.approveOrgProfile(req.params.orgId) }); }
  catch (e) { fail(res, e, 'approve-profile'); }
};

export const rejectProfile = async (req, res) => {
  try { ok(res, { profile: await adminService.rejectOrgProfile(req.params.orgId) }); }
  catch (e) { fail(res, e, 'reject-profile'); }
};

// ---- Marketplace ----
export const listServices = async (req, res) => {
  try { ok(res, await adminService.listServices(req.query)); }
  catch (e) { fail(res, e, 'marketplace'); }
};

// ---- Payments ----
export const listPayments = async (req, res) => {
  try { ok(res, await adminService.listPayments(req.query)); }
  catch (e) { fail(res, e, 'payments'); }
};

// ---- Wallets ----
export const listWallets = async (req, res) => {
  try { ok(res, await adminService.listWallets(req.query)); }
  catch (e) { fail(res, e, 'wallets'); }
};

// ---- Platform Health ----
export const platformHealth = async (req, res) => {
  try { ok(res, { health: await adminService.getPlatformHealth() }); }
  catch (e) { fail(res, e, 'health'); }
};

// ---- Audit Logs ----
export const listPendingProfiles = async (req, res) => {
  try { ok(res, { profiles: await adminService.listPendingProfiles() }); }
  catch (e) { fail(res, e, 'pending-profiles'); }
};

export const getProfileDetail = async (req, res) => {
  try {
    const profile = await adminService.getProfileDetail(req.params.profileId);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    ok(res, { profile });
  } catch (e) { fail(res, e, 'profile-detail'); }
};

export const listAuditLogs = async (req, res) => {
  try { ok(res, await adminService.listAuditLogs(req.query)); }
  catch (e) { fail(res, e, 'audit-logs'); }
};
