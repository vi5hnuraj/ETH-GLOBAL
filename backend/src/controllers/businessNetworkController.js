/**
 * BusinessNetworkController — HTTP handlers for GlobalPay V3 AI Business Network.
 * Thin adapter: validates, calls the service, returns ok() or handleError().
 * Auth/RBAC enforced by the routes layer (resolveOrganization + requirePermission).
 */

import {
  listDirectory,
  getPublicCompanyProfile,
  updateExtendedProfileFields,
  listRelationships,
  refreshRelationship,
  listPartnerships,
  respondToPartnership,
  createProject,
  addProjectParticipant,
  listProjects,
  getProjectDetail,
  publishWorkflow,
  listWorkflowMarketplace,
  installWorkflow,
  listWorkflowInstallations,
  computeTrustScore,
  getTrustScoreDetail,
  getBusinessInsights,
  getNetworkDashboard,
  getActivityFeed,
  getGlobalActivityFeed,
  postActivityEvent,
  createWorkspace,
  inviteOrgToWorkspace,
  listWorkspaces,
  getWorkspaceDetail,
} from '../services/businessNetworkService.js';
import { ok, handleError } from '../utils/respond.js';

// ============================================================================
// Phase 1 — Company Directory
// ============================================================================

export const listDirectoryHandler = async (req, res) => {
  try {
    const { country, industry, verificationLevel, minTrustScore, aiCapability, marketplaceCategory, search, page, perPage } = req.query;
    const result = await listDirectory({ country, industry, verificationLevel, minTrustScore, aiCapability, marketplaceCategory, search, page, perPage });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'directory');
  }
};

export const getPublicCompanyProfileHandler = async (req, res) => {
  try {
    const profile = await getPublicCompanyProfile(req.params.slug);
    return ok(res, { profile });
  } catch (err) {
    return handleError(res, err, 'directory');
  }
};

export const updateExtendedProfileHandler = async (req, res) => {
  try {
    const result = await updateExtendedProfileFields({
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      patch: req.body || {},
    });
    return ok(res, { message: '✅ Company profile updated.', ...result });
  } catch (err) {
    return handleError(res, err, 'profile');
  }
};

// ============================================================================
// Phase 2 — Business Relationships (auto-detected)
// ============================================================================

export const listRelationshipsHandler = async (req, res) => {
  try {
    const result = await listRelationships({
      orgId: req.organization.id,
      minStrength: req.query.minStrength,
      page: req.query.page,
      perPage: req.query.perPage,
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'relationships');
  }
};

export const refreshRelationshipHandler = async (req, res) => {
  try {
    const { partnerOrgId } = req.body || {};
    if (!partnerOrgId) return res.status(400).json({ success: false, message: 'partnerOrgId is required.' });
    const result = await refreshRelationship(req.organization.id, partnerOrgId);
    return ok(res, { message: '🔄 Relationship refreshed.', relationship: result });
  } catch (err) {
    return handleError(res, err, 'relationships');
  }
};

// ============================================================================
// Phase 3 — Partnerships
// ============================================================================

export const listPartnershipsHandler = async (req, res) => {
  try {
    const partnerships = await listPartnerships({ orgId: req.organization.id, status: req.query.status });
    return ok(res, { partnerships, count: partnerships.length });
  } catch (err) {
    return handleError(res, err, 'partnerships');
  }
};

export const respondPartnershipHandler = async (req, res) => {
  try {
    const { action } = req.body || {};
    if (!action) return res.status(400).json({ success: false, message: 'action is required (accept|reject).' });
    const result = await respondToPartnership({
      partnershipId: req.params.partnershipId,
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      action,
    });
    return ok(res, { message: `Partnership ${result.status}.`, ...result });
  } catch (err) {
    return handleError(res, err, 'partnerships');
  }
};

// ============================================================================
// Phase 4 — Collaboration Projects
// ============================================================================

export const createProjectHandler = async (req, res) => {
  try {
    const { name, description, isPublic } = req.body || {};
    const project = await createProject({
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      name,
      description,
      isPublic,
    });
    return ok(res, { message: `🚀 Project "${project.name}" created.`, project }, 201);
  } catch (err) {
    return handleError(res, err, 'projects');
  }
};

export const listProjectsHandler = async (req, res) => {
  try {
    const result = await listProjects({ orgId: req.organization.id, page: req.query.page, perPage: req.query.perPage });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'projects');
  }
};

export const getProjectDetailHandler = async (req, res) => {
  try {
    const project = await getProjectDetail({ projectId: req.params.projectId, orgId: req.organization.id });
    return ok(res, { project });
  } catch (err) {
    return handleError(res, err, 'projects');
  }
};

export const addProjectParticipantHandler = async (req, res) => {
  try {
    const { targetOrgId, role } = req.body || {};
    if (!targetOrgId) return res.status(400).json({ success: false, message: 'targetOrgId is required.' });
    const result = await addProjectParticipant({
      projectId: req.params.projectId,
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      targetOrgId,
      role,
    });
    return ok(res, { message: '✅ Participant added.', ...result });
  } catch (err) {
    return handleError(res, err, 'projects');
  }
};

// ============================================================================
// Phase 5 — Workflow Marketplace
// ============================================================================

export const listWorkflowMarketplaceHandler = async (req, res) => {
  try {
    const result = await listWorkflowMarketplace({
      category: req.query.category,
      search: req.query.search,
      minRating: req.query.minRating,
      page: req.query.page,
      perPage: req.query.perPage,
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'workflow-marketplace');
  }
};

export const publishWorkflowHandler = async (req, res) => {
  try {
    const { templateId, price, isPublic, marketplaceCategory } = req.body || {};
    if (!templateId) return res.status(400).json({ success: false, message: 'templateId is required.' });
    const workflow = await publishWorkflow({
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      templateId,
      price,
      isPublic,
      marketplaceCategory,
    });
    return ok(res, { message: `📡 Workflow published to marketplace.`, workflow });
  } catch (err) {
    return handleError(res, err, 'workflow-marketplace');
  }
};

export const installWorkflowHandler = async (req, res) => {
  try {
    const result = await installWorkflow({
      buyerOrgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      templateId: req.params.templateId,
      agentId: req.body?.agentId,
    });
    return ok(res, { message: '✅ Workflow installed.', installation: result }, 201);
  } catch (err) {
    return handleError(res, err, 'workflow-marketplace');
  }
};

export const listWorkflowInstallationsHandler = async (req, res) => {
  try {
    const installations = await listWorkflowInstallations({ orgId: req.organization.id });
    return ok(res, { installations, count: installations.length });
  } catch (err) {
    return handleError(res, err, 'workflow-marketplace');
  }
};

// ============================================================================
// Phase 6 — Trust Score
// ============================================================================

export const getTrustScoreHandler = async (req, res) => {
  try {
    const result = await getTrustScoreDetail({ orgId: req.organization.id });
    return ok(res, { trustScore: result });
  } catch (err) {
    return handleError(res, err, 'trust-score');
  }
};

export const recomputeTrustScoreHandler = async (req, res) => {
  try {
    const result = await computeTrustScore(req.organization.id);
    return ok(res, { message: '🔄 Trust score recomputed.', trustScore: result });
  } catch (err) {
    return handleError(res, err, 'trust-score');
  }
};

// ============================================================================
// Phase 7 — Business Insights
// ============================================================================

export const getBusinessInsightsHandler = async (req, res) => {
  try {
    const insights = await getBusinessInsights({ orgId: req.organization.id });
    return ok(res, { insights });
  } catch (err) {
    return handleError(res, err, 'insights');
  }
};

// ============================================================================
// Phase 8 — Network Dashboard
// ============================================================================

export const getNetworkDashboardHandler = async (req, res) => {
  try {
    const dashboard = await getNetworkDashboard();
    return ok(res, { dashboard });
  } catch (err) {
    return handleError(res, err, 'network-dashboard');
  }
};

// ============================================================================
// Phase 9 — Activity Feed
// ============================================================================

export const getActivityFeedHandler = async (req, res) => {
  try {
    const result = await getActivityFeed({
      orgId: req.organization.id,
      page: req.query.page,
      perPage: req.query.perPage,
      publicOnly: req.query.publicOnly === 'true',
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'activity');
  }
};

export const getGlobalActivityFeedHandler = async (req, res) => {
  try {
    const result = await getGlobalActivityFeed({ page: req.query.page, perPage: req.query.perPage });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'activity');
  }
};

// ============================================================================
// Phase 10 — Enterprise Workspaces
// ============================================================================

export const createWorkspaceHandler = async (req, res) => {
  try {
    const { name, description } = req.body || {};
    const workspace = await createWorkspace({
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      name,
      description,
    });
    return ok(res, { message: `🏢 Workspace "${workspace.name}" created.`, workspace }, 201);
  } catch (err) {
    return handleError(res, err, 'workspaces');
  }
};

export const listWorkspacesHandler = async (req, res) => {
  try {
    const result = await listWorkspaces({ orgId: req.organization.id });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'workspaces');
  }
};

export const getWorkspaceDetailHandler = async (req, res) => {
  try {
    const workspace = await getWorkspaceDetail({ workspaceId: req.params.workspaceId, orgId: req.organization.id });
    return ok(res, { workspace });
  } catch (err) {
    return handleError(res, err, 'workspaces');
  }
};

export const inviteOrgToWorkspaceHandler = async (req, res) => {
  try {
    const { targetOrgId, role } = req.body || {};
    if (!targetOrgId) return res.status(400).json({ success: false, message: 'targetOrgId is required.' });
    const result = await inviteOrgToWorkspace({
      workspaceId: req.params.workspaceId,
      orgId: req.organization.id,
      actorId: req.developerId,
      developerId: req.developerId,
      targetOrgId,
      role,
    });
    return ok(res, { message: '✅ Organization invited to workspace.', ...result });
  } catch (err) {
    return handleError(res, err, 'workspaces');
  }
};
