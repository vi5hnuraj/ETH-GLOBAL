/**
 * NetworkController — HTTP handlers for the Phase 5 Global AI Network.
 * Developer-scoped (req.organization + RBAC via the developer router).
 */

import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';
import {
  getProfile,
  upsertProfile,
  getPublicProfileBySlug,
  listPublicProfiles,
  attachOrgProfiles,
  smartProcurement,
  autoRoute,
  createWorkflowTemplate,
  listWorkflowTemplates,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
  deployTemplate,
  runWorkflow,
  listWorkflowRuns,
  getWorkflowRunDetail,
  cancelWorkflowRun,
  getProcurementDashboard,
  getNetworkAnalytics,
  getNetworkTimeline,
  getNetworkActivity,
  getNetworkHealth,
  getNetworkLeaderboard
} from '../services/networkService.js';
import { ok, handleError } from '../utils/respond.js';

const getAgentByCode = async (agentId) => {
  const { data, error } = await supabase.from('ai_agents').select('*').eq('agent_id', agentId).maybeSingle();
  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  if (data) return data;
  try {
    const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE agent_id = $1 LIMIT 1', [agentId]);
    return rows[0] || null;
  } catch {
    return null;
  }
};

const requireOwnedAgent = async ({ developerId, organizationId, agentId }) => {
  if (!agentId) return null;
  const agent = await getAgentByCode(agentId);
  if (!agent) throw Object.assign(new Error('Agent not found.'), { status: 404 });
  const owned = organizationId ? agent.organization_id === organizationId : agent.developer_id === developerId;
  if (!owned) throw Object.assign(new Error('You do not own this agent.'), { status: 403 });
  return agent;
};

// ==================== 5.1 / 5.2 Company profiles + verification ====================

export const devGetProfile = async (req, res) => {
  try {
    const profile = await getProfile({ developerId: req.developerId, organizationId: req.organization.id });
    return ok(res, { profile });
  } catch (err) {
    return handleError(res, err, 'profile');
  }
};

export const devUpsertProfile = async (req, res) => {
  try {
    const profile = await upsertProfile({
      developerId: req.developerId,
      organizationId: req.organization.id,
      actorId: req.developerId,
      patch: req.body.profile || req.body
    });
    return ok(res, { message: '🏢 Company profile saved.', profile });
  } catch (err) {
    return handleError(res, err, 'profile');
  }
};

export const devListPublicProfiles = async (req, res) => {
  try {
    const profiles = await listPublicProfiles({ limit: req.query.limit, verification: req.query.verification });
    return ok(res, { profiles });
  } catch (err) {
    return handleError(res, err, 'profile');
  }
};

/** Unauthenticated public profile by slug (mounted outside the dev router). */
export const publicOrgProfile = async (req, res) => {
  try {
    const profile = await getPublicProfileBySlug(req.params.slug);
    return ok(res, { profile });
  } catch (err) {
    return handleError(res, err, 'profile');
  }
};

// ==================== 5.3 Smart procurement ====================

export const devSmartProcurement = async (req, res) => {
  try {
    const consumerAgent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization.id, agentId: req.body.consumerAgentId });
    const result = await smartProcurement({
      developerId: req.developerId,
      organizationId: req.organization.id,
      consumerAgent,
      task: req.body.task,
      requirements: req.body.requirements
    });
    return ok(res, { message: '🧭 Smart procurement plan generated.', ...result });
  } catch (err) {
    return handleError(res, err, 'procurement');
  }
};

// ==================== 5.4 Auto-route (automatic provider switching) ====================

export const devAutoRoute = async (req, res) => {
  try {
    const consumerAgent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization.id, agentId: req.body.consumerAgentId });
    const result = await autoRoute({
      developerId: req.developerId,
      organizationId: req.organization.id,
      consumerAgent,
      task: req.body.task,
      requirements: req.body.requirements,
      quantity: req.body.quantity,
      forceSwitch: !!req.body.forceSwitch
    });
    return ok(res, { message: result.switched ? '🔄 Routed to an alternate provider.' : '🎯 Routed to the best provider.', ...result });
  } catch (err) {
    return handleError(res, err, 'procurement');
  }
};

// ==================== 5.8 Workflow templates ====================

export const devCreateTemplate = async (req, res) => {
  try {
    const template = await createWorkflowTemplate({
      developerId: req.developerId,
      organizationId: req.organization.id,
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      steps: req.body.steps
    });
    return ok(res, { message: `🧬 Workflow "${template.name}" saved.`, template }, 201);
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devListTemplates = async (req, res) => {
  try {
    const templates = await listWorkflowTemplates({ organizationId: req.organization.id });
    return ok(res, { count: templates.length, templates });
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devUpdateTemplate = async (req, res) => {
  try {
    const template = await updateWorkflowTemplate({
      organizationId: req.organization.id,
      templateId: req.params.templateId,
      patch: req.body
    });
    return ok(res, { message: '✅ Workflow updated.', template });
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devDeleteTemplate = async (req, res) => {
  try {
    const result = await deleteWorkflowTemplate({ organizationId: req.organization.id, templateId: req.params.templateId });
    return ok(res, { message: '🗑️ Workflow deleted.', ...result });
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devDeployTemplate = async (req, res) => {
  try {
    const consumerAgent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization.id, agentId: req.body.consumerAgentId });
    const result = await deployTemplate({
      developerId: req.developerId,
      organizationId: req.organization.id,
      consumerAgent,
      templateId: req.params.templateId
    });
    return ok(res, { message: `🚀 Workflow "${result.run.name}" deployed.`, ...result });
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

/** Ad-hoc multi-provider workflow execution. */
export const devRunWorkflow = async (req, res) => {
  try {
    const consumerAgent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization.id, agentId: req.body.consumerAgentId });
    const result = await runWorkflow({
      developerId: req.developerId,
      organizationId: req.organization.id,
      consumerAgent,
      name: req.body.name,
      steps: req.body.steps,
      input: req.body.input
    });
    return ok(res, { message: `🚀 Workflow "${result.run.name}" deployed.`, ...result }, 201);
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devListRuns = async (req, res) => {
  try {
    const result = await listWorkflowRuns({
      organizationId: req.organization.id,
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devGetRun = async (req, res) => {
  try {
    const result = await getWorkflowRunDetail({ organizationId: req.organization.id, runId: req.params.runId });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

export const devCancelRun = async (req, res) => {
  try {
    const run = await cancelWorkflowRun({ organizationId: req.organization.id, runId: req.params.runId });
    return ok(res, { message: '⏹️ Workflow cancelled.', run });
  } catch (err) {
    return handleError(res, err, 'workflow');
  }
};

// ==================== 5.7 / 5.9 Dashboards ====================

export const devProcurementDashboard = async (req, res) => {
  try {
    const dashboard = await getProcurementDashboard({ developerId: req.developerId, organizationId: req.organization.id });
    return ok(res, { dashboard });
  } catch (err) {
    return handleError(res, err, 'procurement');
  }
};

export const devNetworkAnalytics = async (req, res) => {
  try {
    const analytics = await getNetworkAnalytics({ limit: req.query.limit });
    return ok(res, { analytics });
  } catch (err) {
    return handleError(res, err, 'network');
  }
};

export const devNetworkTimeline = async (req, res) => {
  try {
    const timeline = await getNetworkTimeline({ days: Number(req.query.days) || 30 });
    return ok(res, { timeline });
  } catch (err) {
    return handleError(res, err, 'network');
  }
};

export const devNetworkActivity = async (req, res) => {
  try {
    const activity = await getNetworkActivity({ limit: Number(req.query.limit) || 20 });
    return ok(res, { activity });
  } catch (err) {
    return handleError(res, err, 'network');
  }
};

export const devNetworkHealth = async (req, res) => {
  try {
    const health = await getNetworkHealth();
    return ok(res, { health });
  } catch (err) {
    return handleError(res, err, 'network');
  }
};

export const devNetworkLeaderboard = async (req, res) => {
  try {
    const leaderboard = await getNetworkLeaderboard();
    return ok(res, { leaderboard });
  } catch (err) {
    return handleError(res, err, 'network');
  }
};

// ==================== Marketplace enrichment helpers ====================

/**
 * Post-process marketplace listings so service rows carry the provider
 * company profile + verification badge (5.1 / 5.2 display).
 */
export const enrichMarketplace = async (result) => {
  if (!result || !Array.isArray(result.services)) return result;
  result.services = await attachOrgProfiles(result.services);
  return result;
};

export const enrichSingleService = async (service) => {
  if (!service) return service;
  const [enriched] = await attachOrgProfiles([service]);
  return enriched || service;
};