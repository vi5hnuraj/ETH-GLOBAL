/**
 * Live The Graph data access for GlobalPay's Trust Engine.
 *
 * This module intentionally has no PostgreSQL fallback for provider
 * intelligence and settlement verification: the deployed Subgraph is the
 * single source of truth for who can be trusted in the marketplace.
 *
 * PostgreSQL is used ONLY to resolve agent identifiers (agent_id → wallet
 * address); every trust metric below is computed exclusively from Graph data.
 */
import logger from '../utils/logger.js';
import { cache } from '../utils/ttlCache.js';
import { getProvider } from './chainRpcService.js';
import { supabase } from '../config/supabaseClient.js';

const QUERY_URL = process.env.GRAPH_QUERY_URL || '';
const API_KEY = process.env.GRAPH_API_KEY || '';
const DEPLOYMENT_ID = process.env.GRAPH_DEPLOYMENT_ID || '';
const NETWORK = process.env.GRAPH_NETWORK || 'Arc Testnet';

// A snapshot is fresh for 15s: kills the N+1 burst when analyzing many
// providers while keeping post-settlement verification effectively live.
const SNAPSHOT_TTL_MS = 15_000;
// Bounded pagination: never trust a truncated snapshot silently.
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
// A subgraph within this many blocks of the live Arc head is considered synced.
const SYNC_LAG_TOLERANCE = 10;

export class GraphUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphUnavailableError';
    this.status = 503;
    this.code = 'GRAPH_UNAVAILABLE';
  }
}

const ensureConfigured = () => {
  if (!QUERY_URL || !API_KEY || !DEPLOYMENT_ID) {
    throw new GraphUnavailableError('The Graph deployment is not configured.');
  }
};

const graphQuery = async (query, variables = {}) => {
  ensureConfigured();
  let response;
  try {
    response = await fetch(QUERY_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ query, variables })
    });
  } catch (err) {
    throw new GraphUnavailableError(`The Graph request failed: ${err.message}`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors) {
    throw new GraphUnavailableError(body.errors?.[0]?.message || `The Graph request failed (${response.status})`);
  }
  return body.data || {};
};

const PAYMENT_FIELDS = `
  id transactionHash blockNumber timestamp payer payee amount paymentType
  status releaseTime invoiceReference { id reference }
`;

/** Paginated snapshot — never silently truncated at 1,000 rows. */
const loadGraphSnapshotRaw = async () => {
  const payments = [];
  let lastId = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const isFirst = lastId == null;
    const data = await graphQuery(
      isFirst
        ? `query GlobalPaySnapshot($first: Int!) {
            _meta { block { number hash timestamp } deployment }
            payments(first: $first, orderBy: id, orderDirection: asc) {
              ${PAYMENT_FIELDS}
            }
          }`
        : `query GlobalPaySnapshot($first: Int!, $lastId: Bytes!) {
            _meta { block { number hash timestamp } deployment }
            payments(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
              ${PAYMENT_FIELDS}
            }
          }`,
      isFirst ? { first: PAGE_SIZE } : { first: PAGE_SIZE, lastId }
    );
    const batch = data.payments || [];
    payments.push(...batch);
    if (batch.length < PAGE_SIZE) {
      return { meta: data._meta, payments };
    }
    lastId = batch[batch.length - 1].id;
  }
  logger.warn('[GRAPH] Snapshot pagination hit MAX_PAGES; results are bounded.');
  return { meta: null, payments };
};

const loadSettlementsAndInvoices = async () => {
  const data = await graphQuery(`
    query GlobalPaySideTables($first: Int!) {
      settlements(first: $first, orderBy: timestamp, orderDirection: desc) {
        id transactionHash blockNumber timestamp payer payee amount status settledAt
        payment { id }
      }
      invoiceReferences(first: $first, orderBy: timestamp, orderDirection: desc) {
        id reference transactionHash blockNumber timestamp payment { id }
      }
    }
  `, { first: PAGE_SIZE });
  return {
    settlements: data.settlements || [],
    invoiceReferences: data.invoiceReferences || []
  };
};

const amount = (value) => {
  const parsed = Number(value || 0) / 1e18;
  return Number.isFinite(parsed) ? parsed : 0;
};

const providerAddress = (providerId) => String(providerId || '').toLowerCase();

/** Resolve agent codes / EIP-55 addresses to lowercase Graph payee wallets. */
const resolveProviderIdentifiers = async (providerIds) => {
  const ids = (providerIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  const wallets = ids.filter((id) => /^0x[0-9a-fA-F]{40}$/.test(id)).map(providerAddress);
  const unresolved = ids.filter((id) => !/^0x[0-9a-fA-F]{40}$/.test(id));
  if (unresolved.length) {
    try {
      const { data } = await supabase
        .from('ai_agents')
        .select('agent_id, wallet_address')
        .in('agent_id', unresolved);
      for (const row of data || []) {
        if (row.wallet_address) wallets.push(providerAddress(row.wallet_address));
      }
    } catch (err) {
      // Identifier resolution must never fabricate intelligence: unresolved
      // identifiers simply match zero Graph payments.
      logger.warn('[GRAPH] agent identifier resolution skipped:', err.message);
    }
  }
  return Array.from(new Set(wallets));
};

const DAY = 86_400_000;
const nowMs = () => Date.now();

/**
 * Rich provider intelligence — every field derived only from indexed payments.
 * Includes the fraud signals the Trust Engine reasons over.
 */
const providerIntelligence = (payee, payments, humanBacked = false) => {
  const rows = payments
    .filter((payment) => String(payment.payee || '').toLowerCase() === payee)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  const total = rows.length;
  const successfulRows = rows.filter((payment) => ['HELD', 'RELEASED'].includes(String(payment.status).toUpperCase()));
  const releasedRows = rows.filter((payment) => String(payment.status).toUpperCase() === 'RELEASED');
  const failedRows = rows.filter((payment) => String(payment.status).toUpperCase() === 'CANCELLED');
  const amounts = successfulRows.map((payment) => amount(payment.amount));
  const timestamps = rows.map((payment) => Number(payment.timestamp || 0)).filter(Boolean);
  const lastTimestamp = timestamps.length ? Math.max(...timestamps) : 0;
  const payers = rows.map((payment) => String(payment.payer || '').toLowerCase()).filter(Boolean);
  const uniquePayerSet = new Set(payers);
  const payerCounts = new Map();
  for (const payer of payers) payerCounts.set(payer, (payerCounts.get(payer) || 0) + 1);
  const repeatPayers = Array.from(payerCounts.values()).filter((count) => count > 1).length;
  const selfPayments = rows.filter((payment) => String(payment.payer || '').toLowerCase() === payee).length;

  const window = (ms) => rows.filter((payment) => nowMs() - Number(payment.timestamp || 0) * 1000 < ms).length;
  const last7 = window(7 * DAY);
  const prev7 = rows.filter((payment) => {
    const age = nowMs() - Number(payment.timestamp || 0) * 1000;
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;
  const last30 = window(30 * DAY);
  const last24 = window(DAY);

  const successRate = total ? successfulRows.length / total : 0;
  const sortedAmounts = [...amounts].sort((a, b) => a - b);
  const medianPayment = sortedAmounts.length
    ? (sortedAmounts.length % 2
      ? sortedAmounts[(sortedAmounts.length - 1) / 2]
      : (sortedAmounts[sortedAmounts.length / 2 - 1] + sortedAmounts[sortedAmounts.length / 2]) / 2)
    : 0;
  const volume = amounts.reduce((sum, value) => sum + value, 0);
  const secondsSinceLast = lastTimestamp ? Math.round((nowMs() - lastTimestamp * 1000) / 1000) : null;
  const gaps = [];
  for (let i = 1; i < timestamps.length; i += 1) gaps.push(timestamps[i] - timestamps[i - 1]);
  const avgSecondsBetween = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;

  let cancellationStreak = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (String(rows[i].status).toUpperCase() === 'CANCELLED') cancellationStreak += 1;
    else break;
  }

  const weeklyVolume = (ms) => rows
    .filter((payment) => nowMs() - Number(payment.timestamp || 0) * 1000 < ms)
    .reduce((sum, payment) => sum + amount(payment.amount), 0);
  const last7Volume = weeklyVolume(7 * DAY);
  const prior28WeeklyAvg = weeklyVolume(35 * DAY) / 4;
  const volumeSpike = prior28WeeklyAvg > 0 && last7Volume > prior28WeeklyAvg * 5 && last7Volume > 0;

  let trend = 'dormant';
  if (last7 > 0 && prev7 === 0) trend = 'accelerating';
  else if (last7 > prev7) trend = 'accelerating';
  else if (last7 === prev7 && last7 > 0) trend = 'steady';
  else if (last7 < prev7) trend = 'slowing';

  // ---------- Fraud / risk flags (Graph evidence only) ----------
  const riskFlags = [];
  if (selfPayments > 0) riskFlags.push({ code: 'self_payment', detail: `${selfPayments} payment(s) where payer == payee (possible wash trading).` });
  if (cancellationStreak >= 2) riskFlags.push({ code: 'cancellation_streak', detail: `${cancellationStreak} most-recent payments were CANCELLED.` });
  if (volumeSpike) riskFlags.push({ code: 'unusual_volume_spike', detail: `Last-7d volume is >5x the prior 28-day weekly average.` });
  if (total >= 2 && failedRows.length > successfulRows.length) riskFlags.push({ code: 'failure_dominant', detail: `More cancelled than successful payments (${failedRows.length} vs ${successfulRows.length}).` });
  if (secondsSinceLast != null && secondsSinceLast > 30 * 86400) riskFlags.push({ code: 'no_recent_activity', detail: 'No settlement in over 30 days.' });
  if (total < 3) riskFlags.push({ code: 'new_provider', detail: 'Fewer than 3 indexed payments — limited evidence.' });

  // ---------- Transparent trust score (0-100) ----------
  // Trust is primarily derived from The Graph settlement history.
  // World + AgentBook verification acts as a trust floor: a verified
  // human-backed provider starts at 25/100 (not zero), giving buyers
  // a meaningful signal even before their first settlement is indexed.
  // Verified publishers also receive a +5 bonus on any existing Graph
  // trust, reflecting the reduced counterparty risk of human-backed
  // agents. The floor is NOT a multiplier and does not scale.
  let trust = 0;
  trust += successRate * 40;                                            // reliability
  trust += Math.min(1, uniquePayerSet.size / 10) * 15;                  // customer diversity
  trust += Math.min(1, successfulRows.length / 25) * 15;                // track record
  trust += (secondsSinceLast != null && secondsSinceLast < 86400) ? 15
    : (secondsSinceLast != null && secondsSinceLast < 7 * 86400) ? 10
      : (secondsSinceLast != null && secondsSinceLast < 30 * 86400) ? 5 : 0; // recency
  trust += Math.min(1, last30 / 5) * 15;                                // consistency
  trust -= Math.min(25, selfPayments * 10);
  if (cancellationStreak >= 2) trust -= 15;
  if (volumeSpike) trust -= 10;
  if (total >= 2 && failedRows.length > successfulRows.length) trust -= 20;
  let trustScore = Math.max(0, Math.min(100, Math.round(trust)));

  // Identity-based trust adjustment (after Graph calculation)
  if (humanBacked && trustScore < 25) trustScore = 25;
  else if (humanBacked && trustScore > 0) trustScore = Math.min(100, trustScore + 5);

  const confidence = humanBacked && total === 0
    ? 0.15
    : Math.min(1, Number(((successfulRows.length + failedRows.length) / 20).toFixed(2)));
  const riskLevel = riskFlags.some((f) => ['self_payment', 'cancellation_streak', 'failure_dominant'].includes(f.code)) ? 'high'
    : riskFlags.length ? 'medium' : 'low';

  // ---------- Evidence-backed reasoning bullets ----------
  const reasoning = [];
  if (humanBacked) {
    reasoning.push(total === 0
      ? 'Verified human publisher (World ID + AgentBook): trust floor applied — no settlement history yet'
      : 'Verified human publisher (World ID + AgentBook): +5 trust bonus applied');
  }
  reasoning.push(`${successfulRows.length} successful settlement(s) of ${total} indexed payment(s) — ${(successRate * 100).toFixed(1)}% success rate`);
  reasoning.push(`${volume.toFixed(4)} USDC total settlement volume (avg ${amounts.length ? (volume / amounts.length).toFixed(4) : '0'} / median ${medianPayment.toFixed(4)} USDC)`);
  reasoning.push(`${uniquePayerSet.size} unique buyer(s)${repeatPayers ? `, ${repeatPayers} repeat buyer(s)` : ''}`);
  if (lastTimestamp) reasoning.push(`Last settlement ${secondsSinceLast < 86400 ? `${Math.round(secondsSinceLast / 3600)}h` : `${Math.round(secondsSinceLast / 86400)}d`} ago; ${last7} payment(s) in the last 7 days (${trend})`);
  else reasoning.push('No indexed settlements');
  if (avgSecondsBetween != null) reasoning.push(`Average interval between payments: ${avgSecondsBetween < 86400 ? `${Math.round(avgSecondsBetween / 3600)}h` : `${Math.round(avgSecondsBetween / 86400)}d`}`);
  for (const flag of riskFlags) reasoning.push(`⚠ ${flag.code}: ${flag.detail}`);

  return {
    providerId: payee,
    humanBacked,
    paymentCount: total,
    successfulPayments: successfulRows.length,
    releasedPayments: releasedRows.length,
    failedPayments: failedRows.length,
    successRate: Number(successRate.toFixed(4)),
    settlementVolume: volume,
    averagePayment: amounts.length ? volume / amounts.length : 0,
    medianPayment,
    largestPayment: amounts.length ? Math.max(...amounts) : 0,
    uniquePayers: uniquePayerSet.size,
    repeatCustomers: repeatPayers,
    selfPayments,
    paymentsLast24h: last24,
    paymentsLast7d: last7,
    paymentsLast30d: last30,
    activityTrend: trend,
    settlementVelocityPerWeek: Number((last30 / 4.345).toFixed(2)),
    avgSecondsBetweenPayments: avgSecondsBetween,
    lastSettlement: lastTimestamp ? new Date(lastTimestamp * 1000).toISOString() : null,
    secondsSinceLastSettlement: secondsSinceLast,
    recentActivity: Boolean(lastTimestamp && nowMs() - lastTimestamp * 1000 < 7 * DAY),
    trustScore,
    confidence,
    riskLevel,
    riskFlags,
    reasoning,
    source: 'The Graph',
    graphLive: true,
    // Recent raw rows (auditable evidence) + settlement view for the console.
    payments: rows.slice(-50).reverse(),
    settlements: successfulRows.slice(-20).reverse().map((payment) => ({
      id: payment.id,
      transactionHash: payment.transactionHash,
      timestamp: payment.timestamp,
      amount: amount(payment.amount),
      status: payment.status
    }))
  };
};

export const isGraphConfigured = () => Boolean(QUERY_URL && API_KEY && DEPLOYMENT_ID);

export const clearGraphSnapshotCache = () => cache.delete('graph:snapshot');

export const loadGraphSnapshot = async ({ fresh = false } = {}) => {
  if (fresh) clearGraphSnapshotCache();
  return cache.getOrCompute('graph:snapshot', loadGraphSnapshotRaw, SNAPSHOT_TTL_MS);
};

export const getGraphStatus = async () => {
  const snapshot = await loadGraphSnapshot();
  const { settlements, invoiceReferences } = await loadSettlementsAndInvoices();
  // Real sync status: compare the indexed block against the live Arc head.
  let headBlock = null;
  try {
    headBlock = await getProvider().getBlockNumber();
  } catch (err) {
    logger.warn('[GRAPH] head block unavailable for sync check:', err.message);
  }
  const indexedBlock = snapshot.meta?.block?.number ? Number(snapshot.meta.block.number) : null;
  const lagBlocks = headBlock != null && indexedBlock != null ? headBlock - indexedBlock : null;
  return {
    provider: 'The Graph',
    deploymentId: snapshot.meta?.deployment || DEPLOYMENT_ID,
    queryUrl: QUERY_URL,
    indexedBlock,
    headBlock,
    lagBlocks,
    syncing: lagBlocks == null ? null : lagBlocks > SYNC_LAG_TOLERANCE,
    paymentCount: snapshot.payments.length,
    settlementCount: settlements.length,
    invoiceReferenceCount: invoiceReferences.length,
    graphLive: true,
    live: true,
    network: NETWORK
  };
};

export const analyzeProvider = async (providerId) => {
  const snapshot = await loadGraphSnapshot();
  const addr = providerAddress(providerId);
  // Look up human_backed from DB
  let humanBacked = false;
  try {
    const { data } = await supabase
      .from('ai_agents')
      .select('human_backed')
      .eq('wallet_address', addr)
      .maybeSingle();
    humanBacked = data?.human_backed || false;
  } catch { /* fall through */ }
  return providerIntelligence(addr, snapshot.payments, humanBacked);
};

export const analyzeProviders = async ({ providerIds = [] } = {}) => {
  const snapshot = await loadGraphSnapshot();
  const payees = providerIds.length
    ? await resolveProviderIdentifiers(providerIds)
    : Array.from(new Set(snapshot.payments.map((payment) => String(payment.payee || '').toLowerCase()).filter(Boolean)));

  // Bulk lookup human_backed for all payees
  const humanBackedMap = new Map();
  try {
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('wallet_address, human_backed')
      .in('wallet_address', payees);
    for (const row of agents || []) {
      humanBackedMap.set(String(row.wallet_address || '').toLowerCase(), row.human_backed || false);
    }
  } catch { /* fall through — treat all as unverified */ }

  return payees
    .map((payee) => providerIntelligence(payee, snapshot.payments, humanBackedMap.get(payee) || false))
    .sort((a, b) => (b.trustScore - a.trustScore) || (b.settlementVolume - a.settlementVolume));
};

export const verifySettlement = async (txHash) => {
  if (!txHash) throw new GraphUnavailableError('Cannot verify settlement without a transaction hash.');
  const data = await graphQuery(`
    query Settlement($hash: Bytes!) {
      payments(first: 1, where: { transactionHash: $hash }) {
        ${PAYMENT_FIELDS}
      }
    }
  `, { hash: String(txHash).toLowerCase() });
  return {
    verified: Boolean(data.payments?.length),
    settlement: data.payments?.[0] || null,
    source: 'The Graph'
  };
};

export const getPaymentEntity = async (paymentId) => {
  const data = await graphQuery(`
    query Payment($id: Bytes!) {
      payment(id: $id) { id transactionHash blockNumber timestamp payer payee amount paymentType status releaseTime }
    }
  `, { id: String(paymentId).toLowerCase() });
  return data.payment || null;
};

// ==================== Natural-language Trust Engine ====================

const rankLine = (provider, index) =>
  `${index + 1}. ${provider.providerId} — trust ${provider.trustScore}/100, ${provider.successfulPayments}/${provider.paymentCount} successful, ${provider.settlementVolume.toFixed(4)} USDC volume, ${provider.uniquePayers} buyer(s), risk ${provider.riskLevel}`;

/**
 * Answer a natural-language question using ONLY Graph-derived intelligence.
 * Supported intents: safest/best, earnings/volume, success-rate thresholds,
 * fraud/risk inspection, recency, and a default ranked overview.
 */
export const askTrustEngine = async (question, providerIds) => {
  const providers = await analyzeProviders({ providerIds });
  const q = String(question || '').toLowerCase();
  const top = providers[0] || null;

  const intent =
    /(fraud|suspicious|wash|self.pay|risk)/.test(q) ? 'risk_audit'
      : /(earn|revenue|volume|most usdc|made)/.test(q) ? 'earnings'
        : /(success rate|reliable|reliability|above \d+)/.test(q) ? 'reliability'
          : /(recent|active|activity|latest)/.test(q) ? 'recency'
            : /(safest|best|recommend|trust|choose|who should)/.test(q) || providers.length ? 'safety' : 'overview';

  let answer;
  if (!providers.length) {
    answer = 'No provider has indexed settlement history on The Graph yet, so no trust recommendation can be made. The Trust Engine refuses to rank providers without verifiable on-chain evidence.';
  } else if (intent === 'risk_audit') {
    const flagged = providers.filter((provider) => provider.riskFlags.length);
    answer = flagged.length
      ? `Risk audit (Graph evidence only):\n${flagged.map((provider) => `• ${provider.providerId}: ${provider.riskFlags.map((flag) => flag.detail).join(' ')}`).join('\n')}`
      : `No fraud signals found across ${providers.length} provider(s): no self-payments, no cancellation streaks, no volume spikes.`;
  } else if (intent === 'earnings') {
    const ranked = [...providers].sort((a, b) => b.settlementVolume - a.settlementVolume);
    answer = `Top earner: ${ranked[0].providerId} with ${ranked[0].settlementVolume.toFixed(4)} USDC across ${ranked[0].successfulPayments} successful settlement(s) from ${ranked[0].uniquePayers} unique buyer(s).\n\n${ranked.slice(0, 5).map(rankLine).join('\n')}`;
  } else if (intent === 'reliability') {
    const thresholdMatch = q.match(/above (\d+(?:\.\d+)?)\s*%?/);
    const threshold = thresholdMatch ? Number(thresholdMatch[1]) / 100 : null;
    const ranked = [...providers].sort((a, b) => b.successRate - a.successRate);
    const qualifying = threshold ? ranked.filter((provider) => provider.successRate >= threshold) : ranked;
    answer = threshold
      ? (qualifying.length
        ? `${qualifying.length} provider(s) exceed a ${(threshold * 100).toFixed(0)}% success rate:\n${qualifying.map(rankLine).join('\n')}`
        : `No provider exceeds a ${(threshold * 100).toFixed(0)}% success rate. Best available: ${ranked[0].providerId} at ${(ranked[0].successRate * 100).toFixed(1)}%.`)
      : `Most reliable provider: ${ranked[0].providerId} — ${(ranked[0].successRate * 100).toFixed(1)}% success rate over ${ranked[0].paymentCount} indexed payment(s).`;
  } else if (intent === 'recency') {
    const ranked = [...providers].sort((a, b) => (b.lastSettlement ? Date.parse(b.lastSettlement) : 0) - (a.lastSettlement ? Date.parse(a.lastSettlement) : 0));
    answer = `Most recently active: ${ranked[0].providerId}, last settled ${ranked[0].lastSettlement ? new Date(ranked[0].lastSettlement).toLocaleString() : 'never'} (${ranked[0].paymentsLast7d} payment(s) in the last 7 days, trend ${ranked[0].activityTrend}).`;
  } else {
    answer = top
      ? `I selected ${top.providerId} because The Graph shows:\n${top.reasoning.map((line) => `• ${line}`).join('\n')}\n\nConfidence ${(top.confidence * 100).toFixed(0)}% · Trust ${top.trustScore}/100\n\nAll candidates:\n${providers.slice(0, 5).map(rankLine).join('\n')}`
      : 'No providers to rank.';
  }

  return {
    question,
    intent,
    answer,
    recommendation: top,
    providers,
    source: 'The Graph',
    graphLive: true
  };
};
