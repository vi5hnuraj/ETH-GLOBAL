/**
 * NetworkRoutes — Phase 5 Global AI Network sub-router.
 *
 * Mounted inside the developer console router (like organization.js), so the
 * full URLs are /api/developers/network/... Authentication (developer key +
 * context) comes from the parent router in routes/developer.js.
 */

import { Router } from 'express';
import { requirePermission, resolveOrganization } from '../middleware/organizationMiddleware.js';
import { requireScope } from '../middleware/requireScopeMiddleware.js';
import { SCOPES } from '../config/scopes.js';
import {
  devGetProfile,
  devUpsertProfile,
  devListPublicProfiles,
  devSmartProcurement,
  devAutoRoute,
  devCreateTemplate,
  devListTemplates,
  devUpdateTemplate,
  devDeleteTemplate,
  devDeployTemplate,
  devRunWorkflow,
  devListRuns,
  devGetRun,
  devCancelRun,
  devNetworkAnalytics,
  devNetworkTimeline,
  devNetworkActivity,
  devNetworkHealth,
  devNetworkLeaderboard
} from '../controllers/networkController.js';

const router = Router();

const guard = (scope, permission) => {
  const scopes = Array.isArray(scope) ? scope : [scope];
  return [resolveOrganization, requireScope(...scopes), requirePermission(permission)];
};

// --- 5.1 / 5.2 Company profiles + verification (org.read / org.manage, no scope) ---
router.get('/network/profile', resolveOrganization, requirePermission('org.read'), devGetProfile);
router.put('/network/profile', resolveOrganization, requirePermission('org.manage'), devUpsertProfile);
router.get('/network/profiles', ...guard(SCOPES.SERVICES_READ, 'marketplace.read'), devListPublicProfiles);

// --- AI Service Advisor (formerly Smart Procurement) ---
router.post('/network/smart-procurement', ...guard(SCOPES.SERVICES_READ, 'commerce.read'), devSmartProcurement);
router.post('/network/route', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devAutoRoute);

// --- Workflow templates ---
router.get('/network/workflow-templates', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), devListTemplates);
router.post('/network/workflow-templates', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devCreateTemplate);
router.patch('/network/workflow-templates/:templateId', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devUpdateTemplate);
router.delete('/network/workflow-templates/:templateId', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devDeleteTemplate);
router.post('/network/workflow-templates/:templateId/deploy', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devDeployTemplate);

// --- Workflow execution ---
router.post('/network/workflows', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devRunWorkflow);
router.get('/network/workflows', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), devListRuns);
router.get('/network/workflows/:runId', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), devGetRun);
router.post('/network/workflows/:runId/cancel', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devCancelRun);

// --- Network Analytics ---
router.get('/network/analytics', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), devNetworkAnalytics);
router.get('/network/analytics/timeline', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), devNetworkTimeline);
router.get('/network/analytics/activity', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), devNetworkActivity);
router.get('/network/analytics/health', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), devNetworkHealth);
router.get('/network/analytics/leaderboard', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), devNetworkLeaderboard);

export default router;