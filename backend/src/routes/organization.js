/**
 * Organization routes — mounted at /api/developers/orgs (and /api/developers
 * for cross-cutting invitation endpoints). Authentication + developer context
 * are applied by the parent developer router.
 */

import express from 'express';
import { resolveOrganization, requirePermission } from '../middleware/organizationMiddleware.js';
import {
  listMyOrgs,
  create,
  current,
  update,
  remove,
  members,
  changeRole,
  removeMember,
  leave,
  transfer,
  invitations,
  invite,
  cancelInvite,
  acceptInvite,
  declineInvite,
  myInvites,
  settings,
  updateSettings,
  auditLogs,
  rolesCatalog,
  permissions,
  getNotifications,
  markNotification,
  markAllNotifications,
  searchUsersByTag,
  inviteByTagHandler
} from '../controllers/organizationController.js';
import { ok } from '../utils/respond.js';
import { ROLES } from '../config/roles.js';

const router = express.Router();

// ---- cross-cutting (no org membership required) ----

// My organizations (switcher) + create.
router.get('/orgs', listMyOrgs);
router.post('/orgs', create);

// Pending invitations for the current developer (matched by email).
router.get('/invitations', myInvites);

// Notifications (cross-cutting, no org required).
router.get('/notifications', getNotifications);
router.post('/notifications/read/:id', markNotification);
router.post('/notifications/read-all', markAllNotifications);

// User search by GlobalPay tag (cross-cutting).
router.get('/users/search', searchUsersByTag);

// ---- current org ----
router.get('/orgs/current', resolveOrganization, current);

// ---- org-scoped (resolveOrganization captures :orgId, membership enforced) ----
router.use('/orgs/:orgId', resolveOrganization);

router.get('/orgs/:orgId/roles', rolesCatalog);
router.get('/orgs/:orgId/permissions', requirePermission('org.read'), permissions);
router.patch('/orgs/:orgId', requirePermission('org.manage'), update);
router.delete('/orgs/:orgId', requirePermission('org.manage'), remove);

router.get('/orgs/:orgId/members', requirePermission('members.read'), members);
router.post('/orgs/:orgId/members/:memberId/role', requirePermission('members.manage'), changeRole);
router.delete('/orgs/:orgId/members/:memberId', requirePermission('members.manage'), removeMember);
router.post('/orgs/:orgId/leave', requirePermission('members.read'), leave);
router.post('/orgs/:orgId/transfer', requirePermission('org.manage'), transfer);

router.get('/orgs/:orgId/invitations', requirePermission('invitations.read'), invitations);
router.post('/orgs/:orgId/invitations', requirePermission('invitations.manage'), invite);
router.post('/orgs/:orgId/invite-by-tag', requirePermission('invitations.manage'), inviteByTagHandler);
router.delete('/orgs/:orgId/invitations/:token', requirePermission('invitations.manage'), cancelInvite);

// Invitation response endpoints — reachable without membership (token is the proof).
router.post('/orgs/:orgId/invitations/:token/accept', acceptInvite);
router.post('/orgs/:orgId/invitations/:token/decline', declineInvite);

router.get('/orgs/:orgId/settings', requirePermission('settings.read'), settings);
router.patch('/orgs/:orgId/settings', requirePermission('settings.manage'), updateSettings);

router.get('/orgs/:orgId/audit-logs', requirePermission('audit.read'), auditLogs);

// Static role metadata — public (no org context required).
router.get('/roles', (_req, res) => ok(res, { roles: ROLES }));

export default router;
