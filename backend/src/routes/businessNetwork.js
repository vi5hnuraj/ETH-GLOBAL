/**
 * BusinessNetworkRoutes — GlobalPay V3 AI Business Network.
 * Mounted inside the developer router (developer.js): router.use(businessNetworkRoutes)
 * so all URLs are /api/developers/business/...
 *
 * Auth: developerKeyAuthMiddleware + developerContextMiddleware already applied.
 * Each protected route also applies resolveOrganization + requirePermission via guard().
 */

import { Router } from 'express';
import { resolveOrganization, requirePermission } from '../middleware/organizationMiddleware.js';
import { requireScope } from '../middleware/requireScopeMiddleware.js';
import { SCOPES } from '../config/scopes.js';
import {
  listDirectoryHandler,
  getPublicCompanyProfileHandler,
  updateExtendedProfileHandler,
  listRelationshipsHandler,
  refreshRelationshipHandler,
  listPartnershipsHandler,
  respondPartnershipHandler,
  createProjectHandler,
  listProjectsHandler,
  getProjectDetailHandler,
  addProjectParticipantHandler,
  listWorkflowMarketplaceHandler,
  publishWorkflowHandler,
  installWorkflowHandler,
  listWorkflowInstallationsHandler,
  getTrustScoreHandler,
  recomputeTrustScoreHandler,
  getBusinessInsightsHandler,
  getNetworkDashboardHandler,
  getActivityFeedHandler,
  getGlobalActivityFeedHandler,
  createWorkspaceHandler,
  listWorkspacesHandler,
  getWorkspaceDetailHandler,
  inviteOrgToWorkspaceHandler,
} from '../controllers/businessNetworkController.js';

const router = Router();

// Guard helper — same pattern as developer.js
const guard = (scope, permission) => {
  const scopes = Array.isArray(scope) ? scope : [scope];
  return [resolveOrganization, requireScope(...scopes), requirePermission(permission)];
};

// ============================================================================
// Phase 1 — Company Directory (public + authenticated extended)
// ============================================================================
// Public directory: requires auth but open to all org members
router.get('/business/directory', ...guard(SCOPES.SERVICES_READ, 'network.read'), listDirectoryHandler);
router.get('/business/directory/:slug', ...guard(SCOPES.SERVICES_READ, 'network.read'), getPublicCompanyProfileHandler);
// Update extended profile fields (covers, HQ, size, capabilities, visibility)
router.patch('/business/profile/extended', ...guard(SCOPES.SETTINGS_MANAGE, 'network.manage'), updateExtendedProfileHandler);

// ============================================================================
// Phase 2 — Business Relationships (evidence-based, auto-detected)
// ============================================================================
router.get('/business/relationships', ...guard(SCOPES.SERVICES_READ, 'network.read'), listRelationshipsHandler);
// Manual trigger to recompute a specific relationship (admin utility)
router.post('/business/relationships/refresh', ...guard(SCOPES.SETTINGS_MANAGE, 'network.manage'), refreshRelationshipHandler);

// ============================================================================
// Phase 3 — Partnerships (commerce-proven recommendations)
// ============================================================================
router.get('/business/partnerships', ...guard(SCOPES.SERVICES_READ, 'network.read'), listPartnershipsHandler);
router.post('/business/partnerships/:partnershipId/respond', ...guard(SCOPES.SESSIONS_MANAGE, 'network.manage'), respondPartnershipHandler);

// ============================================================================
// Phase 4 — Collaboration Projects
// ============================================================================
router.get('/business/projects', ...guard(SCOPES.SESSIONS_READ, 'network.read'), listProjectsHandler);
router.post('/business/projects', ...guard(SCOPES.SESSIONS_MANAGE, 'network.manage'), createProjectHandler);
router.get('/business/projects/:projectId', ...guard(SCOPES.SESSIONS_READ, 'network.read'), getProjectDetailHandler);
router.post('/business/projects/:projectId/participants', ...guard(SCOPES.SESSIONS_MANAGE, 'network.manage'), addProjectParticipantHandler);

// ============================================================================
// Phase 5 — Workflow Marketplace
// ============================================================================
router.get('/business/workflow-marketplace', ...guard(SCOPES.SERVICES_READ, 'network.read'), listWorkflowMarketplaceHandler);
router.post('/business/workflow-marketplace/publish', ...guard(SCOPES.SERVICES_UPDATE, 'network.manage'), publishWorkflowHandler);
router.post('/business/workflow-marketplace/:templateId/install', ...guard(SCOPES.SESSIONS_MANAGE, 'network.manage'), installWorkflowHandler);
router.get('/business/workflow-marketplace/installed', ...guard(SCOPES.SERVICES_READ, 'network.read'), listWorkflowInstallationsHandler);

// ============================================================================
// Phase 6 — Trust Score
// ============================================================================
router.get('/business/trust-score', ...guard(SCOPES.AGENTS_READ, 'network.read'), getTrustScoreHandler);
router.post('/business/trust-score/refresh', ...guard(SCOPES.SETTINGS_MANAGE, 'network.manage'), recomputeTrustScoreHandler);

// ============================================================================
// Phase 7 — Business Insights
// ============================================================================
router.get('/business/insights', ...guard([SCOPES.BILLING_READ, SCOPES.BILLING_MANAGE], 'network.read'), getBusinessInsightsHandler);

// ============================================================================
// Phase 8 — Global Network Dashboard
// ============================================================================
router.get('/business/network-dashboard', ...guard(SCOPES.AGENTS_READ, 'network.read'), getNetworkDashboardHandler);

// ============================================================================
// Phase 9 — Activity Feed
// ============================================================================
router.get('/business/activity', ...guard(SCOPES.AGENTS_READ, 'network.read'), getActivityFeedHandler);
router.get('/business/activity/global', ...guard(SCOPES.AGENTS_READ, 'network.read'), getGlobalActivityFeedHandler);

// ============================================================================
// Phase 10 — Enterprise Workspaces
// ============================================================================
router.get('/business/workspaces', ...guard(SCOPES.SESSIONS_READ, 'network.read'), listWorkspacesHandler);
router.post('/business/workspaces', ...guard(SCOPES.SESSIONS_MANAGE, 'network.manage'), createWorkspaceHandler);
router.get('/business/workspaces/:workspaceId', ...guard(SCOPES.SESSIONS_READ, 'network.read'), getWorkspaceDetailHandler);
router.post('/business/workspaces/:workspaceId/invite', ...guard(SCOPES.SESSIONS_MANAGE, 'network.manage'), inviteOrgToWorkspaceHandler);

export default router;
