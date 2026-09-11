/**
 * Agent Passport Service — the persistent Human-Backed Agent Identity model.
 *
 * Every published agent gets a Passport that fuses the two identity/trust
 * sources GlobalPay is built on:
 *
 *   World AgentKit  → WHO is behind the wallet
 *     • World ID v4 proof: the developer verified ONCE as a unique human
 *     • AgentBook (World Chain): each agent wallet is linked to that human
 *
 *   GlobalPay + The Graph → WHAT the wallet has done
 *     • Settlement intelligence computed exclusively from indexed payments
 *
 * Continuity is a GlobalPay feature: because AgentBook links every wallet of
 * a verified human, GlobalPay associates those wallets with ONE publisher
 * profile and aggregates reputation at the publisher level. A new agent
 * wallet registered through AgentBook inherits the publisher record instead
 * of starting from zero. World provides the identity; GlobalPay provides the
 * continuity.
 */
import { supabase } from '../config/supabaseClient.js';
import logger from '../utils/logger.js';
import { getUserVerificationStatus } from './worldIdVerifyService.js';
import { getVerificationStatus } from './worldAgentKitService.js';
import { analyzeProvider, buildPublisherContext } from './graphIntelligenceService.js';

const httpError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

const riskLevelFromTrust = (trustScore, riskFlags = []) => {
  if (riskFlags.some((f) => ['self_payment', 'cancellation_streak', 'failure_dominant'].includes(f.code))) return 'high';
  if (trustScore == null) return 'unknown';
  if (trustScore >= 75) return 'low';
  if (trustScore >= 45) return 'medium';
  return 'high';
};

/**
 * Build the full Agent Passport for an agent (wallet).
 * `agent` is the raw ai_agents row (or object with agent_id / wallet_address).
 */
export const buildAgentPassport = async (agent, { graphAnalysis = null, publisherContext = null } = {}) => {
  if (!agent?.agent_id) throw httpError(400, 'agent is required to build a passport.', 'AGENT_REQUIRED');

  // ── 1. World identity: human verification + AgentBook registration ──
  const [agentVerification, publisherHuman] = await Promise.all([
    getVerificationStatus(agent.agent_id).catch(() => null),
    agent.developer_id ? getUserVerificationStatus(agent.developer_id).catch(() => ({ verified: false })) : Promise.resolve({ verified: false })
  ]);

  const humanVerified = Boolean(agentVerification?.world_verified || agentVerification?.human_backed || publisherHuman.verified);
  // AgentBook is wallet-specific. World ID/human_backed alone must not make
  // an agent appear AgentBook-registered.
  const agentBookRegistered = Boolean(agentVerification?.agent_book_id);
  const agentBookId = agentVerification?.agent_book_id || null;

  // ── 2. Publisher scope: every AgentBook-registered wallet of this human ──
  let publisher = null;
  if (agent.developer_id || agent.organization_id) {
    try {
      publisher = publisherContext || await buildPublisherContext({
        developerId: agent.developer_id,
        organizationId: agent.organization_id,
        currentWallet: String(agent.wallet_address || '').toLowerCase()
      });
    } catch (err) {
      logger.warn('[PASSPORT] publisher context unavailable:', err.message);
    }
  }

  // ── 3. Settlement intelligence — always The Graph, never invented ──
  let trust = graphAnalysis;
  if (!trust && agent.wallet_address) {
    try {
      trust = await analyzeProvider(agent.wallet_address);
    } catch (err) {
      logger.warn('[PASSPORT] Graph analysis unavailable:', err.message);
    }
  }
  if (!trust) {
    // Graph not configured or wallet unknown: identity-only passport, honest zero.
    trust = {
      trustScore: humanVerified ? 25 : 0,
      confidence: humanVerified ? 0.15 : 0,
      riskLevel: 'unknown',
      riskFlags: [],
      reasoning: ['The Graph is not configured — no settlement intelligence available. Identity signals only.'],
      successfulPayments: 0,
      paymentCount: 0,
      settlementVolume: 0,
      uniquePayers: 0,
      source: 'identity-only'
    };
  }

  const trustScore = Number(trust.trustScore ?? 0);
  const riskLevel = trust.riskLevel || riskLevelFromTrust(trustScore, trust.riskFlags || []);

  // Publisher continuity display: when the direct wallet history is thin but the
  // publisher record is richer, the passport shows the inherited record.
  const inheritsPublisherReputation = Boolean(
    publisher?.inheritsReputation && (trust.paymentCount || 0) < 3 && (publisher.walletCount || 0) > 1
  );
  const continuity = inheritsPublisherReputation ? {
    active: true,
    explanation: 'This agent wallet was recently registered through AgentBook, so GlobalPay associates it with the verified publisher profile — the passport reflects the publisher-level settlement record, not a fresh start.',
    publisherWalletCount: publisher.walletCount,
    aggregatedSettlementVolume: publisher.aggregatedSettlementVolume ?? null,
    firstSettlement: publisher.firstSettlement ? new Date(publisher.firstSettlement * 1000).toISOString() : null,
    siblingWallets: publisher.siblingWallets || []
  } : { active: false };

  // ── 4. Reputation & activity metrics (platform DB; labels when unproven) ──
  let reputation = null;
  let activity = null;
  try {
    const { data: repRow } = await supabase
      .from('provider_reputation')
      .select('*')
      .eq('provider_agent_id', agent.id)
      .maybeSingle();
    if (repRow) {
      reputation = {
        trustScore: repRow.trust_score,
        completedJobs: repRow.completed_jobs,
        failedJobs: repRow.failed_jobs,
        paymentSuccessRate: repRow.payment_success_rate,
        customerSatisfaction: repRow.customer_satisfaction,
        repeatCustomers: repRow.repeat_customers,
        recomputedAt: repRow.recomputed_at
      };
    }
  } catch (err) {
    logger.debug('[PASSPORT] reputation lookup skipped:', err.message);
  }
  try {
    const { data: inv } = await supabase
      .from('service_invoices')
      .select('amount_wei, status, consumer_agent_code, paid_at')
      .eq('provider_agent_id', agent.id);
    const paid = (inv || []).filter((i) => i.status === 'paid');
    const buyers = new Set(paid.map((i) => i.consumer_agent_code));
    activity = {
      platformInvoices: (inv || []).length,
      platformPaidInvoices: paid.length,
      uniqueBuyers: buyers.size,
      lastPaidInvoiceAt: paid.length ? paid.map((i) => i.paid_at).filter(Boolean).sort().pop() : null,
      source: 'GlobalPay platform ledger'
    };
  } catch (err) {
    logger.debug('[PASSPORT] activity lookup skipped:', err.message);
  }

  // ── 5. Capabilities: what this agent's published services actually do ──
  let capabilities = [];
  try {
    const { data: svc } = await supabase
      .from('ai_services')
      .select('service_id, title, category, pricing_model, unit_price, unit_label, require_x402, x402_price, is_active')
      .eq('agent_id', agent.id);
    capabilities = (svc || []).map((s) => ({
      serviceId: s.service_id,
      title: s.title,
      category: s.category,
      pricingModel: s.pricing_model,
      unitPrice: s.unit_price,
      unitLabel: s.unit_label,
      requireX402: Boolean(s.require_x402),
      x402Price: s.x402_price,
      isActive: Boolean(s.is_active)
    }));
  } catch (err) {
    logger.debug('[PASSPORT] capabilities lookup skipped:', err.message);
  }

  // ── 6. Publisher profile info ──
  let publisherInfo = { developerId: agent.developer_id || null, organizationId: agent.organization_id || null, name: null };
  if (agent.organization_id) {
    try {
      const { data: org } = await supabase.from('organizations').select('name').eq('id', agent.organization_id).maybeSingle();
      publisherInfo.name = org?.name || null;
    } catch { /* fall through */ }
  }

  // ── 7. Payment & settlement history (recent, auditable) ──
  const paymentHistory = (trust.payments || []).slice(0, 15).map((p) => ({
    id: p.id,
    transactionHash: p.transactionHash,
    blockNumber: p.blockNumber,
    timestamp: p.timestamp,
    payer: p.payer,
    amount: Number(p.amount || 0) / 1e18,
    status: p.status
  }));
  const settlementHistory = trust.settlements || [];

  return {
    passportId: `passport:${agent.agent_id}`,
    issuedAt: new Date().toISOString(),
    // Identity
    agentId: agent.agent_id,
    agentName: agent.agent_name || null,
    walletAddress: agent.wallet_address || null,
    humanVerified,                    // World ID: unique human behind the publisher
    agentBookRegistered,              // AgentBook on World Chain: wallet ↔ human link
    agentBookId,
    agentBookTxHash: agentVerification?.agentbook_tx_hash || null,
    verifiedAt: agentVerification?.world_verified_at || publisherHuman.verifiedAt || null,
    verificationMethod: agentVerification?.verification_method || (publisherHuman.verified ? 'worldid_v4' : null),
    // Publisher
    publisher: {
      ...publisherInfo,
      humanVerified,
      walletCount: publisher?.walletCount ?? 1,
      agentBookCount: publisher?.agentBookCount ?? 0,
      continuity
    },
    // Trust
    trustScore,
    successRate: trust.successRate ?? null,
    confidence: trust.confidence ?? null,
    riskLevel,
    riskFlags: trust.riskFlags || [],
    trustSource: trust.source || 'The Graph',
    graphLive: trust.graphLive !== false,
    // Intelligence
    intelligence: {
      paymentCount: trust.paymentCount ?? 0,
      successfulPayments: trust.successfulPayments ?? 0,
      settlementVolume: trust.settlementVolume ?? 0,
      uniqueBuyers: trust.uniquePayers ?? 0,
      repeatBuyers: trust.repeatCustomers ?? 0,
      paymentsLast7d: trust.paymentsLast7d ?? 0,
      paymentsLast30d: trust.paymentsLast30d ?? 0,
      activityTrend: trust.activityTrend || 'dormant',
      lastSettlement: trust.lastSettlement || null
    },
    // Explainable reasoning — why this trust score
    trustReasoning: trust.reasoning || [],
    // Continuity
    continuity,
    // History
    paymentHistory,
    settlementHistory,
    // Capabilities
    capabilities,
    // Reputation + activity (platform-level complements to the Graph record)
    reputation,
    activityMetrics: activity
  };
};

/**
 * Build a compact passport summary for embedding in marketplace lists.
 */
export const passportSummary = (passport) => passport ? ({
  agentId: passport.agentId,
  humanVerified: passport.humanVerified,
  agentBookRegistered: passport.agentBookRegistered,
  trustScore: passport.trustScore,
  riskLevel: passport.riskLevel,
  successfulPayments: passport.intelligence?.successfulPayments ?? 0,
  settlementVolume: passport.intelligence?.settlementVolume ?? 0,
  uniqueBuyers: passport.intelligence?.uniqueBuyers ?? 0,
  continuityActive: Boolean(passport.continuity?.active)
}) : null;

/**
 * Public agent profile (Enterprise Trust page payload).
 * Fuses identity, Graph intelligence, publisher continuity and capabilities.
 */
export const buildAgentProfile = async ({ agentId, walletAddress, agentRow, serviceRow } = {}) => {
  let agent = agentRow || null;
  if (!agent && agentId) {
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();
    agent = data || null;
  }
  if (!agent && walletAddress) {
    const { data } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('wallet_address', String(walletAddress).toLowerCase())
      .maybeSingle();
    agent = data || null;
  }
  if (!agent && serviceRow?.agent_id) {
    const { data } = await supabase.from('ai_agents').select('*').eq('id', serviceRow.agent_id).maybeSingle();
    agent = data || null;
  }
  if (!agent) throw httpError(404, 'Agent not found for this provider.', 'AGENT_NOT_FOUND');

  const passport = await buildAgentPassport(agent);

  // Service context: when the profile is opened from a service, show that service first.
  const service = serviceRow ? {
    serviceId: serviceRow.service_id,
    title: serviceRow.title,
    category: serviceRow.category,
    description: serviceRow.description || null,
    pricingModel: serviceRow.pricing_model,
    unitPrice: serviceRow.unit_price,
    unitLabel: serviceRow.unit_label,
    requireX402: Boolean(serviceRow.require_x402),
    x402Price: serviceRow.x402_price || null
  } : null;

  return { passport, service };
};

/**
 * Publisher-level passport: aggregate record for every AgentBook-registered
 * wallet of one verified human. This is the continuity artifact.
 */
export const buildPublisherPassport = async ({ developerId, organizationId } = {}) => {
  if (!developerId && !organizationId) throw httpError(400, 'developerId or organizationId is required.', 'SCOPE_REQUIRED');

  const scope = organizationId ? { column: 'organization_id', value: organizationId } : { column: 'developer_id', value: developerId };
  const { data: agents, error } = await supabase
    .from('ai_agents')
    .select('id, agent_id, agent_name, wallet_address, world_verified, agent_book_id, world_verified_at, developer_id, organization_id')
    .eq(scope.column, scope.value);
  if (error) throw httpError(500, `Publisher lookup failed: ${error.message}`);

  const verifiedAgents = (agents || []).filter((a) => a.agent_book_id);
  const human = developerId ? await getUserVerificationStatus(developerId).catch(() => ({ verified: false })) : { verified: false };

  const publisherContext = await buildPublisherContext({
    developerId,
    organizationId,
    currentWallet: null
  }).catch(() => null);

  const passports = [];
  for (const agent of verifiedAgents.slice(0, 10)) {
    try {
      passports.push(await buildAgentPassport(agent, { publisherContext }));
    } catch (err) {
      logger.warn(`[PASSPORT] passport build failed for ${agent.agent_id}:`, err.message);
    }
  }

  return {
    publisherId: organizationId || developerId,
    scope: organizationId ? 'organization' : 'developer',
    humanVerified: human.verified,
    verifiedAt: human.verifiedAt || null,
    walletCount: publisherContext?.walletCount ?? verifiedAgents.length,
    aggregatedSettlementVolume: publisherContext?.aggregatedSettlementVolume ?? 0,
    firstSettlement: publisherContext?.firstSettlement ? new Date(publisherContext.firstSettlement * 1000).toISOString() : null,
    agents: passports.map((p) => ({
      agentId: p.agentId,
      walletAddress: p.walletAddress,
      agentBookRegistered: p.agentBookRegistered,
      trustScore: p.trustScore,
      riskLevel: p.riskLevel,
      successfulPayments: p.intelligence?.successfulPayments ?? 0,
      settlementVolume: p.intelligence?.settlementVolume ?? 0,
      uniqueBuyers: p.intelligence?.uniqueBuyers ?? 0,
      continuityActive: Boolean(p.continuity?.active)
    }))
  };
};
