/**
 * Autonomous Commerce orchestration.
 *
 * This service coordinates existing boundaries only:
 * marketplace discovery, live Graph evidence, prepaid Arc settlement, and
 * the existing service gateway. It owns the decision/explanation, not money.
 *
 * The decision itself is made from The Graph evidence (via the shared
 * snapshot in graphIntelligenceService) — one snapshot per decision, no
 * per-provider N+1 bursts.
 */
import { listMarketplace } from './marketplaceService.js';
import { analyzeProviders, loadGraphSnapshot, verifySettlement } from './graphIntelligenceService.js';
import { createPrepaidIntent, confirmPrepaidPurchase, getMonthlySpendWei, getPolicyByOrg, chargeWei, inferRequirements } from './commerceService.js';
import { invokeService } from './serviceGateway.js';

const capabilityFromGoal = (goal, capability) => String(capability || goal || '').trim().split(/\s+/).slice(-2).join(' ');

export const executeAgentGoal = async ({
  goal,
  capability,
  consumerAgent,
  developerId,
  organizationId,
  quantity = '1',
  invoke = false,
  invokePayload = {},
  executionMode = 'automatic'
}) => {
  if (!goal && !capability) throw Object.assign(new Error('A goal or capability is required.'), { status: 400 });

  const search = capabilityFromGoal(goal, capability);
  const requirements = inferRequirements(goal, {});
  const purchaseQuantity = requirements.quantity > 0 ? String(requirements.quantity) : String(quantity);
  const marketplace = await listMarketplace({ search, perPage: 100, order: 'desc' });
  const candidates = (marketplace.services || []).filter((service) => {
    if (service.agentId === consumerAgent.agent_id || !service.provider?.wallet) return false;
    const price = Number(service.unitPriceBOT ?? service.unitPrice ?? 0);
    if (requirements.maxBudgetBot != null && price > Number(requirements.maxBudgetBot)) return false;
    if (requirements.capability && service.category && !String(`${service.category} ${service.title} ${service.description}`).toLowerCase().includes(String(requirements.capability).toLowerCase()) && !['inference', 'compute'].includes(requirements.capability)) return false;
    return true;
  });
  if (!candidates.length) throw Object.assign(new Error('No providers with live Graph evidence were found.'), { status: 404 });

  // One Graph snapshot feeds every candidate ranking + the final evidence.
  const snapshot = await loadGraphSnapshot();

  const graphRows = await analyzeProviders({ providerIds: candidates.map((service) => service.provider.wallet) });
  const graphByProvider = new Map(graphRows.map((graph) => [String(graph.providerId).toLowerCase(), graph]));
  const evidence = candidates.map((service) => {
    const graph = graphByProvider.get(String(service.provider.wallet).toLowerCase());
    if (!graph) return null;
    return {
      service,
      graph,
      score: (graph.trustScore / 100) * (graph.confidence > 0 ? 1 : 0.7)
    };
  }).filter(Boolean);
  if (!evidence.length) throw Object.assign(new Error('No providers with live Graph evidence were found.'), { status: 404 });

  // Rank: trust score first, then settlement volume.
  // World AgentKit verification is an authorization gate (publish access),
  // not a ranking signal — the Trust Engine decides purely on Graph evidence.
  const ranked = evidence.sort((a, b) =>
    (b.score - a.score)
    || (b.graph.settlementVolume - a.graph.settlementVolume)
  );
  const chosen = ranked[0];

  const policy = organizationId ? await getPolicyByOrg(organizationId) : null;
  const estimatedWei = await chargeWei(chosen.service.unitPriceBOT ?? chosen.service.unitPrice ?? '0', purchaseQuantity);
  const estimatedUSDC = Number(estimatedWei) / 1e18;
  if (executionMode === 'automatic' && policy?.auto_purchase_enabled === false) {
    throw Object.assign(new Error('Automatic payment is disabled by the active procurement policy. Use approval mode or enable automatic purchases.'), { status: 403, code: 'AUTO_PURCHASE_DISABLED' });
  }
  if (policy && Number(policy.max_budget_bot || 0) > 0) {
    const monthlySpent = await getMonthlySpendWei({ organizationId, developerId });
    const budgetWei = BigInt(Math.round(Number(policy.max_budget_bot) * 1e18));
    if (monthlySpent + estimatedWei > budgetWei) {
      throw Object.assign(new Error(`Autonomous purchase exceeds the procurement budget. Estimated ${estimatedUSDC.toFixed(4)} USDC exceeds the remaining ${Math.max(0, Number(budgetWei - monthlySpent) / 1e18).toFixed(4)} USDC.`), { status: 403, code: 'POLICY_BUDGET_EXCEEDED' });
    }
  }

  const decisionReason = [
    `Selected ${chosen.service.title} — Trust Engine score ${chosen.graph.trustScore}/100 (confidence ${(chosen.graph.confidence * 100).toFixed(0)}%, risk ${chosen.graph.riskLevel}).`,
    `Graph evidence: ${chosen.graph.reasoning.join('; ')}.`
  ].join(' ');

  const intent = await createPrepaidIntent({
    developerId,
    organizationId,
    consumerAgent,
    service: { ...chosen.service, service_id: chosen.service.serviceId },
    quantity: purchaseQuantity,
    reason: `Autonomous decision: ${decisionReason}`
  });
  if (executionMode === 'approval') {
    return {
      goal, executionMode, providerChosen: chosen.service, decisionReason,
      estimatedCostUSDC: estimatedUSDC, policyChecked: true,
      graphEvidence: chosen.graph, arcSettlement: null, verification: null,
      invocation: null, pendingSession: intent.session
    };
  }
  const settlement = await confirmPrepaidPurchase({ sessionId: intent.session.sessionId, organizationId });
  if (!settlement.success) {
    return { goal, providerChosen: chosen.service, decisionReason, graphEvidence: chosen.graph, arcSettlement: settlement, verification: null, invocation: null };
  }

  // Prepaid confirmation already waits for the Graph payment entity by its
  // settlement ID. Prefer that authoritative result over a second lookup by
  // the release transaction hash, which may not be the entity's tx hash.
  const verification = settlement.settlementVerification?.verified
    ? settlement.settlementVerification
    : await verifySettlement(settlement.txHash);
  let invocation = null;
  if (invoke) {
    if (!settlement.accessKey) throw Object.assign(new Error('Settlement succeeded but no service access key was returned.'), { status: 502 });
    invocation = await invokeService({
      accessKey: settlement.accessKey,
      serviceId: chosen.service.serviceId,
      requestPayload: invokePayload
    });
  }

  return {
    goal,
    executionMode,
    providerChosen: chosen.service,
    decisionReason,
    trustScore: chosen.graph.trustScore,
    confidence: chosen.graph.confidence,
    riskLevel: chosen.graph.riskLevel,
    decisionTrace: {
      marketplaceCandidates: candidates.length,
      graphProvidersAnalyzed: evidence.length,
      snapshotBlock: snapshot.meta?.block?.number || null,
      ranked: ranked.map(({ service, graph, score }) => ({
        serviceId: service.serviceId,
        title: service.title,
        wallet: service.provider.wallet,
        trustScore: graph.trustScore,
        confidence: graph.confidence,
        riskLevel: graph.riskLevel,
        successfulPayments: graph.successfulPayments,
        settlementVolume: graph.settlementVolume,
        uniquePayers: graph.uniquePayers,
        lastSettlement: graph.lastSettlement,
        riskFlags: graph.riskFlags.map((flag) => flag.code),
        score: Number(score.toFixed(4))
      }))
    },
    marketplaceProviders: ranked.map(({ service, graph }) => ({ service, graph })),
    graphEvidence: chosen.graph,
    arcSettlement: settlement,
    verification,
    invocation
  };
};
