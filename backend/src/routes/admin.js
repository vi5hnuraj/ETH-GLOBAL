/**
 * Admin Routes — /api/admin/*
 *
 * All routes require super_admin role (enforced by requireAdmin middleware).
 */

import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import {
  dashboard,
  listDevelopers,
  listOrganizations,
  approveProfile,
  rejectProfile,
  listServices,
  listPayments,
  listWallets,
  platformHealth,
  listAuditLogs,
  listPendingProfiles,
  getProfileDetail,
} from '../controllers/adminController.js';
import { ok } from '../utils/respond.js';

const router = Router();

// All admin routes require JWT auth + super_admin role
router.use(authMiddleware);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', dashboard);

// Developers
router.get('/developers', listDevelopers);

// Organizations
router.get('/organizations', listOrganizations);
router.post('/organizations/:orgId/approve-profile', approveProfile);
router.post('/organizations/:orgId/reject-profile', rejectProfile);

// Marketplace
router.get('/marketplace/services', listServices);

// Payments
router.get('/payments', listPayments);

// Wallets
router.get('/wallets', listWallets);

// Platform
router.get('/platform/health', platformHealth);

router.get('/platform/workers', (req, res) => {
  ok(res, { workers: global.__workerStatus || { broadcastRecovery: { status: 'unknown' }, scheduledPayment: { status: 'unknown' } } });
});

router.get('/platform/feature-flags', (req, res) => {
  ok(res, { flags: [] });
});

router.get('/platform/maintenance', (req, res) => {
  ok(res, { maintenance: { enabled: false } });
});

router.post('/platform/maintenance', (req, res) => {
  ok(res, { maintenance: { enabled: !!req.body?.enabled } });
});

// Audit Logs
router.get('/audit-logs', listAuditLogs);

// Profile Approvals
router.get('/profiles/pending', listPendingProfiles);
router.get('/profiles/:profileId', getProfileDetail);

export default router;
