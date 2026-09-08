/**
 * GraphIntelligenceWorker — continuous Graph event monitoring.
 *
 * Polls the deployed subgraph every GRAPH_WATCH_INTERVAL_MS (default 5 min),
 * detects new PaymentReleased events, and:
 *  1. Refreshes provider_reputation from the fresh Graph snapshot.
 *  2. Dispatches 'graph.payment.indexed' webhooks for affected organizations.
 *  3. Logs risk-level changes (fraud detection) as 'graph.risk.detected' events.
 *
 * Never fabricates data — only reads Graph evidence and updates local
 * provider_reputation metrics via ensureFreshReputation (which itself is
 * Graph-derived through computeReputation).
 */
import { supabase } from '../config/supabaseClient.js';
import { loadGraphSnapshot, analyzeProvider, clearGraphSnapshotCache } from '../services/graphIntelligenceService.js';
import { ensureFreshReputation } from '../services/commerceService.js';
import { dispatchEvent } from '../services/webhookService.js';
import logger from '../utils/logger.js';

const INTERVAL_MS = Number(process.env.GRAPH_WATCH_INTERVAL_MS) || 5 * 60 * 1000;

let running = false;
let lastSeenBlock = null;
let lastSnapshotPaymentCount = 0;
let lastProviderRanks = new Map(); // wallet → trustScore for detecting ranking changes

const resolveAgentsByWallet = async (wallets) => {
  if (!wallets.length) return [];
  try {
    const { data } = await supabase
      .from('ai_agents')
      .select('id, agent_id, wallet_address, developer_id, organization_id')
      .in('wallet_address', wallets);
    return data || [];
  } catch (err) {
    logger.warn('[GRAPH_WORKER] agent lookup failed:', err.message);
    return [];
  }
};

const runCycle = async () => {
  if (running) return;
  running = true;
  const started = Date.now();

  try {
    // Force a fresh snapshot (bypass 15s cache) for the monitoring cycle.
    clearGraphSnapshotCache();
    const snapshot = await loadGraphSnapshot({ fresh: true });
    const currentBlock = snapshot.meta?.block?.number ? Number(snapshot.meta.block.number) : null;
    const currentPaymentCount = snapshot.payments.length;

    // Detect new payments since last cycle.
    const newPayments = lastSeenBlock != null
      ? snapshot.payments.filter((p) => Number(p.blockNumber) > lastSeenBlock)
      : [];
    const hasNewPayments = newPayments.length > 0 || lastSeenBlock === null;

    // Build per-provider intelligence for the current snapshot.
    const payees = Array.from(new Set(
      snapshot.payments.map((p) => String(p.payee || '').toLowerCase()).filter(Boolean)
    ));
    const providerIntelligences = new Map();
    for (const payee of payees) {
      providerIntelligences.set(payee, analyzeProvider(payee).then ? null : null); // lazy
      const intel = await analyzeProvider(payee);
      providerIntelligences.set(payee, intel);
    }

    // Resolve Graph payee wallets → DB agents for reputation updates.
    const agents = await resolveAgentsByWallet(payees);
    const walletToAgent = new Map();
    for (const agent of agents) {
      if (agent.wallet_address) walletToAgent.set(agent.wallet_address.toLowerCase(), agent);
    }

    // Update provider reputation for agents with Graph evidence.
    let reputationUpdates = 0;
    for (const [wallet, agent] of walletToAgent) {
      try {
        await ensureFreshReputation(agent, { force: true });
        reputationUpdates += 1;
      } catch (err) {
        logger.warn(`[GRAPH_WORKER] reputation update failed for ${agent.agent_id}:`, err.message);
      }
    }

    // Detect ranking changes and risk-level transitions.
    const currentRanks = new Map();
    const sortedProviders = Array.from(providerIntelligences.entries())
      .sort((a, b) => (b[1].trustScore - a[1].trustScore));
    for (const [wallet, intel] of sortedProviders) {
      currentRanks.set(wallet, intel.trustScore);
      const prevScore = lastProviderRanks.get(wallet);
      const agent = walletToAgent.get(wallet);

      // Risk detection: dispatch webhook when a provider's risk level worsens.
      if (intel.riskLevel === 'high' && prevScore != null && intel.trustScore < prevScore - 10) {
        try {
          dispatchEvent('graph.risk.detected', {
            providerWallet: wallet,
            agentId: agent?.agent_id,
            trustScore: intel.trustScore,
            previousTrustScore: prevScore,
            riskLevel: intel.riskLevel,
            riskFlags: intel.riskFlags.map((f) => f.code)
          }, { developerId: agent?.developer_id, organizationId: agent?.organization_id });
        } catch (err) {
          logger.warn('[GRAPH_WORKER] risk webhook dispatch failed:', err.message);
        }
      }
    }

    // Dispatch webhooks for new indexed payments.
    if (newPayments.length > 0) {
      const uniquePayees = [...new Set(newPayments.map((p) => String(p.payee || '').toLowerCase()))];
      const affectedWallets = await resolveAgentsByWallet(uniquePayees);
      for (const agent of affectedWallets) {
        try {
          dispatchEvent('graph.payment.indexed', {
            paymentsCount: newPayments.length,
            indexedBlock: currentBlock,
            providerWallet: agent.wallet_address,
            latestPayment: newPayments[newPayments.length - 1]
          }, { developerId: agent.developer_id, organizationId: agent.organization_id });
        } catch (err) {
          logger.warn('[GRAPH_WORKER] payment webhook dispatch failed:', err.message);
        }
      }
    }

    lastSeenBlock = currentBlock;
    lastSnapshotPaymentCount = currentPaymentCount;
    lastProviderRanks = currentRanks;

    logger.info('[GRAPH_WORKER] Cycle complete:', {
      block: currentBlock,
      payments: currentPaymentCount,
      newPayments: newPayments.length,
      reputationUpdates,
      providers: payees.length,
      ms: Date.now() - started
    });
  } catch (err) {
    logger.error('[GRAPH_WORKER] Cycle error:', err.message);
  } finally {
    running = false;
  }
};

export const startGraphIntelligenceWorker = () => {
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.GRAPH_WATCH_DISABLED === 'true') {
    logger.info('[GRAPH_WORKER] Disabled via GRAPH_WATCH_DISABLED');
    return;
  }
  logger.info(`[GRAPH_WORKER] Started (interval: ${INTERVAL_MS}ms)`);
  // First cycle after a 30-second delay to let the server and Graph warm up.
  setTimeout(() => runCycle(), 30_000);
  setInterval(() => runCycle(), INTERVAL_MS);
};

export const getGraphWorkerState = () => ({
  lastSeenBlock,
  lastSnapshotPaymentCount,
  providerCount: lastProviderRanks.size,
  intervalMs: INTERVAL_MS
});
