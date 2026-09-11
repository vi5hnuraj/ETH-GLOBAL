/**
 * CommerceService — Autonomous AI Commerce Infrastructure.
 *
 * Adds an enterprise procurement + autonomous purchasing layer on top of the
 * AI Service Marketplace. Humans define policies; AI executes within them.
 *
 *   - Procurement policies (Phase 1): per-organization buying rules.
 *   - Provider capability profiles (Phase 2): what each service can actually do.
 *   - Intelligent provider selection (Phase 3): POST /marketplace/recommend.
 *   - Purchase sessions (Phase 4): autonomous purchase lifecycle.
 *   - Reputation engine (Phase 5): trust score 0-100, auto-updated.
 *   - Cost optimization (Phase 6): AI spending recommendations.
 *   - Enterprise controls (Phase 7): budgets, approvals, monthly reports,
 *     compliance logs.
 *   - Commerce graph (Phase 8) + AI operating dashboard (Phase 9).
 *
 * Reuses the existing organizations, RBAC, API keys, MPC wallets, invoice
 * engine and settlement engine. No duplicated payment/wallet logic.
 */

import crypto from 'crypto';
import { ethers } from 'ethers';
import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';
import { dispatchEvent } from './webhookService.js';
import { audit } from './auditService.js';
import logger from '../utils/logger.js';
import { analyzeProvider, analyzeProviders, verifySettlement, isGraphConfigured } from './graphIntelligenceService.js';
import { getPaymentEntity } from './graphIntelligenceService.js';
const EXPLORER_URL = process.env.ARC_EXPLORER_URL || process.env.EXPLORER_URL || 'https://testnet.arcscan.app/';
const REPUTATION_TTL_MS = Number(process.env.REPUTATION_TTL_MS || 15 * 60 * 1000);

export const genId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

const waitForGraphPayment = async (paymentId, timeoutMs = 60000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const payment = await getPaymentEntity(paymentId);
    if (payment?.status === 'RELEASED') return { verified: true, settlement: payment, source: 'The Graph' };
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { verified: false, reason: 'GRAPH_INDEXING_PENDING', source: 'The Graph' };
};

const httpError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

const formatEtherSafe = (wei) => {
  try {
    return ethers.formatEther(String(wei));
  } catch {
    return String(Number(wei) / 1e18);
  }
};

/** Charge for quantity against a USDC unit price (decimal strings), big-int safe. */
export const chargeWei = async (unitPriceBot, quantity) => {
  const { computeChargeWei } = await import('./marketplaceService.js');
  return computeChargeWei(unitPriceBot, quantity);
};

// =====================================================================
// PROCUREMENT POLICIES (Phase 1)
// =====================================================================

const POLICY_FIELDS = [
  'max_budget_bot', 'preferred_regions', 'blocked_regions', 'approved_providers',
  'blocked_providers', 'preferred_gpu_models', 'minimum_vram_gb',
  'minimum_availability_pct', 'minimum_trust_score', 'maximum_latency_ms',
  'preferred_currencies', 'auto_purchase_enabled', 'invoice_approval_threshold_bot',
  'spending_limits', 'departments', 'metadata'
];

const toPublicPolicy = (p) => ({
  policyId: p.policy_id,
  organizationId: p.organization_id,
  maxBudgetBOT: p.max_budget_bot,
  preferredRegions: p.preferred_regions || [],
  blockedRegions: p.blocked_regions || [],
  approvedProviders: p.approved_providers || [],
  blockedProviders: p.blocked_providers || [],
  preferredGpuModels: p.preferred_gpu_models || [],
  minimumVramGb: p.minimum_vram_gb,
  minimumAvailabilityPct: p.minimum_availability_pct,
  minimumTrustScore: p.minimum_trust_score,
  maximumLatencyMs: p.maximum_latency_ms,
  preferredCurrencies: p.preferred_currencies || ['USDC'],
  autoPurchaseEnabled: p.auto_purchase_enabled,
  invoiceApprovalThresholdBOT: p.invoice_approval_threshold_bot,
  spendingLimits: p.spending_limits || {},
  departments: p.departments || {},
  metadata: p.metadata || {},
  createdAt: p.created_at,
  updatedAt: p.updated_at
});

const toDbPolicy = (patch) => {
  const db = {};
  if (patch.maxBudgetBOT !== undefined) db.max_budget_bot = String(patch.maxBudgetBOT);
  if (patch.preferredRegions !== undefined) db.preferred_regions = patch.preferredRegions;
  if (patch.blockedRegions !== undefined) db.blocked_regions = patch.blockedRegions;
  if (patch.approvedProviders !== undefined) db.approved_providers = patch.approvedProviders;
  if (patch.blockedProviders !== undefined) db.blocked_providers = patch.blockedProviders;
  if (patch.preferredGpuModels !== undefined) db.preferred_gpu_models = patch.preferredGpuModels;
  if (patch.minimumVramGb !== undefined) db.minimum_vram_gb = patch.minimumVramGb ? Number(patch.minimumVramGb) : null;
  if (patch.minimumAvailabilityPct !== undefined) db.minimum_availability_pct = patch.minimumAvailabilityPct !== null && patch.minimumAvailabilityPct !== '' ? Number(patch.minimumAvailabilityPct) : null;
  if (patch.minimumTrustScore !== undefined) db.minimum_trust_score = patch.minimumTrustScore !== null && patch.minimumTrustScore !== '' ? Number(patch.minimumTrustScore) : null;
  if (patch.maximumLatencyMs !== undefined) db.maximum_latency_ms = patch.maximumLatencyMs ? Number(patch.maximumLatencyMs) : null;
  if (patch.preferredCurrencies !== undefined) db.preferred_currencies = patch.preferredCurrencies;
  if (patch.autoPurchaseEnabled !== undefined) db.auto_purchase_enabled = !!patch.autoPurchaseEnabled;
  if (patch.invoiceApprovalThresholdBOT !== undefined) db.invoice_approval_threshold_bot = patch.invoiceApprovalThresholdBOT !== null && patch.invoiceApprovalThresholdBOT !== '' ? String(patch.invoiceApprovalThresholdBOT) : null;
  if (patch.spendingLimits !== undefined) db.spending_limits = patch.spendingLimits || {};
  if (patch.departments !== undefined) db.departments = patch.departments || {};
  if (patch.metadata !== undefined) db.metadata = patch.metadata || {};
  return db;
};

// Direct-DB fallbacks: the gateway intermittently downgrades the service key
// to `anon`, which RLS-restricts reads to `[]` and rejects writes (42501).
// Straight SQL through the pool runs as a privileged DB user and bypasses RLS.

const getPolicyViaPool = async (organizationId) => {
  const { rows } = await getPool().query(
    'SELECT * FROM procurement_policies WHERE organization_id = $1 LIMIT 1',
    [organizationId]
  );
  return rows[0] || null;
};

const insertPolicyViaPool = async ({ policyId, organizationId, developerId, dbPatch }) => {
  const cols = ['policy_id', 'organization_id', ...(developerId ? ['developer_id'] : []), ...Object.keys(dbPatch)];
  const values = [policyId, organizationId, ...(developerId ? [developerId] : []), ...Object.keys(dbPatch).map((k) => dbPatch[k])];
  const { rows } = await getPool().query(
    `INSERT INTO procurement_policies (${cols.join(', ')})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING *`,
    values
  );
  return rows[0];
};

const updatePolicyViaPool = async (id, dbPatch) => {
  const keys = Object.keys(dbPatch);
  const { rows } = await getPool().query(
    `UPDATE procurement_policies SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}
     WHERE id = $${keys.length + 1}
     RETURNING *`,
    [...keys.map((k) => dbPatch[k]), id]
  );
  return rows[0];
};

export const getPolicyByOrg = async (organizationId, { createDefault = false } = {}) => {
  if (!organizationId) return null;
  let q = supabase.from('procurement_policies').select('*').eq('organization_id', organizationId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`Policy lookup failed: ${error.message}`);
  if (data) return data;
  try {
    const viaPool = await getPolicyViaPool(organizationId);
    if (viaPool) return viaPool;
  } catch {
    /* direct read unavailable — keep the gateway result */
  }
  if (!createDefault) return null;
  const insert = () => supabase
    .from('procurement_policies')
    .insert({
      policy_id: genId('pol'),
      organization_id: organizationId,
      max_budget_bot: '0'
    })
    .select()
    .single();
  try {
    const { data: created, error: createErr } = await insert();
    if (!createErr) return created;
  } catch {
    /* fall through to the direct connection */
  }
  try {
    return await insertPolicyViaPool({ policyId: genId('pol'), organizationId, dbPatch: { max_budget_bot: '0' } });
  } catch (err) {
    throw new Error(`Failed to create policy: ${err.message}`);
  }
};

export const getPolicy = async ({ developerId, organizationId }) => {
  if (!organizationId) throw httpError(400, 'Organization context is required for procurement policies.');
  const policy = await getPolicyByOrg(organizationId, { createDefault: true });
  return toPublicPolicy(policy);
};

export const upsertPolicy = async ({ developerId, organizationId, patch }) => {
  if (!organizationId) throw httpError(400, 'Organization context is required for procurement policies.');
  const current = await getPolicyByOrg(organizationId);
  const dbPatch = toDbPolicy(patch || {});
  let data;
  if (current) {
    dbPatch.updated_at = new Date().toISOString();
    try {
      const { data: updated, error } = await supabase
        .from('procurement_policies').update(dbPatch).eq('id', current.id).select().single();
      if (error) throw error;
      data = updated;
    } catch (err) {
      try {
        data = await updatePolicyViaPool(current.id, dbPatch);
      } catch {
        throw new Error(`Failed to update policy: ${err.message}`);
      }
    }
  } else {
    const patchRow = { policy_id: genId('pol'), ...(developerId ? { developer_id: developerId } : {}) };
    try {
      const { data: created, error } = await supabase
        .from('procurement_policies')
        .insert({ ...patchRow, organization_id: organizationId, ...dbPatch })
        .select().single();
      if (error) throw error;
      data = created;
    } catch (err) {
      try {
        data = await insertPolicyViaPool({
          policyId: patchRow.policy_id,
          organizationId,
          developerId,
          dbPatch
        });
      } catch {
        throw new Error(`Failed to create policy: ${err.message}`);
      }
    }
  }

  audit({
    developerId,
    organizationId,
    actorType: 'developer',
    actorId: developerId,
    action: 'policy.updated',
    resourceType: 'procurement_policy',
    resourceId: data.policy_id,
    metadata: { fields: Object.keys(dbPatch) }
  });
  dispatchEvent('policy.updated', { policyId: data.policy_id, organizationId }, { developerId, organizationId });

  return toPublicPolicy(data);
};

/** Monthly spend (paid + pending) the org has committed as a consumer. */
export const getMonthlySpendWei = async ({ organizationId, developerId }) => {
  // ── Agent IDs — Supabase first, direct DB fallback ──
  let ids = [];
  try {
    const agentsQ = supabase.from('ai_agents').select('id');
    if (organizationId) agentsQ.eq('organization_id', organizationId);
    else if (developerId) agentsQ.eq('developer_id', developerId);
    const { data: agents } = await agentsQ;
    ids = (agents || []).map((a) => a.id);
  } catch (_) {}
  if (ids.length === 0) {
    try {
      const pool = getPool();
      const col = organizationId ? 'organization_id' : 'developer_id';
      const val = organizationId || developerId;
      const { rows } = await pool.query(`SELECT id FROM ai_agents WHERE ${col} = $1`, [val]);
      ids = rows.map((r) => r.id);
    } catch (_) {}
  }
  if (ids.length === 0) return 0n;

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  // ── Invoice sum — Supabase first, direct DB fallback ──
  let totalWei = 0n;
  try {
    const { data, error } = await supabase
      .from('service_invoices')
      .select('amount_wei, status, created_at, paid_at')
      .in('consumer_agent_id', ids)
      .in('status', ['paid', 'pending'])
      .gte('created_at', start.toISOString());
    if (!error && data) {
      totalWei = data.reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
      return totalWei;
    }
  } catch (_) {}
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount_wei::numeric), 0)::text AS total
       FROM service_invoices
       WHERE consumer_agent_id = ANY($1)
         AND status IN ('paid','pending')
         AND created_at >= $2`,
      [ids, start.toISOString()]
    );
    totalWei = BigInt(rows[0]?.total || '0');
  } catch (_) {}
  return totalWei;
};

// =====================================================================
// PROVIDER CAPABILITY PROFILES (Phase 2)
// =====================================================================

const toPublicCapabilities = (c) => (c ? {
  serviceId: c.service_code,
  supportedModels: c.supported_models || [],
  gpuModel: c.gpu_model,
  vramGb: c.vram_gb,
  cudaVersion: c.cuda_version,
  capabilities: {
    inference: c.inference_supported,
    training: c.training_supported,
    imageGeneration: c.image_generation,
    embeddings: c.embeddings,
    speech: c.speech,
    ocr: c.ocr,
    translation: c.translation,
    storage: c.storage
  },
  supportedRegions: c.supported_regions || [],
  averageLatencyMs: c.average_latency_ms,
  averageResponseTimeMs: c.average_response_time_ms,
  uptimePct: c.uptime_pct,
  completedJobs: c.completed_jobs,
  activeJobs: c.active_jobs,
  averageRating: c.average_rating,
  monthlyRevenueBOT: formatEtherSafe(c.monthly_revenue_wei || '0'),
  createdAt: c.created_at,
  updatedAt: c.updated_at
} : null);

const toDbCapabilities = (patch) => {
  const db = {};
  if (patch.supportedModels !== undefined) db.supported_models = patch.supportedModels;
  if (patch.gpuModel !== undefined) db.gpu_model = patch.gpuModel || null;
  if (patch.vramGb !== undefined) db.vram_gb = patch.vramGb ? Number(patch.vramGb) : null;
  if (patch.cudaVersion !== undefined) db.cuda_version = patch.cudaVersion || null;
  if (patch.inference !== undefined) db.inference_supported = !!patch.inference;
  if (patch.training !== undefined) db.training_supported = !!patch.training;
  if (patch.imageGeneration !== undefined) db.image_generation = !!patch.imageGeneration;
  if (patch.embeddings !== undefined) db.embeddings = !!patch.embeddings;
  if (patch.speech !== undefined) db.speech = !!patch.speech;
  if (patch.ocr !== undefined) db.ocr = !!patch.ocr;
  if (patch.translation !== undefined) db.translation = !!patch.translation;
  if (patch.storage !== undefined) db.storage = !!patch.storage;
  if (patch.supportedRegions !== undefined) db.supported_regions = patch.supportedRegions;
  if (patch.averageLatencyMs !== undefined) db.average_latency_ms = patch.averageLatencyMs ? Number(patch.averageLatencyMs) : null;
  if (patch.averageResponseTimeMs !== undefined) db.average_response_time_ms = patch.averageResponseTimeMs ? Number(patch.averageResponseTimeMs) : null;
  if (patch.uptimePct !== undefined) db.uptime_pct = patch.uptimePct !== null && patch.uptimePct !== '' ? Number(patch.uptimePct) : null;
  if (patch.completedJobs !== undefined) db.completed_jobs = Math.max(0, Number(patch.completedJobs) || 0);
  if (patch.activeJobs !== undefined) db.active_jobs = Math.max(0, Number(patch.activeJobs) || 0);
  if (patch.averageRating !== undefined) db.average_rating = patch.averageRating !== null && patch.averageRating !== '' ? Number(patch.averageRating) : null;
  if (patch.monthlyRevenueBOT !== undefined) {
    try { db.monthly_revenue_wei = ethers.parseEther(String(patch.monthlyRevenueBOT)).toString(); } catch { /* ignore */ }
  }
  if (patch.metadata !== undefined) db.metadata = patch.metadata || {};
  return db;
};

export const getCapabilitiesByServiceId = async (serviceId) => {
  const { data, error } = await supabase
    .from('provider_capabilities').select('*').eq('service_id', serviceId).maybeSingle();
  if (error) throw new Error(`Capabilities lookup failed: ${error.message}`);
  return data || null;
};

export const upsertCapabilities = async ({ agent, serviceId, patch }) => {
  const { getServiceByCode } = await import('./marketplaceService.js');
  const service = await getServiceByCode(serviceId, { includeInactive: true });
  if (!service) throw httpError(404, 'Service not found.');
  if (service.agent_id !== agent.id) throw httpError(403, 'Only the owning agent can update capability profiles.');
  if (patch && Object.keys(patch).length === 0) throw httpError(400, 'Nothing to update.');

  const dbPatch = toDbCapabilities(patch || {});
  dbPatch.updated_at = new Date().toISOString();

  const existing = await getCapabilitiesByServiceId(service.id);
  let data;
  if (existing) {
    const { data: updated, error } = await supabase
      .from('provider_capabilities').update(dbPatch).eq('id', existing.id).select().single();
    if (error) throw new Error(`Failed to update capabilities: ${error.message}`);
    data = updated;
  } else {
    const { data: created, error } = await supabase
      .from('provider_capabilities')
      .insert({
        service_id: service.id,
        service_code: service.service_id,
        ...dbPatch
      })
      .select().single();
    if (error) throw new Error(`Failed to create capabilities: ${error.message}`);
    data = created;
  }

  audit({
    developerId: agent.developer_id,
    organizationId: agent.organization_id,
    actorType: 'agent',
    actorId: agent.agent_id,
    action: 'capabilities.updated',
    resourceType: 'provider_capabilities',
    resourceId: service.service_id,
    metadata: { fields: Object.keys(dbPatch) }
  });
  dispatchEvent('capability.updated', { serviceId: service.service_id, agentId: agent.agent_id }, { developerId: agent.developer_id, organizationId: agent.organization_id });

  return toPublicCapabilities(data);
};

// =====================================================================
// REPUTATION ENGINE (Phase 5)
// =====================================================================

export const computeReputation = async (agent) => {
  const { data: invoices } = await supabase
    .from('service_invoices')
    .select('amount_wei, status, consumer_agent_code')
    .eq('provider_agent_id', agent.id);

  const rows = invoices || [];
  const paid = rows.filter((i) => i.status === 'paid');
  const cancelled = rows.filter((i) => i.status === 'cancelled');
  const pending = rows.filter((i) => i.status === 'pending');
  const settled = paid.length + cancelled.length;
  const paymentSuccessRate = settled ? Math.round((paid.length / settled) * 10000) / 100 : 0;
  const totalRevenueWei = paid.reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
  const byConsumer = {};
  paid.forEach((i) => { byConsumer[i.consumer_agent_code] = (byConsumer[i.consumer_agent_code] || 0) + 1; });
  const repeatCustomers = Object.values(byConsumer).filter((c) => c >= 2).length;

  const { data: services } = await supabase
    .from('ai_services').select('id').eq('agent_id', agent.id);
  const serviceIds = (services || []).map((s) => s.id);
  let rating = null;
  let uptime = null;
  let latency = null;
  if (serviceIds.length) {
    const { data: caps } = await supabase
      .from('provider_capabilities').select('average_rating, uptime_pct, average_latency_ms').in('service_id', serviceIds);
    const ratings = (caps || []).map((c) => c.average_rating).filter((r) => r !== null && r !== undefined);
    const uptimes = (caps || []).map((c) => c.uptime_pct).filter((r) => r !== null && r !== undefined);
    const latencies = (caps || []).map((c) => c.average_latency_ms).filter((r) => r !== null && r !== undefined);
    if (ratings.length) rating = ratings.reduce((s, r) => s + Number(r), 0) / ratings.length;
    if (uptimes.length) uptime = uptimes.reduce((s, r) => s + Number(r), 0) / uptimes.length;
    if (latencies.length) latency = Math.round(latencies.reduce((s, r) => s + Number(r), 0) / latencies.length);
  }

  const disputeRate = 0; // no dispute flow yet — reserved slot in the formula
  const uptimeScore = uptime === null ? 0 : Math.min(Math.max((Number(uptime) - 90) / 10, 0), 1) * 10;
  const ratingScore = rating === null ? 0 : Math.min((Number(rating) / 5) * 5, 5);
  const repeatScore = Math.min(repeatCustomers * 1, 5);
  const volumeScore = Math.min(paid.length * 1.5, 15);

  let trustScore = 40
    + paymentSuccessRate * 0.25
    + volumeScore
    + uptimeScore
    + ratingScore
    + repeatScore
    - disputeRate * 10;
  trustScore = Math.round(Math.min(Math.max(trustScore, 0), 100) * 100) / 100;

  return {
    trustScore,
    completedJobs: paid.length,
    failedJobs: cancelled.length,
    pendingJobs: pending.length,
    paymentSuccessRate,
    disputeRate,
    customerSatisfaction: rating,
    uptimePct: uptime,
    responseLatencyMs: latency,
    totalRevenueWei,
    totalRevenueBOT: formatEtherSafe(totalRevenueWei),
    repeatCustomers,
    metrics: { paid: paid.length, cancelled: cancelled.length, pending: pending.length }
  };
};

export const ensureFreshReputation = async (agent, { force = false } = {}) => {
  const { data: existing } = await supabase
    .from('provider_reputation').select('*').eq('provider_agent_id', agent.id).maybeSingle();
  const stale = !existing || (existing.recomputed_at && Date.now() - new Date(existing.recomputed_at).getTime() > REPUTATION_TTL_MS);
  if (existing && !force && !stale) return existing;

  const rep = await computeReputation(agent);
  const payload = {
    provider_agent_id: agent.id,
    provider_agent_code: agent.agent_id,
    trust_score: rep.trustScore,
    completed_jobs: rep.completedJobs,
    failed_jobs: rep.failedJobs,
    payment_success_rate: rep.paymentSuccessRate,
    dispute_rate: rep.disputeRate,
    customer_satisfaction: rep.customerSatisfaction,
    uptime_pct: rep.uptimePct,
    response_latency_ms: rep.responseLatencyMs,
    total_revenue_wei: rep.totalRevenueWei.toString(),
    repeat_customers: rep.repeatCustomers,
    metrics: rep.metrics,
    recomputed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (existing) {
    const { data, error } = await supabase.from('provider_reputation').update(payload).eq('id', existing.id).select().single();
    if (error) throw new Error(`Reputation update failed: ${error.message}`);
    return data;
  }
  const { data, error } = await supabase.from('provider_reputation').insert(payload).select().single();
  if (error) throw new Error(`Reputation create failed: ${error.message}`);
  return data;
};

const toPublicReputation = (r) => (r ? {
  providerAgentId: r.provider_agent_code,
  trustScore: r.trust_score,
  completedJobs: r.completed_jobs,
  failedJobs: r.failed_jobs,
  paymentSuccessRate: r.payment_success_rate,
  disputeRate: r.dispute_rate,
  customerSatisfaction: r.customer_satisfaction,
  uptimePct: r.uptime_pct,
  responseLatencyMs: r.response_latency_ms,
  totalRevenueBOT: formatEtherSafe(r.total_revenue_wei || '0'),
  repeatCustomers: r.repeat_customers,
  recomputedAt: r.recomputed_at
} : null);

export const getReputationByAgent = async (agentId) => {
  const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', agentId).maybeSingle();
  if (!agent) throw httpError(404, 'Provider agent not found.');
  const fresh = await ensureFreshReputation(agent, { force: true });
  return toPublicReputation(fresh);
};

/** Attach capabilities + reputation to a list of services (batched). */
export const enrichServices = async (services) => {
  if (!services || services.length === 0) return [];
  const serviceIds = services.map((s) => s.id).filter(Boolean);
  const agentIds = services.map((s) => s.agent_id).filter(Boolean);

  const [{ data: caps }, { data: reps }, { data: agents }] = await Promise.all([
    supabase.from('provider_capabilities').select('*').in('service_id', serviceIds),
    supabase.from('provider_reputation').select('*').in('provider_agent_id', agentIds),
    supabase.from('ai_agents').select('id, human_backed, world_verified, agent_book_id').in('id', agentIds)
  ]);
  const capMap = new Map((caps || []).map((c) => [c.service_id, c]));
  const repMap = new Map((reps || []).map((r) => [r.provider_agent_id, r]));
  const agentMap = new Map((agents || []).map((a) => [a.id, a]));

  return services.map((s) => ({
    ...s,
    capabilities: toPublicCapabilities(capMap.get(s.id) || null),
    reputation: toPublicReputation(repMap.get(s.agent_id) || null),
    humanBacked: agentMap.get(s.agent_id)?.human_backed || false,
    worldVerified: agentMap.get(s.agent_id)?.world_verified || false,
    agentBookId: agentMap.get(s.agent_id)?.agent_book_id || null
  }));
};

// =====================================================================
// INTELLIGENT PROVIDER SELECTION (Phase 3)
// =====================================================================

const inferRequirement = (task = '', requirement) => {
  const t = String(task).toLowerCase();
  const req = { ...(requirement || {}) };
  if (!req.capability) {
    if (/\btrain/.test(t) || /training/.test(t)) req.capability = 'training';
    else if (/\bembed/.test(t)) req.capability = 'embeddings';
    else if (/\bspeech|tts|voice/.test(t)) req.capability = 'speech';
    else if (/\bocr|image text|document/.test(t)) req.capability = 'ocr';
    else if (/\btranslat/.test(t)) req.capability = 'translation';
    else if (/\bimage gen|generate image|dall-e|sd\b/.test(t)) req.capability = 'imageGeneration';
    else if (/\bstorage|store|backup/.test(t)) req.capability = 'storage';
    else if (/\binfer|llm|model|gpu|inference/.test(t) || !req.capability) req.capability = 'inference';
  }
  if (req.maxBudgetBot == null) {
    const budgetMatch = t.match(/(?:under|below|less than|maximum|max)\s+([0-9]+(?:\.[0-9]+)?)\s*(?:usdc|usd|bot)?/i);
    if (budgetMatch) req.maxBudgetBot = Number(budgetMatch[1]);
  }
  if (req.verifiedOnly == null && /\bverif(?:ied|y)|world id|human[- ]backed/.test(t)) req.verifiedOnly = true;
  if (!req.sortBy && /fastest|lowest latency|quickest/.test(t)) req.sortBy = 'latency';
  if (!req.sortBy && /uptime|reliable|reliability/.test(t)) req.sortBy = 'uptime';
  const modelMatch = t.match(/\b[a-z0-9][a-z0-9.-]*-\d+(?:b|m)?(?:-\d+[a-z0-9]*)?\b/gi);
  if (!req.model && modelMatch && modelMatch[0] && modelMatch[0].toLowerCase() !== 'gpu') req.model = modelMatch[0];
  return req;
};

const intersects = (a, b) => (a || []).some((x) => (b || []).some((y) => String(x).toLowerCase() === String(y).toLowerCase()));

const hasModel = (supported, model) => {
  if (!model) return true;
  const m = String(model).toLowerCase();
  return (supported || []).some((s) => String(s).toLowerCase().includes(m) || m.includes(String(s).toLowerCase()));
};

export const recommendProviders = async ({ developerId, organizationId, consumerAgent, task, requirements }) => {
  if (!isGraphConfigured()) {
    throw httpError(503, 'The Graph provider is required for provider recommendations. Configure GRAPH_GATEWAY_URL and GRAPH_API_KEY.', 'GRAPH_REQUIRED');
  }
  const req = inferRequirement(task, requirements);
  const policy = await getPolicyByOrg(organizationId);

  let q = supabase
    .from('ai_services')
    .select('*, ai_agents(agent_id, agent_name, wallet_address, developer_id, organization_id)')
    .eq('is_active', true);
  const { data: services, error } = await q;
  if (error) throw new Error(`Recommendation query failed: ${error.message}`);

  const enriched = await enrichServices(services || []);

  const p = policy ? toPublicPolicy(policy) : null;
  const filters = {
    blockedProviders: 0,
    approvedOnly: 0,
    blockedRegions: 0,
    preferredRegions: 0,
    vram: 0,
    availability: 0,
    trust: 0,
    latency: 0,
    budget: 0,
    gpuModels: 0,
    capability: 0,
    verified: 0,
    self: 0
  };
  const block = (name, c) => { filters[name] += 1; return false; };

  const monthlySpent = await getMonthlySpendWei({ organizationId, developerId });
  let budgetRemainingBOT = null;
  if (p && Number(p.maxBudgetBOT) > 0) {
    let budgetWei = 0n;
    try { budgetWei = BigInt(ethers.parseEther(String(p.maxBudgetBOT)).toString()); } catch { budgetWei = 0n; }
    budgetRemainingBOT = formatEtherSafe(budgetWei > monthlySpent ? budgetWei - monthlySpent : 0n);
  }

  const unitWeiMap = {};
  for (const s of enriched) {
    try { unitWeiMap[s.id] = BigInt(ethers.parseEther(String(s.unit_price || '0')).toString()); } catch { unitWeiMap[s.id] = 0n; }
  }
  const candidates = [];
  const graphIds = [...new Set(enriched.map((s) => s.ai_agents?.agent_id).filter(Boolean))];
  let graphMap = new Map();
  try {
    const graphRows = await analyzeProviders({ providerIds: graphIds });
    graphMap = new Map((graphRows || []).map((row) => [String(row.providerId || '').toLowerCase(), row]));
  } catch (err) {
    logger.warn('[RECOMMEND] Graph batch analysis unavailable; using marketplace data:', err.message);
  }

  for (const s of enriched) {
    if (consumerAgent && s.agent_id === consumerAgent.id) { filters.self += 1; continue; }
    const cap = s.capabilities || {};
    const rep = s.reputation || {};
    const providerCode = s.ai_agents?.agent_id;
    const regions = cap.supportedRegions || [];
    const priceBOT = Number(s.unit_price || 0);
    const trust = rep.trustScore ?? null;
    // The Graph-powered Trust Engine is the primary provider signal. The
    // existing reputation score remains a local fallback for unindexed data.
    const graphTrust = providerCode ? graphMap.get(String(providerCode).toLowerCase()) || null : null;
    const uptime = cap.uptimePct ?? null;
    const latency = cap.averageLatencyMs ?? null;
    const quantity = req.quantity && Number(req.quantity) > 0 ? String(req.quantity) : '1';
    let estWei = 0n;
    try { estWei = await chargeWei(s.unit_price || '0', quantity); } catch { /* ignore */ }

    if (p) {
      if (p.blockedProviders.length && intersects(p.blockedProviders, [providerCode])) { block('blockedProviders'); continue; }
      if (p.approvedProviders.length && !intersects(p.approvedProviders, [providerCode])) { block('approvedOnly'); continue; }
      if (p.blockedRegions.length && regions.length && intersects(regions, p.blockedRegions)) { block('blockedRegions'); continue; }
      if (p.preferredRegions.length && !intersects(regions, p.preferredRegions)) { block('preferredRegions'); continue; }
      if (p.preferredGpuModels.length && cap.gpuModel && !intersects([cap.gpuModel], p.preferredGpuModels)) { block('gpuModels'); continue; }
      if (p.minimumVramGb && (cap.vramGb ?? 0) < p.minimumVramGb) { block('vram'); continue; }
      if (p.minimumAvailabilityPct != null && uptime != null && uptime < p.minimumAvailabilityPct) { block('availability'); continue; }
      if (p.minimumTrustScore != null && trust != null && trust < p.minimumTrustScore) { block('trust'); continue; }
      if (p.maximumLatencyMs && latency != null && latency > p.maximumLatencyMs) { block('latency'); continue; }
    }
    if (req.minVram && (cap.vramGb ?? 0) < req.minVram) { block('vram'); continue; }
    if (req.minAvailability != null && uptime != null && uptime < req.minAvailability) { block('availability'); continue; }
    if (req.minTrustScore != null && trust != null && trust < req.minTrustScore) { block('trust'); continue; }
    if (req.maxLatencyMs && latency != null && latency > req.maxLatencyMs) { block('latency'); continue; }
    if (req.maxBudgetBot && priceBOT > Number(req.maxBudgetBot)) { block('budget'); continue; }
    if (req.verifiedOnly && !s.worldVerified) { block('verified'); continue; }
    if (req.model && !hasModel(cap.supportedModels, req.model)) { block('capability'); continue; }
    const serviceText = `${s.title || ''} ${s.description || ''} ${s.category || ''}`.toLowerCase();
    const capabilityMatched = cap.capabilities?.[req.capability] || serviceText.includes(String(req.capability || '').toLowerCase()) || (req.capability === 'inference' && ['ai-model', 'gpu', 'compute'].includes(s.category));
    if (req.capability && !cap.capabilities && !capabilityMatched) { block('capability'); continue; }
    if (req.capability && cap.capabilities && !capabilityMatched) { block('capability'); continue; }

    candidates.push({ s, cap, rep, providerCode, regions, priceBOT, trust, graphTrust, uptime, latency, estWei });
  }

  // Scoring
  const maxPrice = candidates.reduce((m, c) => Math.max(m, c.priceBOT), 0) || 1;
  const maxLatency = candidates.reduce((m, c) => Math.max(m, c.latency || 0), 0) || 1;
  const score = (c) => {
    const costScore = Math.min((1 - c.priceBOT / maxPrice) * 100, 100);
     const chainSuccess = c.graphTrust?.successfulPayments || 0;
     const chainFailures = c.graphTrust?.failedPayments || 0;
     const chainTotal = chainSuccess + chainFailures;
     const chainSuccessRate = chainTotal ? (chainSuccess / chainTotal) * 100 : 0;
     const chainActivity = c.graphTrust?.recentActivity ? 100 : 0;
     const chainVolume = Math.min(100, (c.graphTrust?.settlementVolume || 0) * 10);
     const hasGraphEvidence = c.graphTrust && (chainTotal > 0 || c.graphTrust.recentActivity || Number(c.graphTrust.settlementVolume || 0) > 0);
     const trustScore = hasGraphEvidence
       ? (chainSuccessRate * 0.55 + chainActivity * 0.25 + chainVolume * 0.20)
       : (c.trust ?? 0);
    const latencyScore = c.latency ? Math.min((1 - c.latency / maxLatency) * 100, 100) : 60;
    const availScore = c.uptime ?? 90;
    const regionScore = p && p.preferredRegions.length && c.regions.length
      ? (intersects(c.regions, p.preferredRegions) ? 100 : 40)
      : 70;
    const ratingScore = (c.cap.averageRating ?? 3.5) / 5 * 100;
    return Math.round((
      costScore * 0.30
       + trustScore * 0.35
      + latencyScore * 0.15
      + availScore * 0.15
      + regionScore * 0.05
       + ratingScore * 0.00
    ) * 100) / 100;
  };

  const reasons = (c) => {
    const r = [];
    r.push(`Matches procurement policy${p && p.preferredRegions.length && c.regions.length && intersects(c.regions, p.preferredRegions) ? ' (preferred region ' + c.regions.join('/') + ')' : ''}`);
    if (req.model) r.push(`Supports ${req.model}`);
    if (c.trust !== null && c.trust >= 80) r.push('Highest trust score');
    if (c.latency !== null && c.latency === Math.min(...candidates.map((x) => x.latency || 1e9))) r.push('Lowest latency');
    if (c.priceBOT === Math.min(...candidates.map((x) => x.priceBOT))) r.push('Lowest price');
    if (c.uptime !== null && c.uptime >= 99) r.push(`High availability ${c.uptime}%`);
    return r.slice(0, 4);
  };

  const ranked = candidates
    .map((c) => ({ c, confidence: score(c) }))
    .sort((a, b) => b.confidence - a.confidence)
    .filter((item, index, all) => all.findIndex((other) => other.c.s.service_id === item.c.s.service_id) === index);

  const estMs = (c) => {
    const base = Math.max(c.cap.averageResponseTimeMs || c.latency || 1000, 100);
    return Math.round(base * (1 + (c.cap.activeJobs || 0) * 0.15));
  };

  const approvedRequired = p ? (
    !p.autoPurchaseEnabled
    || (p.invoiceApprovalThresholdBOT && Number(p.invoiceApprovalThresholdBOT) > 0 && ranked[0] && Number(formatEtherSafe(ranked[0].c.estWei)) > Number(p.invoiceApprovalThresholdBOT))
  ) : false;

  return {
    policy: p,
    recommended: ranked.map(({ c, confidence }) => ({
      serviceId: c.s.service_id,
      serviceTitle: c.s.title,
      category: c.s.category,
      pricingModel: c.s.pricing_model,
      unitPriceBOT: c.priceBOT,
      unitLabel: c.s.unit_label,
      provider: c.providerCode
        ? { agentId: c.providerCode, name: c.s.ai_agents?.agent_name, wallet: c.s.ai_agents?.wallet_address }
        : null,
      capabilities: c.cap,
      reputation: c.rep,
      confidence,
      estimatedCostBOT: formatEtherSafe(c.estWei),
      estimatedQuantity: req.quantity ? String(req.quantity) : '1',
      estimatedCompletionMs: estMs(c),
       reasons: reasons(c)
       ,trustScore: Math.round(((c.graphTrust?.trustScore != null && (c.graphTrust.successfulPayments || c.graphTrust.failedPayments || c.graphTrust.recentActivity || c.graphTrust.settlementVolume)) ? c.graphTrust.trustScore : c.trust ?? 0) * 100) / 100
       ,trustSource: c.graphTrust?.source || 'GlobalPay database'
       ,graphLive: c.graphTrust?.graphLive === true
     })),
    filters,
    meta: {
      task,
      capability: req.capability,
      model: req.model,
      monthlySpentBOT: formatEtherSafe(monthlySpent),
      budgetRemainingBOT,
      candidatesCount: ranked.length,
      approvedRequired
    }
  };
};

// =====================================================================
// PURCHASE SESSIONS (Phase 4)
// =====================================================================

// Prepaid-only session lifecycle. Every purchase is paid for BEFORE any
// service access, invoice, or credits are granted:
//   awaiting_payment (intent created) -> paid (payment confirmed, invoice(s)
//   marked paid, credits == purchased quantity) -> active (credits available) -> completed.
// Failures: payment_failed | cancelled | expired. No path ever enters
// requested/reserved/running/invoice_generated/closed (postpaid removed).
const SESSION_STATUS = ['awaiting_payment', 'processing', 'paid', 'active', 'completed', 'payment_failed', 'cancelled', 'expired'];

const toPublicSession = (s) => ({
  sessionId: s.session_id,
  organizationId: s.organization_id,
  consumerAgentId: s.consumer_agent_code,
  providerAgentId: s.provider_agent_code,
  serviceId: s.service_code,
  quantity: s.quantity,
  unit: s.unit,
  currency: s.currency,
  estimatedCostBOT: formatEtherSafe(s.estimated_cost_wei || '0'),
  actualCostBOT: s.actual_cost_wei != null ? formatEtherSafe(s.actual_cost_wei) : null,
  status: s.status,
  invoiceId: s.invoice_code,
  paymentTxHash: s.payment_tx_hash,
  explorerUrl: s.payment_tx_hash ? `${EXPLORER_URL}/tx/${s.payment_tx_hash}` : null,
  approvalRequired: s.approval_required,
  approvedAt: s.approved_at,
  confidenceScore: s.confidence_score,
  reason: s.reason,
  source: s.source,
  startedAt: s.started_at,
  completedAt: s.completed_at,
  createdAt: s.created_at,
  updatedAt: s.updated_at
});

export const createSession = async ({
  developerId, organizationId, consumerAgent, service, quantity, reason, confidenceScore, source = 'manual'
}) => {
  const { getServiceByCode } = await import('./marketplaceService.js');
  const live = await getServiceByCode(service.service_id);
  if (!live) throw httpError(404, 'Service not found or inactive.');
  if (live.agent_id === consumerAgent.id) throw httpError(400, 'An agent cannot purchase its own service.');
  if (!quantity || Number(quantity) <= 0) throw httpError(400, 'Quantity must be positive.');

  let { data: provider } = await supabase.from('ai_agents').select('*').eq('id', live.agent_id).single();
  if (!provider) {
    try {
      const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE id = $1 LIMIT 1', [live.agent_id]);
      provider = rows[0] || null;
    } catch { /* fall through */ }
  }
  if (!provider) throw httpError(404, 'Provider agent not found.');

  // Trust Engine preflight: inspect provider activity before creating a paid
  // intent. The existing Arc settlement remains the only payment path.
  if (!isGraphConfigured()) {
    throw httpError(503, 'The Graph provider is required before an agent can purchase a service.', 'GRAPH_REQUIRED');
  }
  const trust = await analyzeProvider(live.agent_code);

  const estWei = await chargeWei(live.unit_price, String(quantity));
  const estBOT = formatEtherSafe(estWei);

  // Prepaid-only: every purchase session is a prepaid intent awaiting payment.
  // Payment must be confirmed (see confirmPrepaidPurchase) before any invoice is
  // created or credits granted. The legacy approval/reserve workflow is removed.
  let approvalRequired = false;
  if (organizationId) {
    const policy = await getPolicyByOrg(organizationId);
    if (policy) {
      const monthlySpent = await getMonthlySpendWei({ organizationId, developerId });
      if (Number(policy.max_budget_bot) > 0) {
        let budgetWei = 0n;
        try { budgetWei = BigInt(ethers.parseEther(String(policy.max_budget_bot)).toString()); } catch { budgetWei = 0n; }
        const remaining = budgetWei - monthlySpent;
        if (remaining < estWei) {
          throw httpError(403, `Purchase would exceed the monthly procurement budget (${formatEtherSafe(remaining)} USDC remaining).`, 'POLICY_BUDGET_EXCEEDED');
        }
      }
    }
  }

  const sessionId = genId('psn');
  const status = 'awaiting_payment';
  const { data, error } = await supabase
    .from('purchase_sessions')
    .insert({
      session_id: sessionId,
      organization_id: organizationId || null,
      developer_id: developerId || null,
      consumer_agent_id: consumerAgent.id,
      provider_agent_id: live.agent_id,
      service_id: live.id,
      consumer_agent_code: consumerAgent.agent_id,
      provider_agent_code: live.agent_code,
      service_code: live.service_id,
      quantity: String(quantity),
      unit: live.unit_label || null,
      estimated_cost_wei: estWei.toString(),
      status,
      approval_required: false,
      confidence_score: confidenceScore ?? null,
       reason: reason || (trust ? `Trust Engine: ${trust.recommendation}` : 'Prepaid purchase'),
      source: source || 'manual'
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create purchase session: ${error.message}`);

  audit({
    developerId,
    organizationId,
    actorType: 'agent',
    actorId: consumerAgent.agent_id,
    action: 'session.created',
    resourceType: 'purchase_session',
    resourceId: sessionId,
    metadata: { serviceId: live.service_id, providerAgentId: live.agent_code, estimatedBOT: estBOT, status, prepaid: true }
  });
  dispatchEvent('purchase.session.created', {
    sessionId,
    serviceId: live.service_id,
    consumerAgentId: consumerAgent.agent_id,
    providerAgentId: live.agent_code,
    estimatedCostBOT: estBOT,
    status
  }, { developerId, organizationId });

  return { session: toPublicSession(data), approvalRequired: false, estimatedCostBOT: estBOT };
};

export const getSessionByCode = async (sessionId) => {
  const { data, error } = await supabase.from('purchase_sessions').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`Session lookup failed: ${error.message}`);
  return data || null;
};

// =====================================================================
// PREPAID PURCHASE (Pay-now, atomic)
// =====================================================================
// The purchase lifecycle is settled atomically:
//   1. createPrepaidIntent  -> purchase_sessions.status = 'awaiting_payment'
//                              (NO invoice, NO credits yet)
//   2. confirmPrepaidPurchase:
//        a. re-check wallet balance
//        b. execute MPC wallet payment
//        c. ONLY on confirmed payment: create usage + invoice(status paid),
//           grant credits (session quantity), mark session paid + close.
//      Any failure -> status 'payment_failed', reason recorded, NO invoice,
//      NO credits, paidAt/txHash stay null.
// No path creates an invoice or grants credits before payment is confirmed.

export const createPrepaidIntent = async ({ developerId, organizationId, consumerAgent, service, quantity, reason }) => {
  const { getServiceByCode } = await import('./marketplaceService.js');
  const live = await getServiceByCode(service.service_id);
  if (!live) throw httpError(404, 'Service not found or inactive.');
  if (live.agent_id === consumerAgent.id) throw httpError(400, 'An agent cannot purchase its own service.');
  if (!quantity || Number(quantity) <= 0) throw httpError(400, 'Quantity must be positive.');

  // Health check: verify service endpoint is reachable before allowing purchase
  if (live.endpoint_url) {
    try {
      const { checkServiceHealth } = await import('./serviceGateway.js');
      const health = await checkServiceHealth(live.endpoint_url);
      if (health.status === 'unhealthy') {
        throw httpError(400, `Service endpoint is currently unreachable: ${health.message}. Purchase blocked until the provider restores service.`, 'SERVICE_UNHEALTHY');
      }
    } catch (err) {
      if (err.status) throw err; // re-throw HTTP errors
      // If health check fails to execute, allow purchase with warning (don't block)
      logger.warn('[COMMERCE] Health check failed to execute:', err.message);
    }
  }

  let { data: provider } = await supabase.from('ai_agents').select('*').eq('id', live.agent_id).single();
  if (!provider) {
    try {
      const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE id = $1 LIMIT 1', [live.agent_id]);
      provider = rows[0] || null;
    } catch { /* fall through */ }
  }
  if (!provider) throw httpError(404, 'Provider agent not found.');

  if (!isGraphConfigured()) {
    throw httpError(503, 'The Graph provider is required before an agent can purchase a service.', 'GRAPH_REQUIRED');
  }
  const trust = await analyzeProvider(live.agent_code);

  const estWei = await chargeWei(live.unit_price, String(quantity));
  const estBOT = formatEtherSafe(estWei);

  const sessionId = genId('psn');
  const { data, error } = await supabase
    .from('purchase_sessions')
    .insert({
      session_id: sessionId,
      organization_id: organizationId || null,
      developer_id: developerId || null,
      consumer_agent_id: consumerAgent.id,
      provider_agent_id: live.agent_id,
      service_id: live.id,
      consumer_agent_code: consumerAgent.agent_id,
      provider_agent_code: live.agent_code,
      service_code: live.service_id,
      quantity: String(quantity),
      unit: live.unit_label || null,
      estimated_cost_wei: estWei.toString(),
      status: 'awaiting_payment',
      approval_required: false,
      confidence_score: null,
       reason: reason || (trust ? `Trust Engine: ${trust.recommendation}` : 'Prepaid purchase'),
      source: 'prepaid'
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create purchase session: ${error.message}`);

  audit({
    developerId,
    organizationId,
    actorType: 'agent',
    actorId: consumerAgent.agent_id,
    action: 'session.created',
    resourceType: 'purchase_session',
    resourceId: sessionId,
     metadata: { serviceId: live.service_id, providerAgentId: live.agent_code, estimatedBOT: estBOT, prepaid: true, trustScore: trust?.trustScore ?? null, trustSource: trust?.source || null }
  });
  dispatchEvent('purchase.session.created', {
    sessionId,
    serviceId: live.service_id,
    consumerAgentId: consumerAgent.agent_id,
    providerAgentId: live.agent_code,
    estimatedCostBOT: estBOT,
    status: 'awaiting_payment'
  }, { developerId, organizationId });

  return { session: toPublicSession(data), approvalRequired: false, estimatedCostBOT: estBOT };
};

const setSessionPaymentFailed = async (session, reason, provider) => {
  const next = await transitionSession(session, 'payment_failed', {
    reason: reason || 'Payment failed',
    completed_at: new Date().toISOString()
  });
  dispatchEvent('purchase.payment_failed', {
    sessionId: session.session_id,
    serviceId: session.service_code,
    consumerAgentId: session.consumer_agent_code,
    reason
  }, { developerId: session.developer_id, organizationId: session.organization_id });
  if (provider) {
    try { await ensureFreshReputation(provider, { force: true }); } catch (e) { logger.warn('[COMMERCE] reputation update:', e.message); }
  }
  return next;
};

/** Atomically confirm + execute a prepaid purchase. Returns a settled session
 *  (status paid/closed) on success, or payment_failed on failure. Never throws
 *  for an insufficient-balance outcome. */
export const confirmPrepaidPurchase = async ({ sessionId, organizationId }) => {
  const { getServiceByCode } = await import('./marketplaceService.js');
  const walletService = (await import('../wallets/walletService.js')).getWalletService();

  const session = await getSessionByCode(sessionId);
  if (!session) throw httpError(404, 'Purchase session not found.');
  if (session.status !== 'awaiting_payment') {
    // Idempotency: already settled / already failed -> return current state.
    return { session: toPublicSession(session), idempotent: true, failed: session.status === 'payment_failed' };
  }
  if (organizationId && session.organization_id !== organizationId) {
    throw httpError(403, 'This session is not in your workspace.');
  }

  const live = await getServiceByCode(session.service_code);
  if (!live) throw httpError(404, 'Service not found or inactive.');
  let { data: consumer } = await supabase.from('ai_agents').select('*').eq('id', session.consumer_agent_id).single();
  if (!consumer) {
    try {
      const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE id = $1 LIMIT 1', [session.consumer_agent_id]);
      consumer = rows[0] || null;
    } catch { /* fall through */ }
  }
  let { data: provider } = await supabase.from('ai_agents').select('*').eq('id', session.provider_agent_id).single();
  if (!provider) {
    try {
      const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE id = $1 LIMIT 1', [session.provider_agent_id]);
      provider = rows[0] || null;
    } catch { /* fall through */ }
  }
  if (!consumer) throw httpError(404, 'Consumer agent not found.');
  if (!provider) throw httpError(404, 'Provider agent not found.');

  const amountWei = session.estimated_cost_wei || '0';
  const amountBOT = formatEtherSafe(amountWei);

  // a) Balance gate — before any transaction.
  let balance;
  try {
    balance = await walletService.getBalance(consumer.wallet_address);
  } catch (err) {
    balance = { wei: '0', formatted: '0' };
  }
  if (BigInt(balance.wei) < BigInt(amountWei)) {
    const failedSession = await setSessionPaymentFailed(session, 'Insufficient USDC balance', provider);
    return {
      success: false,
      failed: true,
      failureReason: 'Insufficient USDC balance',
      requiredBOT: amountBOT,
      availableBOT: Number(balance.formatted || 0),
      session: toPublicSession(failedSession),
      invoice: null,
      credits: 0
    };
  }

  // b) Execute MPC wallet payment WITH PLATFORM FEE.
  // GlobalPay keeps marketplace% as commission, provider gets the rest.
  const { PLATFORM_FEES, getTreasuryAddress } = await import('../config/config.js');
  const totalWei = BigInt(amountWei);
  const platformFeePct = BigInt(PLATFORM_FEES.marketplace); // 5%
  let platformFeeWei = (totalWei * platformFeePct) / 100n;
  
  // Enforce minimum fee
  const minFee = BigInt(PLATFORM_FEES.minFeeWei);
  if (platformFeeWei < minFee) platformFeeWei = minFee;
  
  // If fee >= total, just send everything to treasury (edge case)
  if (platformFeeWei >= totalWei) platformFeeWei = totalWei / 10n; // max 10%
  
  const providerAmountWei = totalWei - platformFeeWei;
  const treasuryAddress = await getTreasuryAddress();
  const hasPlatformFee = treasuryAddress && platformFeeWei > 0n;

  let result;
  let paymentId;
  let invoiceReference;
  let createTxHash;
  let releaseTxHash;
  try {
    const managerAddress = process.env.GLOBAL_PAY_MANAGER_ADDRESS || '0x775Ab463A19E51072C61bAe94A0931E00F7caa42';
    paymentId = ethers.keccak256(ethers.toUtf8Bytes(`globalpay:purchase:${session.session_id}`));
    invoiceReference = ethers.keccak256(ethers.toUtf8Bytes(`globalpay:invoice:${session.session_id}`));
    const managerInterface = new ethers.Interface(['function settleInvoice(bytes32 id,address receiver,bytes32 invoiceRef) payable']);
    const releaseInterface = new ethers.Interface(['function release(bytes32 id)']);
    const create = await walletService.sendContractCall({
      walletId: consumer.wallet_id,
      to: managerAddress,
      data: managerInterface.encodeFunctionData('settleInvoice', [paymentId, provider.wallet_address, invoiceReference]),
      wei: amountWei,
      idempotencyKey: `invoice-create:${session.session_id}`
    });
    createTxHash = create.txHash;
    const release = await walletService.sendContractCall({
      walletId: consumer.wallet_id,
      to: managerAddress,
      data: releaseInterface.encodeFunctionData('release', [paymentId]),
      idempotencyKey: `invoice-release:${session.session_id}`
    });
    releaseTxHash = release.txHash;
    result = { ...release, txHash: releaseTxHash, confirmed: true };
  } catch (err) {
    const failedSession = await setSessionPaymentFailed(session, `Payment failed: ${err.message}`, provider);
    return {
      success: false,
      failed: true,
      failureReason: err.message,
      requiredBOT: amountBOT,
      availableBOT: Number(balance?.formatted || 0),
      session: toPublicSession(failedSession),
      invoice: null,
      credits: 0
    };
  }

  const txHash = result.txHash;
  const paidAt = new Date().toISOString();
  const settlementVerification = await waitForGraphPayment(paymentId);
  if (!settlementVerification.verified) {
    const failedSession = await setSessionPaymentFailed(session, 'GRAPH_INDEXING_PENDING', provider);
    return { success: false, failed: true, failureReason: 'GRAPH_INDEXING_PENDING', session: toPublicSession(failedSession), invoice: null, credits: 0 };
  }
  // Feed the completed Arc action back into GlobalPay's local reputation
  // engine so the next Trust Engine decision observes the outcome.
  let providerReputation = null;
  try {
    providerReputation = toPublicReputation(await ensureFreshReputation(provider, { force: true }));
  } catch (err) {
    logger.warn('[COMMERCE] post-settlement reputation refresh:', err.message);
  }

  // c) Payment confirmed → create usage + invoice (status paid) + credits.
  const { generateUsageId, generateInvoiceId } = await import('./marketplaceService.js');
  const usageId = generateUsageId();
  const { data: usageRow, error: usageErr } = await supabase
    .from('usage_reports')
    .insert({
      usage_id: usageId,
      service_id: live.id,
      service_code: live.service_id,
      consumer_agent_id: consumer.id,
      provider_agent_id: provider.id,
      consumer_agent_code: consumer.agent_id,
      provider_agent_code: provider.agent_id,
      quantity: String(session.quantity),
      unit: session.unit || null,
      amount_wei: amountWei,
      status: 'reported',
      metadata: { prepaid: true, session_id: session.session_id },
      organization_id: session.organization_id || live.organization_id || null
    })
    .select()
    .single();
  if (usageErr) throw new Error(`Failed to record prepaid usage: ${usageErr.message}`);

  const invoiceId = generateInvoiceId();
  const { data: invoiceRow, error: invErr } = await supabase
    .from('service_invoices')
    .insert({
      invoice_id: invoiceId,
      service_id: live.id,
      service_code: live.service_id,
      consumer_agent_id: consumer.id,
      provider_agent_id: provider.id,
      consumer_agent_code: consumer.agent_id,
      provider_agent_code: provider.agent_id,
      quantity: String(session.quantity),
      unit: session.unit || null,
      amount_wei: amountWei,
      currency: 'USDC',
      status: 'paid',
        tx_hash: txHash,
      paid_at: paidAt,
        metadata: {
          prepaid: true,
          session_id: session.session_id,
          payment_id: paymentId,
          invoice_reference: invoiceReference,
          create_tx_hash: createTxHash,
          release_tx_hash: releaseTxHash,
        usage_id: usageId,
        platform_fee_wei: hasPlatformFee ? platformFeeWei.toString() : '0',
        platform_fee_pct: hasPlatformFee ? PLATFORM_FEES.marketplace : 0,
        provider_received_wei: providerAmountWei.toString(),
        treasury_address: hasPlatformFee ? treasuryAddress : null
      },
      organization_id: session.organization_id || live.organization_id || null
    })
    .select()
    .single();
  if (invErr) throw new Error(`Failed to create invoice: ${invErr.message}`);

  await supabase.from('usage_reports').update({ status: 'invoiced', invoice_id: invoiceRow.id }).eq('id', usageRow.id);

  // Consumer ledger: shows full amount paid
  await supabase.from('ai_agent_transactions').insert({
    agent_id: consumer.id,
    destination_address: provider.wallet_address,
    amount: amountWei,
    token: 'USDC',
    note: `prepaid:${session.session_id} (${live.service_id}) [${hasPlatformFee ? `${PLATFORM_FEES.marketplace}% platform fee applied` : 'no fee'}]`,
    tx_hash: txHash,
    status: result.confirmed ? 'confirmed' : 'pending'
  }).then(undefined, (err) => logger.warn('[COMMERCE] consumer ledger insert warning:', err.message));

  // Platform fee ledger: track commission collected in treasury
  if (hasPlatformFee && platformFeeWei > 0n) {
    await supabase.from('platform_fees').insert({
      fee_id: `pf_${crypto.randomBytes(8).toString('hex')}`,
      source: 'marketplace',
      invoice_id: invoiceId,
      service_code: live.service_id,
      consumer_agent_code: consumer.agent_id,
      provider_agent_code: provider.agent_id,
      total_amount_wei: amountWei,
      platform_fee_wei: platformFeeWei.toString(),
      provider_amount_wei: providerAmountWei.toString(),
      fee_percentage: PLATFORM_FEES.marketplace,
      treasury_address: treasuryAddress,
      tx_hash: txHash,
      status: 'collected',
      created_at: new Date().toISOString()
    }).then(undefined, (err) => logger.warn('[COMMERCE] platform fee ledger insert warning:', err.message));
  }

  // d) Grant credits: session paid + credits == purchased quantity, then active.
  const paidSession = await transitionSession(session, 'paid', {
     actual_cost_wei: amountWei,
    invoice_id: invoiceRow.id,
    invoice_code: invoiceId,
     payment_tx_hash: txHash,
    completed_at: paidAt
  });
  const activeSession = await transitionSession(paidSession, 'active');

  audit({
    developerId: session.developer_id,
    organizationId: session.organization_id,
    actorType: 'agent',
    actorId: consumer.agent_id,
    action: 'invoice.paid',
    resourceType: 'service_invoice',
    resourceId: invoiceId,
     metadata: { serviceId: live.service_id, amountBOT, txHash, prepaid: true, settlementVerification, providerReputation }
  });
  dispatchEvent('invoice.paid', {
    invoiceId,
    serviceId: live.service_id,
    consumerAgentId: consumer.agent_id,
    providerAgentId: provider.agent_id,
    amountBOT,
    txHash
  }, { developerId: session.developer_id, organizationId: session.organization_id });
  dispatchEvent('purchase.session.paid', {
    sessionId: session.session_id,
    invoiceId,
    txHash,
    settlementVerification,
    providerReputation,
    credits: String(session.quantity)
  }, { developerId: session.developer_id, organizationId: session.organization_id });

  // e) Grant service access — generate access key for the buyer to invoke the service.
  let accessKey = null;
  try {
    const { grantServiceAccess } = await import('./serviceGateway.js');
    const access = await grantServiceAccess({
      serviceId: live.service_id,
      consumerAgentId: consumer.agent_id,
      consumerDeveloperId: session.developer_id
    });
    accessKey = access.accessKey; // plaintext — shown once to buyer
  } catch (err) {
    logger.warn('[COMMERCE] service access grant warning:', err.message);
  }

  // f) Create escrow hold — protect buyer with7-day hold period.
  let escrowInfo = null;
  try {
    const { createEscrow } = await import('./escrowService.js');
    escrowInfo = await createEscrow({
      sessionId: session.session_id,
      serviceId: live.service_id,
      buyerAgentId: consumer.agent_id,
      sellerAgentId: provider.agent_id,
      amountWei: amountWei,
      amountBOT: amountBOT,
      invoiceId: invoiceId
    });
  } catch (err) {
    logger.warn('[COMMERCE] escrow creation warning:', err.message);
  }

  return {
    success: true,
    failed: false,
    session: toPublicSession(activeSession),
    invoice: { invoiceId, amountBOT: session.quantity ? (Number(session.quantity) * Number(live.unit_price || 0)) : Number(amountBOT), status: 'paid', txHash },
    credits: String(session.quantity),
    amountBOT,
    txHash,
    providerReputation,
    paidAt,
    accessKey,
    endpointUrl: live.endpoint_url || null,
    escrow: escrowInfo ? {
      holdPeriod: escrowInfo.holdPeriod,
      releaseAt: escrowInfo.releaseAt,
      message: escrowInfo.message
    } : null
  };
};

export const getSession = async ({ developerId, organizationId, sessionId, agent }) => {
  const session = await getSessionByCode(sessionId);
  if (!session) throw httpError(404, 'Purchase session not found.');
  if (agent) {
    if (session.consumer_agent_id !== agent.id && session.provider_agent_id !== agent.id) throw httpError(403, 'This session does not belong to your agent.');
  } else {
    const ownerOk = organizationId ? session.organization_id === organizationId : session.developer_id === developerId;
    if (!ownerOk) throw httpError(403, 'This session is not in your workspace.');
  }
  return toPublicSession(session);
};

export const listSessions = async ({ developerId, organizationId, role, status, page = 1, perPage = 20, agent }) => {
  let q = supabase.from('purchase_sessions').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (agent) {
    if (role === 'consumer') q = q.eq('consumer_agent_id', agent.id);
    else if (role === 'provider') q = q.eq('provider_agent_id', agent.id);
    else q = q.or(`consumer_agent_id.eq.${agent.id},provider_agent_id.eq.${agent.id}`);
  } else if (developerId) {
    // Developer-wide history: surface purchase sessions across every
    // organization the developer owns, not just the currently-selected org.
    q = q.eq('developer_id', developerId);
  } else if (organizationId) {
    q = q.eq('organization_id', organizationId);
  }
  if (status && status !== 'all') q = q.eq('status', status);
  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  q = q.range(from, from + per - 1);
  const { data, count, error } = await q;
  if (error) throw new Error(`Session list failed: ${error.message}`);
  return {
    sessions: (data || []).map(toPublicSession),
    meta: { page: Number(page), perPage: per, total: count || 0, totalPages: Math.ceil((count || 0) / per), hasMore: (count || 0) > Number(page) * per }
  };
};

const transitionSession = async (session, nextStatus, fields = {}) => {
  const { data, error } = await supabase
    .from('purchase_sessions')
    .update({ status: nextStatus, updated_at: new Date().toISOString(), ...fields })
    .eq('id', session.id)
    .select()
    .single();
  if (error) throw new Error(`Session transition failed: ${error.message}`);
  return data;
};

export const approveSession = async () => {
  // Prepaid-only migration: the human-approval workflow is removed. Every
  // purchase is paid now (via confirmPrepaidPurchase); nothing awaits approval.
  throw httpError(410, 'Purchase approvals are removed — all purchases are prepaid (pay before use).', 'PREPAID_ONLY');
};

export const startSession = async ({ agent, sessionId }) => {
  const session = await getSessionByCode(sessionId);
  if (!session) throw httpError(404, 'Purchase session not found.');
  if (agent && session.consumer_agent_id !== agent.id) throw httpError(403, 'Only the consumer agent can start this session.');
  if (session.status === 'awaiting_payment') {
    throw httpError(402, 'Payment has not been completed. Confirm and pay for this session before starting it.', 'PAYMENT_REQUIRED');
  }
  if (session.status !== 'paid' && session.status !== 'active') {
    throw httpError(409, `Session cannot start from status ${session.status}.`);
  }
  const next = await transitionSession(session, 'active', { started_at: new Date().toISOString() });
  audit({ developerId: session.developer_id, organizationId: session.organization_id, actorType: 'agent', actorId: session.consumer_agent_code, action: 'session.started', resourceType: 'purchase_session', resourceId: session.session_id });
  dispatchEvent('purchase.session.started', { sessionId: session.session_id, serviceId: session.service_code }, { developerId: session.developer_id, organizationId: session.organization_id });
  return { session: toPublicSession(next) };
};

export const cancelSession = async ({ developerId, organizationId, agent, sessionId }) => {
  const session = await getSessionByCode(sessionId);
  if (!session) throw httpError(404, 'Purchase session not found.');
  if (agent && session.consumer_agent_id !== agent.id) throw httpError(403, 'Only the consumer agent can cancel this session.');
  if (organizationId && session.organization_id !== organizationId) throw httpError(403, 'This session is not in your workspace.');
  // Prepaid-only: only unsettled intents can be cancelled. A confirmed payment
  // is a completed sale — cancel the paid purchase is a refund, handled offline.
  if (!['awaiting_payment', 'requested', 'reserved'].includes(session.status)) {
    if (session.status === 'paid' || session.status === 'active') {
      throw httpError(409, `This purchase is already paid (${session.status}). Cancel is only allowed before payment — request a refund from support if needed.`, 'ALREADY_PAID');
    }
    throw httpError(409, `Session cannot be cancelled from status ${session.status}.`);
  }
  const next = await transitionSession(session, 'cancelled');
  audit({ developerId, organizationId, actorType: agent ? 'agent' : 'developer', actorId: agent ? agent.agent_id : developerId, action: 'session.cancelled', resourceType: 'purchase_session', resourceId: session.session_id });
  dispatchEvent('purchase.session.cancelled', { sessionId: session.session_id, serviceId: session.service_code }, { developerId, organizationId });
  return { session: toPublicSession(next) };
};

/** Hook: usage reported against an already-paid prepaid session -> completed.
 *  Prepaid-only: never creates an invoice; a session can only complete after
 *  (and never without) confirmed payment. */
export const completeSessionFromUsage = async ({ sessionId, usage }) => {
  const session = await getSessionByCode(sessionId);
  if (!session) return null;
  if (session.status !== 'paid' && session.status !== 'active') return session;
  const next = await transitionSession(session, 'completed', {
    actual_cost_wei: usage.amount_wei,
    completed_at: new Date().toISOString()
  });
  dispatchEvent('purchase.session.completed', {
    sessionId: session.session_id,
    serviceId: session.service_code,
    actualCostBOT: formatEtherSafe(usage.amount_wei)
  }, { developerId: session.developer_id, organizationId: session.organization_id });
  return next;
};

/** Legacy-debt hook: an old pending invoice paid -> session becomes active
 *  (credits granted). Retained only to settle invoices created before the
 *  prepaid-only migration; confirmPrepaidPurchase handles the current flow. */
export const closeSessionFromPayment = async ({ invoice, txHash, provider }) => {
  const { data: sessionRows } = await supabase
    .from('purchase_sessions')
    .select('*')
    .eq('invoice_id', invoice.id);
  if (!sessionRows || sessionRows.length === 0) return null;
  const session = sessionRows[0];
  const next = await transitionSession(session, 'active', { payment_tx_hash: txHash });
  dispatchEvent('purchase.session.paid', {
    sessionId: session.session_id,
    invoiceId: invoice.invoice_id,
    txHash
  }, { developerId: session.developer_id, organizationId: session.organization_id });
  dispatchEvent('purchase.session.closed', {
    sessionId: session.session_id,
    invoiceId: invoice.invoice_id,
    amountBOT: formatEtherSafe(invoice.amount_wei)
  }, { developerId: session.developer_id, organizationId: session.organization_id });
  if (provider) {
    try { await ensureFreshReputation(provider, { force: true }); } catch (e) { logger.warn('[COMMERCE] reputation update:', e.message); }
  }
  return next;
};

export const refreshProviderReputation = async (agent) => ensureFreshReputation(agent, { force: true });

// =====================================================================
// AI RECOMMENDATIONS / COST OPTIMIZATION (Phase 6)
// =====================================================================

export const getOptimizationRecommendations = async ({ developerId, organizationId }) => {
  const agentsQ = supabase.from('ai_agents').select('id, agent_id, agent_name');
  if (organizationId) agentsQ.eq('organization_id', organizationId);
  else if (developerId) agentsQ.eq('developer_id', developerId);
  const { data: agents } = await agentsQ;
  const ids = (agents || []).map((a) => a.id);
  if (ids.length === 0) return { recommendations: [] };

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  // Current-month usage per consumed service.
  const { data: usage } = await supabase
    .from('usage_reports')
    .select('service_id, service_code, quantity, amount_wei')
    .in('consumer_agent_id', ids)
    .gte('created_at', start.toISOString());

  const usageByService = {};
  (usage || []).forEach((u) => {
    const key = u.service_code;
    usageByService[key] = usageByService[key] || { serviceId: u.service_id, quantity: 0n, spendWei: 0n };
    try {
      usageByService[key].quantity += BigInt(ethers.parseUnits(String(u.quantity), 6));
      usageByService[key].spendWei += BigInt(u.amount_wei || '0');
    } catch { /* ignore */ }
  });

  if (Object.keys(usageByService).length === 0) return { recommendations: [] };

  const { data: currentServices } = await supabase
    .from('ai_services').select('*').in('id', Object.values(usageByService).map((u) => u.serviceId));
  const currentById = new Map((currentServices || []).map((s) => [s.id, s]));
  const enrichedCurrent = await enrichServices(currentServices || []);

  const { data: allServices } = await supabase.from('ai_services').select('*').eq('is_active', true);
  const others = (allServices || []).filter((s) => !currentById.has(s.id));
  const enrichedOthers = await enrichServices(others);

  const recommendations = [];
  for (const key of Object.keys(usageByService)) {
    const agg = usageByService[key];
    const current = currentById.get(agg.serviceId);
    if (!current) continue;
    const currentCap = enrichedCurrent.find((e) => e.id === current.id);
    const cap = currentCap?.capabilities || {};
    const capFlags = cap.capabilities || {};
    const qUnits = Number(ethers.formatUnits(agg.quantity, 6));
    const spendBOT = formatEtherSafe(agg.spendWei);
    const unitPriceNow = Number(current.unit_price || 0);

    const flagOk = (alt) => {
      const flags = alt.capabilities?.capabilities || {};
      return (!capFlags.inference || flags.inference)
        && (!capFlags.training || flags.training)
        && (!capFlags.embeddings || flags.embeddings)
        && (!capFlags.speech || flags.speech)
        && (!capFlags.ocr || flags.ocr)
        && (!capFlags.translation || flags.translation)
        && (!capFlags.storage || flags.storage);
    };
    const alt = enrichedOthers.find((o) => {
      const c = o.capabilities || {};
      const betterOrEqual = (o.id !== current.id)
        && o.unit_price && Number(o.unit_price) < unitPriceNow
        && (cap.vramGb == null || (c.vramGb ?? 0) >= cap.vramGb)
        && flagOk(o);
      return betterOrEqual;
    });

    if (alt) {
      const savingsPerUnit = unitPriceNow - Number(alt.unit_price);
      const estMonthlySavings = savingsPerUnit * (qUnits || 1);
      recommendations.push({
        serviceId: current.service_id,
        serviceTitle: current.title,
        currentUnitPriceBOT: unitPriceNow,
        currentProvider: current.agent_code,
        suggestedServiceId: alt.service_id,
        suggestedProvider: alt.agent_code,
        suggestedUnitPriceBOT: Number(alt.unit_price),
        estMonthlyUsageUnits: Math.round(qUnits * 1000) / 1000,
        estMonthlySpendBOT: spendBOT,
        estMonthlySavingsBOT: Math.round(estMonthlySavings * 1000) / 1000,
        reason: 'Lower cost with equal or better capability profile'
      });
    }
  }

  recommendations.sort((a, b) => b.estMonthlySavingsBOT - a.estMonthlySavingsBOT);
  return { recommendations, generatedAt: new Date().toISOString() };
};

// =====================================================================
// COMMERCE GRAPH (Phase 8)
// =====================================================================

export const getCommerceGraph = async ({ developerId, organizationId }) => {
  const agentsQ = supabase.from('ai_agents').select('id, agent_id, agent_name, wallet_address');
  if (developerId) agentsQ.eq('developer_id', developerId);
  else if (organizationId) agentsQ.eq('organization_id', organizationId);
  const { data: owned } = await agentsQ;
  const ownedIds = (owned || []).map((a) => a.id);
  if (ownedIds.length === 0) return { nodes: [], edges: [] };

  const { data: edges } = await supabase
    .from('usage_reports')
    .select('consumer_agent_code, provider_agent_code, service_code, amount_wei, status')
    .or(`consumer_agent_id.in.(${ownedIds.join(',')}),provider_agent_id.in.(${ownedIds.join(',')})`);

  const { data: sessions } = await supabase
    .from('purchase_sessions')
    .select('session_id, consumer_agent_code, provider_agent_code, service_code, actual_cost_wei, status')
    .or(`consumer_agent_id.in.(${ownedIds.join(',')}),provider_agent_id.in.(${ownedIds.join(',')})`);

  const nodeMap = new Map();
  const edgeMap = new Map();
  const upsertNode = (id, type, label) => {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, type, label });
  };
  const upsertEdge = (key, from, to, type, serviceId, amountWei, count) => {
    const e = edgeMap.get(key) || { from, to, type, serviceId, amountBOT: '0', count: 0 };
    e.amountBOT = formatEtherSafe(BigInt(e.amountBOT ? ethers.parseEther(e.amountBOT).toString() : '0') + BigInt(amountWei || '0'));
    e.count += count;
    edgeMap.set(key, e);
  };

  (edges || []).forEach((u) => {
    upsertNode(`agent:${u.consumer_agent_code}`, 'agent', u.consumer_agent_code);
    upsertNode(`agent:${u.provider_agent_code}`, 'agent', u.provider_agent_code);
    upsertNode(`service:${u.service_code}`, 'service', u.service_code);
    upsertEdge(`use:${u.consumer_agent_code}:${u.provider_agent_code}:${u.service_code}`, `agent:${u.consumer_agent_code}`, `service:${u.service_code}`, 'consume', u.service_code, u.amount_wei, 1);
    upsertEdge(`serve:${u.provider_agent_code}:${u.service_code}`, `service:${u.service_code}`, `agent:${u.provider_agent_code}`, 'serve', u.service_code, u.amount_wei, 1);
  });
  (sessions || []).forEach((s) => {
    upsertNode(`agent:${s.consumer_agent_code}`, 'agent', s.consumer_agent_code);
    upsertNode(`agent:${s.provider_agent_code}`, 'agent', s.provider_agent_code);
    upsertNode(`service:${s.service_code}`, 'service', s.service_code);
    upsertEdge(`session:${s.consumer_agent_code}:${s.provider_agent_code}:${s.service_code}`, `agent:${s.consumer_agent_code}`, `agent:${s.provider_agent_code}`, 'purchase', s.service_code, s.actual_cost_wei || '0', 1);
  });

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()]
  };
};

// =====================================================================
// AI OPERATING DASHBOARD (Phase 9)
// =====================================================================

export const getCommerceDashboard = async ({ developerId, organizationId }) => {
  const agentsQ = supabase.from('ai_agents').select('id, agent_id, agent_name');
  if (developerId) agentsQ.eq('developer_id', developerId);
  else if (organizationId) agentsQ.eq('organization_id', organizationId);
  const { data: agents } = await agentsQ;
  const ids = (agents || []).map((a) => a.id);

  const empty = { activeSessions: 0, pendingApprovals: 0, totalSessions: 0, monthlySpendBOT: '0', monthlySavingsBOT: '0', providers: [], activeCommerce: 0, spendingByService: [], revenueByService: [], insights: [] };
  if (ids.length === 0) return empty;

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const [{ data: sessions }, { data: invoices }, { data: usage }] = await Promise.all([
    supabase.from('purchase_sessions').select('status').or(`consumer_agent_id.in.(${ids.join(',')}),provider_agent_id.in.(${ids.join(',')})`),
    supabase.from('service_invoices').select('amount_wei, status, service_code, consumer_agent_code').or(`consumer_agent_id.in.(${ids.join(',')}),provider_agent_id.in.(${ids.join(',')})`),
    supabase.from('usage_reports').select('service_code, amount_wei').in('consumer_agent_id', ids).gte('created_at', start.toISOString())
  ]);

  const allSessions = sessions || [];
  const activeSessions = allSessions.filter((s) => ['paid', 'active'].includes(s.status)).length;
  const pendingPayments = allSessions.filter((s) => s.status === 'awaiting_payment').length;

  const monthInvoices = (invoices || []).filter((i) => ['paid', 'pending'].includes(i.status));
  const spendWei = monthInvoices.reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
  const spendByService = {};
  monthInvoices.forEach((i) => {
    spendByService[i.service_code] = (spendByService[i.service_code] || 0n) + BigInt(i.amount_wei || '0');
  });
  const revenueByService = {};
  (invoices || []).filter((i) => i.status === 'paid').forEach((i) => {
    revenueByService[i.service_code] = (revenueByService[i.service_code] || 0n) + BigInt(i.amount_wei || '0');
  });

  const { recommendations } = await getOptimizationRecommendations({ developerId, organizationId });
  const monthlySavings = recommendations.reduce((s, r) => s + Number(r.estMonthlySavingsBOT), 0);

  const distinctServices = new Set(monthInvoices.map((i) => i.service_code)).size;

  const { data: reps } = await supabase.from('provider_reputation').select('provider_agent_code, trust_score, completed_jobs, uptime_pct').in('provider_agent_id', ids);
  const providers = (reps || []).map((r) => ({
    providerAgentId: r.provider_agent_code,
    trustScore: r.trust_score,
    completedJobs: r.completed_jobs,
    uptimePct: r.uptime_pct
  }));

  const insights = [];
  const budgetPolicy = organizationId ? await getPolicyByOrg(organizationId) : null;
  if (budgetPolicy && Number(budgetPolicy.max_budget_bot) > 0) {
    const pct = Math.min(Math.round((Number(formatEtherSafe(spendWei)) / Number(budgetPolicy.max_budget_bot)) * 1000) / 10, 100);
    insights.push({ level: pct >= 90 ? 'warning' : pct >= 60 ? 'info' : 'ok', text: `Monthly budget usage ${pct}% of ${budgetPolicy.max_budget_bot} USDC.` });
  }
  const lowTrust = providers.filter((p) => p.trustScore < 50).sort((a, b) => a.trustScore - b.trustScore);
  if (lowTrust.length) insights.push({ level: 'warning', text: `${lowTrust.length} active provider(s) below 50 trust — consider blocking in the procurement policy.` });
  if (pendingPayments > 0) insights.push({ level: 'info', text: `${pendingPayments} purchase session(s) awaiting payment confirmation.` });
  if (monthlySavings > 0) insights.push({ level: 'ok', text: `Optimizing spend could save ~${Math.round(monthlySavings * 100) / 100} USDC/month.` });
  if (insights.length === 0) insights.push({ level: 'ok', text: 'No procurement anomalies detected.' });

  return {
    activeSessions,
    pendingPayments,
    totalSessions: allSessions.length,
    monthlySpendBOT: formatEtherSafe(spendWei),
    monthlySavingsBOT: Math.round(monthlySavings * 100) / 100,
    providers,
    activeCommerce: distinctServices,
    spendingByService: Object.entries(spendByService).map(([serviceCode, wei]) => ({ serviceCode, amountBOT: formatEtherSafe(wei) })).sort((a, b) => Number(b.amountBOT) - Number(a.amountBOT)),
    revenueByService: Object.entries(revenueByService).map(([serviceCode, wei]) => ({ serviceCode, amountBOT: formatEtherSafe(wei) })).sort((a, b) => Number(b.amountBOT) - Number(a.amountBOT)),
    insights
  };
};

// =====================================================================
// MONTHLY REPORTS + COMPLIANCE (Phase 7)
// =====================================================================

export const getMonthlyReport = async ({ developerId, organizationId, month }) => {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const start = new Date(`${m}-01T00:00:00.000Z`);
  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + 1);

  const agentsQ = supabase.from('ai_agents').select('id');
  if (developerId) agentsQ.eq('developer_id', developerId);
  else if (organizationId) agentsQ.eq('organization_id', organizationId);
  const { data: agents } = await agentsQ;
  const ids = (agents || []).map((a) => a.id);

  const empty = { month: m, spendBOT: '0', revenueBOT: '0', sessions: 0, invoices: 0, topServices: [], complianceEvents: 0 };
  if (ids.length === 0) return empty;

  const [{ data: invoices }, { data: sessions }, { data: auditLogs }] = await Promise.all([
    supabase.from('service_invoices').select('amount_wei, status, service_code, created_at').or(`consumer_agent_id.in.(${ids.join(',')}),provider_agent_id.in.(${ids.join(',')})`).gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
    supabase.from('purchase_sessions').select('status').or(`consumer_agent_id.in.(${ids.join(',')}),provider_agent_id.in.(${ids.join(',')})`).gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
    supabase.from('audit_logs').select('action, created_at').in('action', ['session.created', 'session.approved', 'session.cancelled', 'policy.updated', 'capabilities.updated']).eq('organization_id', organizationId).gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
  ]);

  const rows = invoices || [];
  const spend = rows.filter((i) => ['paid', 'pending'].includes(i.status)).reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
  const revenue = rows.filter((i) => i.status === 'paid').reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
  const byService = {};
  rows.filter((i) => i.status === 'paid').forEach((i) => {
    byService[i.service_code] = (byService[i.service_code] || 0n) + BigInt(i.amount_wei || '0');
  });

  return {
    month: m,
    spendBOT: formatEtherSafe(spend),
    revenueBOT: formatEtherSafe(revenue),
    sessions: (sessions || []).length,
    invoices: rows.length,
    topServices: Object.entries(byService).map(([serviceCode, wei]) => ({ serviceCode, amountBOT: formatEtherSafe(wei) })).sort((a, b) => Number(b.amountBOT) - Number(a.amountBOT)).slice(0, 5),
    complianceEvents: (auditLogs || []).length
  };
};

export const getComplianceLogs = async ({ developerId, organizationId, limit = 100 }) => {
  const actions = ['session.created', 'session.approved', 'session.started', 'session.completed', 'session.cancelled', 'session.paid', 'policy.updated', 'capabilities.updated', 'usage.reported', 'invoice.created', 'invoice.paid'];
  let q = supabase
    .from('audit_logs')
    .select('*')
    .in('action', actions)
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 100, 500));
  if (organizationId) q = q.eq('organization_id', organizationId);
  else if (developerId) q = q.eq('developer_id', developerId);
  const { data, error } = await q;
  if (error) throw new Error(`Compliance log fetch failed: ${error.message}`);
  return (data || []).map((l) => ({
    id: l.id,
    action: l.action,
    actorType: l.actor_type,
    actorId: l.actor_id,
    resourceType: l.resource_type,
    resourceId: l.resource_id,
    metadata: l.metadata || {},
    createdAt: l.created_at
  }));
};
