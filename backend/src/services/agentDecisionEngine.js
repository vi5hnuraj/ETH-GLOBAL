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
import { analyzeProvider, loadGraphSnapshot, verifySettlement } from './graphIntelligenceService.js';
import { createPrepaidIntent, confirmPrepaidPurchase } from './commerceService.js';
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
  invokePayload = {}
}) => {
  if (!goal && !capability) throw Object.assign(new Error('A goal or capability is required.'), { status: 400 });

  const search = capabilityFromGoal(goal, capability);
  const marketplace = await listMarketplace({ search, perPage: 100, order: 'desc' });
  const candidates = (marketplace.services || []).filter((service) => service.agentId !== consumerAgent.agent_id && service.provider?.wallet);
  if (!candidates.length) throw Object.assign(new Error('No providers with live Graph evidence were found.'), { status: 404 });

  // One Graph snapshot feeds every candidate ranking + the final evidence.
  const snapshot = await loadGraphSnapshot();

  const evidence = await Promise.all(candidates.map(async (service) => {
    const graph = await analyzeProvider(service.provider.wallet);
    return {
      service,
      graph,
      score: (graph.trustScore / 100) * (graph.confidence > 0 ? 1 : 0.7)
    };
  }));

  // Rank: trust score first, then settlement volume.
  // World AgentKit verification is an authorization gate (publish access),
  // not a ranking signal — the Trust Engine decides purely on Graph evidence.
  const ranked = evidence.sort((a, b) =>
    (b.score - a.score)
    || (b.graph.settlementVolume - a.graph.settlementVolume)
  );
  const chosen = ranked[0];

  const decisionReason = [
    `Selected ${chosen.service.title} — Trust Engine score ${chosen.graph.trustScore}/100 (confidence ${(chosen.graph.confidence * 100).toFixed(0)}%, risk ${chosen.graph.riskLevel}).`,
    `Graph evidence: ${chosen.graph.reasoning.join('; ')}.`
  ].join(' ');

  const intent = await createPrepaidIntent({
    developerId,
    organizationId,
    consumerAgent,
    service: { ...chosen.service, service_id: chosen.service.serviceId },
    quantity,
    reason: `Autonomous decision: ${decisionReason}`
  });
  const settlement = await confirmPrepaidPurchase({ sessionId: intent.session.sessionId, organizationId });
  if (!settlement.success) {
    return { goal, providerChosen: chosen.service, decisionReason, graphEvidence: chosen.graph, arcSettlement: settlement, verification: null, invocation: null };
  }

  const verification = await verifySettlement(settlement.txHash);
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
