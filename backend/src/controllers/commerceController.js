/**
 * CommerceController — HTTP handlers for the Autonomous AI Commerce
 * Infrastructure. Agent-scoped (req.agent, gpay_sk_ keys) and developer-scoped
 * (req.organization + RBAC). Humans define policies; AI executes within them.
 */

import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';
import {
  getPolicy,
  upsertPolicy,
  upsertCapabilities,
  recommendProviders,
  createSession,
  getSession,
  listSessions,
  startSession,
  cancelSession,
  getReputationByAgent,
  getOptimizationRecommendations,
  getCommerceGraph,
  getCommerceDashboard,
  getMonthlyReport,
  getComplianceLogs,
  createPrepaidIntent,
  confirmPrepaidPurchase
} from '../services/commerceService.js';
import { ok, handleError } from '../utils/respond.js';
import { analyzeProviders, analyzeProvider, askTrustEngine, getGraphStatus } from '../services/graphIntelligenceService.js';
import { executeAgentGoal } from '../services/agentDecisionEngine.js';

const getAgentByCode = async (agentId) => {
  const { data, error } = await supabase.from('ai_agents').select('*').eq('agent_id', agentId).maybeSingle();
  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  if (data) return data;
  // Gateway may have degraded to anon (RLS filters all rows). Confirm via direct DB.
  try {
    const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE agent_id = $1 LIMIT 1', [agentId]);
    return rows[0] || null;
  } catch {
    return null;
  }
};

const resolveAgentOrg = async (agent) => {
  if (agent.organization_id) return agent.organization_id;
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_developer_id', agent.developer_id)
    .eq('is_personal', true)
    .maybeSingle();
  return data?.id || null;
};

const requireOwnedAgent = async ({ developerId, organizationId, agentId }) => {
  const agent = await getAgentByCode(agentId);
  if (!agent) throw Object.assign(new Error('Agent not found.'), { status: 404 });
  const owned = organizationId ? agent.organization_id === organizationId : agent.developer_id === developerId;
  if (!owned) throw Object.assign(new Error('You do not own this agent.'), { status: 403 });
  return agent;
};

// ==================== Procurement policy (agent-scoped) ====================

export const agentGetPolicy = async (req, res) => {
  try {
    const organizationId = await resolveAgentOrg(req.agent);
    const policy = await getPolicy({ developerId: req.agent.developer_id, organizationId });
    return ok(res, { policy });
  } catch (err) {
    return handleError(res, err, 'policy');
  }
};

export const agentUpsertPolicy = async (req, res) => {
  try {
    const organizationId = await resolveAgentOrg(req.agent);
    const policy = await upsertPolicy({ developerId: req.agent.developer_id, organizationId, patch: req.body.policy || req.body });
    return ok(res, { message: '📋 Procurement policy saved.', policy });
  } catch (err) {
    return handleError(res, err, 'policy');
  }
};

// ==================== Capability profiles (agent-scoped) ====================

export const agentUpsertCapabilities = async (req, res) => {
  try {
    const capabilities = await upsertCapabilities({ agent: req.agent, serviceId: req.params.serviceId, patch: req.body.capabilities || req.body });
    return ok(res, { message: '♻️ Provider capability profile saved.', capabilities });
  } catch (err) {
    return handleError(res, err, 'capabilities');
  }
};

// ==================== Intelligent selection (agent-scoped) ====================

export const agentRecommend = async (req, res) => {
  try {
    const organizationId = await resolveAgentOrg(req.agent);
    const result = await recommendProviders({
      developerId: req.agent.developer_id,
      organizationId,
      consumerAgent: req.agent,
      task: req.body.task,
      requirements: req.body.requirements
    });
    return ok(res, { message: '🛰️ Provider recommendations generated.', ...result });
  } catch (err) {
    return handleError(res, err, 'recommend');
  }
};

// ==================== Purchase sessions (agent-scoped) ====================

export const agentCreateSession = async (req, res) => {
  try {
    const { serviceId, quantity, reason, confidenceScore } = req.body;
    const organizationId = await resolveAgentOrg(req.agent);
    const service = await getAgentService(serviceId);
    const result = await createSession({
      developerId: req.agent.developer_id,
      organizationId,
      consumerAgent: req.agent,
      service,
      quantity,
      reason,
      confidenceScore,
      source: 'manual'
    });
    return ok(res, {
      message: `🛒 Purchase session ${result.session.sessionId} created for ${result.estimatedCostBOT} USDC — confirm payment to grant credits.`,
      ...result
    }, 201);
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const agentStartSession = async (req, res) => {
  try {
    const result = await startSession({ agent: req.agent, sessionId: req.params.sessionId });
    return ok(res, { message: `▶️ Session ${req.params.sessionId} started.`, ...result });
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const agentCancelSession = async (req, res) => {
  try {
    const result = await cancelSession({ agent: req.agent, sessionId: req.params.sessionId });
    return ok(res, { message: `🧿 Session ${req.params.sessionId} cancelled.`, ...result });
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const agentListSessions = async (req, res) => {
  try {
    const result = await listSessions({
      agent: req.agent,
      role: req.query.role || 'all',
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const agentGetSession = async (req, res) => {
  try {
    const session = await getSession({ agent: req.agent, sessionId: req.params.sessionId });
    return ok(res, { session });
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const agentGetReputation = async (req, res) => {
  try {
    const reputation = await getReputationByAgent(req.agent.id);
    return ok(res, { reputation });
  } catch (err) {
    return handleError(res, err, 'reputation');
  }
};

// ==================== Developer-scoped ====================

export const devGetPolicy = async (req, res) => {
  try {
    const policy = await getPolicy({ developerId: req.developerId, organizationId: req.organization?.id });
    return ok(res, { policy });
  } catch (err) {
    return handleError(res, err, 'policy');
  }
};

export const devUpsertPolicy = async (req, res) => {
  try {
    const policy = await upsertPolicy({ developerId: req.developerId, organizationId: req.organization?.id, patch: req.body.policy || req.body });
    return ok(res, { message: '📋 Procurement policy saved.', policy });
  } catch (err) {
    return handleError(res, err, 'policy');
  }
};

export const devUpdateCapabilities = async (req, res) => {
  try {
    const agent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId: req.body.agentId });
    const capabilities = await upsertCapabilities({ agent, serviceId: req.params.serviceId, patch: req.body.capabilities || req.body });
    return ok(res, { message: '♻️ Provider capability profile saved.', capabilities });
  } catch (err) {
    return handleError(res, err, 'capabilities');
  }
};

export const devRecommend = async (req, res) => {
  try {
    const result = await recommendProviders({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      task: req.body.task,
      requirements: req.body.requirements
    });
    return ok(res, { message: '🛰️ Provider recommendations generated.', ...result });
  } catch (err) {
    return handleError(res, err, 'recommend');
  }
};

export const devCreateSession = async (req, res) => {
  try {
    const { serviceId, quantity, consumerAgentId, reason, confidenceScore } = req.body;
    const consumer = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId: consumerAgentId });
    const service = await getAgentService(serviceId);
    const result = await createSession({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      consumerAgent: consumer,
      service,
      quantity,
      reason,
      confidenceScore,
      source: req.body.source || 'manual'
    });
    return ok(res, {
      message: `🛒 Purchase session ${result.session.sessionId} created for ${result.estimatedCostBOT} USDC — confirm payment to grant credits.`,
      ...result
    }, 201);
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

/** Create a prepaid purchase intent — session enters 'awaiting_payment'.
 *  No invoice, no credits until the user explicitly confirms payment. */
export const devCreatePrepaidIntent = async (req, res) => {
  try {
    const { serviceId, quantity, consumerAgentId, reason } = req.body;
    const consumer = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId: consumerAgentId });
    const service = await getAgentService(serviceId);
    const result = await createPrepaidIntent({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      consumerAgent: consumer,
      service,
      quantity,
      reason
    });
    return ok(res, {
      message: `💳 Prepaid intent ${result.session.sessionId} created — confirm payment to settle.`,
      ...result
    }, 201);
  } catch (err) {
    return handleError(res, err, 'prepaid');
  }
};

/** Confirm + execute a prepaid purchase. Returns settled (paid/closed) session
 *  on success, or a payment_failed session with reason (200, not an error). */
export const devConfirmPrepaidPurchase = async (req, res) => {
  try {
    const result = await confirmPrepaidPurchase({ sessionId: req.params.sessionId, organizationId: req.organization?.id });
    if (result.success) {
      return ok(res, {
        message: `✅ Prepaid purchase settled — ${result.amountBOT} USDC paid, invoice ${result.invoice.invoiceId}, ${result.credits} credits granted.`,
        ...result
      });
    }
    return ok(res, {
      message: `⚠️ Payment failed: ${result.failureReason}`,
      ...result
    }, 402);
  } catch (err) {
    return handleError(res, err, 'prepaid');
  }
};

export const devStartSession = async (req, res) => {
  try {
    const result = await startSession({ sessionId: req.params.sessionId });
    return ok(res, { message: `▶️ Session ${req.params.sessionId} started.`, ...result });
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const devCancelSession = async (req, res) => {
  try {
    const result = await cancelSession({ developerId: req.developerId, organizationId: req.organization?.id, sessionId: req.params.sessionId });
    return ok(res, { message: `🧿 Session ${req.params.sessionId} cancelled.`, ...result });
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const devListSessions = async (req, res) => {
  try {
    const result = await listSessions({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      role: req.query.role || 'all',
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const devGetSession = async (req, res) => {
  try {
    const session = await getSession({ developerId: req.developerId, organizationId: req.organization?.id, sessionId: req.params.sessionId });
    return ok(res, { session });
  } catch (err) {
    return handleError(res, err, 'session');
  }
};

export const devOptimization = async (req, res) => {
  try {
    const result = await getOptimizationRecommendations({ developerId: req.developerId, organizationId: req.organization?.id });
    return ok(res, { message: '💹 AI cost-optimization recommendations generated.', ...result });
  } catch (err) {
    return handleError(res, err, 'recommend');
  }
};

export const devDashboard = async (req, res) => {
  try {
    const dashboard = await getCommerceDashboard({ developerId: req.developerId, organizationId: req.organization?.id });
    return ok(res, { dashboard });
  } catch (err) {
    return handleError(res, err, 'commerce');
  }
};

export const devCommerceDashboard = async (req, res) => {
  try {
    const developerId = req.developerId;
    const organizationId = req.organization?.id;
    const [graph, sessions, optimization] = await Promise.all([
      getCommerceGraph({ developerId, organizationId }).catch(() => ({})),
      getPool().query(
        `SELECT status, COUNT(*)::int as count FROM commerce_sessions WHERE organization_id = $1 GROUP BY status`,
        [organizationId]
      ).then(r => r.rows).catch(() => []),
      getOptimizationRecommendations({ developerId, organizationId }).catch(() => []),
    ]);
    const pendingApprovals = sessions.find(s => s.status === 'pending_approval')?.count || 0;
    const activeSessions = sessions.find(s => s.status === 'active')?.count || 0;
    return ok(res, {
      dashboard: {
        graph,
        pendingApprovals,
        activeSessions,
        sessionsByStatus: sessions,
        optimizationCount: Array.isArray(optimization) ? optimization.length : 0,
      }
    });
  } catch (err) {
    return handleError(res, err, 'commerce');
  }
};

export const devGraph = async (req, res) => {
  try {
    const graph = await getCommerceGraph({ developerId: req.developerId, organizationId: req.organization?.id });
    return ok(res, { graph });
  } catch (err) {
    return handleError(res, err, 'commerce');
  }
};

export const devMonthlyReport = async (req, res) => {
  try {
    const report = await getMonthlyReport({ developerId: req.developerId, organizationId: req.organization?.id, month: req.query.month });
    return ok(res, { report });
  } catch (err) {
    return handleError(res, err, 'commerce');
  }
};

export const devCompliance = async (req, res) => {
  try {
    const logs = await getComplianceLogs({ developerId: req.developerId, organizationId: req.organization?.id, limit: req.query.limit });
    return ok(res, { logs });
  } catch (err) {
    return handleError(res, err, 'commerce');
  }
};

export const devGraphStatus = async (_req, res) => {
  try {
    return ok(res, await getGraphStatus());
  } catch (err) {
    return handleError(res, err, 'graph');
  }
};

export const devProviderAnalysis = async (req, res) => {
  try {
    const providerIds = Array.isArray(req.body?.providerIds) ? req.body.providerIds : [];
    const providers = providerIds.length
      ? (await Promise.all(providerIds.map(analyzeProvider))).filter(Boolean).sort((a, b) => b.trustScore - a.trustScore)
      : await analyzeProviders({});
    return ok(res, { providers, recommendation: providers[0] || null });
  } catch (err) {
    return handleError(res, err, 'graph');
  }
};

export const devGraphAsk = async (req, res) => {
  try {
    return ok(res, await askTrustEngine(String(req.body?.question || 'Which providers are safest?'), req.body?.providerIds));
  } catch (err) {
    return handleError(res, err, 'graph');
  }
};

export const devAutonomousCommerce = async (req, res) => {
  try {
    const consumer = await requireOwnedAgent({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      agentId: req.body.consumerAgentId
    });
    const result = await executeAgentGoal({
      ...req.body,
      consumerAgent: consumer,
      developerId: req.developerId,
      organizationId: req.organization?.id
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'autonomous-commerce');
  }
};

// ==================== shared helper ====================

const getAgentService = async (serviceId) => {
  const { data, error } = await supabase
    .from('ai_services')
    .select('*')
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .maybeSingle();
  // If Supabase gateway degraded (no error but null data), retry via direct DB
  if (!data && !error) {
    try {
      const { rows } = await getPool().query(
        'SELECT * FROM ai_services WHERE service_id = $1 AND is_active = true LIMIT 1',
        [serviceId]
      );
      if (rows[0]) return rows[0];
    } catch { /* fall through */ }
  }
  if (error) throw new Error(`Service lookup failed: ${error.message}`);
  if (!data) throw Object.assign(new Error('Service not found or inactive.'), { status: 404 });
  return data;
};
