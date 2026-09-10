/**
 * DeveloperService — platform aggregations for the Developer Platform UI.
 *
 * All metrics are computed from real database rows (agents, transactions,
 * usage logs, invoices, subscriptions). When no data exists the metrics are
 * zero/empty — never fabricated.
 *
 * Every entry point assumes tables are provisioned (the /status endpoint
 * gates the UI); requireTables() still guards partial-migration states.
 */

import { supabase } from '../config/supabaseClient.js';
import { requireTables, throwMissingTable } from '../repositories/platformRepository.js';
import { getPool } from '../utils/db.js';
import {
  getPlan,
  PLAN_CATALOG,
  REVENUE_ATTRIBUTION,
  AGENT_RATE_LIMIT_PER_MIN
} from '../config/config.js';
import { getSettings } from './settingsService.js';
import { audit } from './auditService.js';
import { ethers } from 'ethers';
import {
  getAgentBalance as agentServiceBalance,
  agentPay as agentServicePay,
  getAgentHistory as agentServiceHistory,
  getAgentStats as agentServiceStats,
  regenerateAgentApiKey as agentServiceRotateKey
} from './agentService.js';
import { getUserVerificationStatus } from './worldIdVerifyService.js';

// ==================== Range / bucket helpers ====================

const DAY_MS = 86400000;

const buildBuckets = (range) => {
  const now = new Date();
  const buckets = [];

  if (range === 'day') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let i = 0; i < 24; i += 1) {
      const s = new Date(start.getTime() + i * 3600000);
      buckets.push({ label: s.toISOString().slice(11, 16), start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString() });
    }
  } else if (range === 'week') {
    for (let i = 6; i >= 0; i -= 1) {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({ label: s.toISOString().slice(0, 10), start: s.toISOString(), end: new Date(s.getTime() + DAY_MS).toISOString() });
    }
  } else if (range === 'year') {
    for (let i = 11; i >= 0; i -= 1) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      buckets.push({ label: s.toISOString().slice(0, 7), start: s.toISOString(), end: e.toISOString() });
    }
  } else {
    for (let i = 29; i >= 0; i -= 1) {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({ label: s.toISOString().slice(0, 10), start: s.toISOString(), end: new Date(s.getTime() + DAY_MS).toISOString() });
    }
  }
  return buckets;
};

const bucketIndex = (ts, buckets) => {
  const iso = new Date(ts).toISOString();
  for (let i = 0; i < buckets.length; i += 1) {
    if (iso >= buckets[i].start && iso < buckets[i].end) return i;
  }
  return -1;
};

// ==================== Data access ====================

const fetchAgents = async (orgId, developerId) => {
  const { data, error } = await requireTables(() =>
    supabase.from('ai_agents').select('*').eq('organization_id', orgId)
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  if (data && data.length > 0) return data;
  // The gateway intermittently downgrades service-role reads to anon, which
  // RLS-restricts list reads to a silent `[]` — a new workspace and a degraded
  // read are indistinguishable. Confirm on the direct DB connection before
  // reporting an empty agent list.
  try {
    const { rows } = await getPool().query(
      'SELECT * FROM ai_agents WHERE organization_id = $1 ORDER BY created_at DESC',
      [orgId]
    );
    if (rows.length > 0) return rows;
  } catch {
    /* direct read unavailable — keep the gateway result */
  }

  // Strictly org-scoped: only return agents belonging to this organization.
  // Do NOT fall back to developer_id — that would leak other orgs' agents.
  return data || [];
};

const fetchAllAgents = async () => {
  const { data, error } = await requireTables(() => supabase.from('ai_agents').select('*'));
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || [];
};

const fetchTransactions = async (agentIds) => {
  if (!agentIds.length) return [];
  const { data, error } = await requireTables(() =>
    supabase.from('ai_agent_transactions').select('*').in('agent_id', agentIds)
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || [];
};

const fetchAllTransactions = async () => {
  const { data, error } = await requireTables(() =>
    supabase.from('ai_agent_transactions').select('*')
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || [];
};

const fetchUsageLogs = async (orgId) => {
  let { data, error } = await requireTables(() =>
    supabase.from('api_usage_logs').select('*').eq('organization_id', orgId)
  );
  if (error) throwMissingTable(error);
  if (!error && data && data.length > 0) return data;
  // Direct DB fallback if Supabase gateway degraded
  if (!error && data && data.length === 0) {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT * FROM api_usage_logs WHERE organization_id = $1 ORDER BY created_at DESC',
        [orgId]
      );
      if (rows && rows.length > 0) return rows;
    } catch (_) { /* table may not exist */ }
  }
  return data || [];
};

const fetchAllUsageLogs = async () => {
  const { data, error } = await requireTables(() =>
    supabase.from('api_usage_logs').select('*')
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || [];
};

const fetchInvoices = async (orgId) => {
  const { data, error } = await requireTables(() =>
    supabase.from('invoices').select('*').eq('organization_id', orgId)
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || [];
};

const fetchSubscription = async (orgId) => {
  const { data, error } = await requireTables(() =>
    supabase.from('subscriptions').select('*').eq('organization_id', orgId).maybeSingle()
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || null;
};

const fetchAllSubscriptions = async () => {
  const { data, error } = await requireTables(() => supabase.from('subscriptions').select('*'));
  if (error) throwMissingTable(error);
  if (error) throw error;
  return data || [];
};

const sumWei = (txs, statuses = ['confirmed', 'pending']) => {
  let total = 0n;
  txs
    .filter((t) => statuses.includes(t.status))
    .forEach((t) => {
      try { total += BigInt(t.amount || '0'); } catch { /* ignore malformed */ }
    });
  return total;
};

const formatBOT = (wei) => Number(ethers.formatEther(wei));

// --- V3 fetch helpers (graceful: returns null if tables absent) ---

const safeQuery = async (table, fn) => {
  try {
    const { data, error } = await fn();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
};

// Services are published into `ai_services` (marketplaceService.createService),
// scoped to the org through the owning agent. There is no `published_services`
// table — reading it returned null and the dashboard "Services" stat stayed 0.
const fetchOrgServices = async (orgId) => {
  try {
    const { rows } = await getPool().query(
      `SELECT s.id, s.created_at
         FROM ai_services s
         JOIN ai_agents a ON a.id = s.agent_id
        WHERE a.organization_id = $1 AND s.is_active = true`,
      [orgId]
    );
    return rows;
  } catch {
    return null;
  }
};

const fetchV3Metrics = async (orgId) => {
  const [services, installs, projects, tsRows] = await Promise.all([
    fetchOrgServices(orgId),
    safeQuery('installs', () => supabase.from('marketplace_installs').select('*').eq('developer_id', orgId)),
    safeQuery('projects', () => supabase.from('developer_projects').select('*').eq('organization_id', orgId)),
    safeQuery('trust', () => supabase.from('directory_entities').select('trust_score').eq('organization_id', orgId))
  ]);

  const svc = services || [];
  const ins = installs || [];
  const proj = projects || [];
  const trustScores = (tsRows || []).map((t) => Number(t.trust_score)).filter((n) => !Number.isNaN(n));

  const buckets = buildBuckets('month');

  const servicesOverTime = buckets.map((b, i) => ({
    date: b.label,
    count: svc.filter((s) => bucketIndex(s.created_at, buckets) === i).length
  }));
  let cumulativeServices = 0;
  const cumulativeServicesOverTime = buckets.map((b, i) => {
    cumulativeServices += svc.filter((s) => bucketIndex(s.created_at, buckets) === i).length;
    return { date: b.label, count: cumulativeServices };
  });

  const installsOverTime = buckets.map((b, i) => ({
    date: b.label,
    installs: ins.filter((i) => bucketIndex(i.created_at, buckets) === i).length
  }));

  const avgTrustScore = trustScores.length ? trustScores.reduce((a, b) => a + b, 0) / trustScores.length : 0;

  return {
    servicesPublished: svc.length,
    marketplaceInstalls: ins.length,
    projectsActive: proj.filter((p) => (p.status || 'active') === 'active').length,
    trustScore: avgTrustScore,
    charts: {
      servicesOverTime: cumulativeServicesOverTime,
      installsOverTime
    }
  };
};

// ==================== Dashboard ====================

export const getDashboard = async (orgId, developerId) => {
  const agents = await fetchAgents(orgId, developerId);
  const [logs, txs, settings, subscription, invoices, v3metrics] = await Promise.all([
    fetchUsageLogs(orgId),
    fetchTransactions(agents.map((a) => a.id)),
    getSettings(developerId).catch(() => null),
    fetchSubscription(orgId).catch(() => null),
    fetchInvoices(orgId).catch(() => []),
    fetchV3Metrics(orgId).catch(() => null)
  ]);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const activeAgents = agents.filter((a) => a.status === 'active');
  const successfulPayments = txs.filter((t) => t.status === 'confirmed');
  const volumeBOT = formatBOT(sumWei(txs));

  const buckets = buildBuckets('month');
  const requestsOverTime = buckets.map((b, i) => ({
    date: b.label,
    requests: logs.filter((l) => bucketIndex(l.created_at, buckets) === i).length
  }));
  const volumeOverTime = buckets.map((b, i) => ({
    date: b.label,
    volume: Number(
      txs
        .filter((t) => bucketIndex(t.created_at, buckets) === i && t.status === 'confirmed')
        .reduce((s, t) => s + Number(t.amount || 0) / 1e18, 0)
        .toFixed(6)
    )
  }));

  let cumulativeWallets = 0;
  const walletGrowth = buckets.map((b, i) => {
    cumulativeWallets += agents.filter((a) => bucketIndex(a.created_at, buckets) === i).length;
    return { date: b.label, wallets: cumulativeWallets };
  });

  const activeOverTime = buckets.map((b) => ({
    date: b.label,
    active: agents.filter((a) => a.status === 'active' && new Date(a.created_at) <= new Date(b.end)).length
  }));

  const revenueOverTime = buckets.map((b, i) => ({
    date: b.label,
    revenue: invoices
      .filter((inv) => inv.status === 'paid' && bucketIndex(inv.paid_at || inv.created_at, buckets) === i)
      .reduce((s, inv) => s + (inv.amount_cents || 0) / 100, 0)
  }));

  const plan = getPlan(subscription?.plan || settings?.plan || 'free');
  const monthlyRevenue = subscription ? (plan.priceCents * (subscription.status === 'active' ? 1 : 0)) / 100 : 0;

  return {
    totalAgents: agents.length,
    activeAgents: activeAgents.length,
    walletsCreated: agents.length,
    apiRequestsToday: logs.filter((l) => new Date(l.created_at).getTime() >= startOfDay).length,
    monthlyRequests: logs.filter((l) => new Date(l.created_at).getTime() >= startOfMonth).length,
    successfulPayments: successfulPayments.length,
    failedPayments: txs.filter((t) => t.status === 'failed').length,
    transactionVolumeUSDC: volumeBOT,
    transactionVolumeBOT: volumeBOT, // backward compat
    monthlyRevenueUsd: monthlyRevenue,
     plan: plan.name,
    walletProvider: settings?.walletProvider || 'local',
    verifiedAgents: agents.filter((a) => a.world_verified).length,
    servicesPublished: v3metrics?.servicesPublished ?? 0,
    marketplaceInstalls: v3metrics?.marketplaceInstalls ?? 0,
    trustScore: v3metrics?.trustScore ?? 0,
    projectsActive: v3metrics?.projectsActive ?? 0,
    charts: {
      requestsOverTime,
      volumeOverTime,
      walletGrowth,
      activeOverTime,
      revenue: revenueOverTime,
      servicesOverTime: v3metrics?.charts?.servicesOverTime || [],
      installsOverTime: v3metrics?.charts?.installsOverTime || []
    }
  };
};

// ==================== Analytics ====================

export const getAnalytics = async (orgId, range = 'month', developerId) => {
  const agents = await fetchAgents(orgId, developerId);
  const agentIds = agents.map((a) => a.id);
  const [logs, txs, invoices] = await Promise.all([fetchUsageLogs(orgId), fetchTransactions(agentIds), fetchInvoices(orgId)]);
  const buckets = buildBuckets(range);

  const inRange = (ts) => bucketIndex(ts, buckets) >= 0;

  const inRangeLogs = logs.filter((l) => inRange(l.created_at));
  const inRangeTxs = txs.filter((t) => inRange(t.created_at));

  const success = logs.filter((l) => l.status_code < 400).length;
  const successRate = logs.length ? Math.round((success / logs.length) * 1000) / 10 : 100;
  const errorRate = logs.length ? Math.round((1 - success / logs.length) * 1000) / 10 : 0;
  const avgLatency = logs.length
    ? Math.round((logs.reduce((s, l) => s + (l.duration_ms || 0), 0) / logs.length) * 10) / 10
    : 0;

  const revenueUsd = invoices
    .filter((inv) => inv.status === 'paid' && inRange(inv.paid_at || inv.created_at))
    .reduce((s, inv) => s + (inv.amount_cents || 0) / 100, 0);

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));
  const perAgentLogs = {};
  logs.forEach((l) => {
    if (!l.agent_id) return;
    perAgentLogs[l.agent_id] = (perAgentLogs[l.agent_id] || 0) + 1;
  });
  const mostActiveAgentId = Object.entries(perAgentLogs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostActiveAgent = mostActiveAgentId
    ? agentMap[mostActiveAgentId]?.agent_name || mostActiveAgentId
    : null;

  const recipientVolume = {};
  txs
    .filter((t) => t.status === 'confirmed')
    .forEach((t) => {
      const key = (t.destination_address || '').toLowerCase();
      if (!key) return;
      recipientVolume[key] = (recipientVolume[key] || 0n) + (() => {
        try { return BigInt(t.amount || '0'); } catch { return 0n; }
      })();
    });
  const topCustomers = Object.entries(recipientVolume)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 5)
    .map(([address, wei]) => ({ address, volumeUSDC: formatBOT(wei), volumeBOT: formatBOT(wei) }));

  let cumulativeWallets = 0;
  const chartData = buckets.map((b, i) => {
    cumulativeWallets += agents.filter((a) => bucketIndex(a.created_at, buckets) === i).length;
    const bucketTxs = txs.filter((t) => bucketIndex(t.created_at, buckets) === i);
    const confirmed = bucketTxs.filter((t) => t.status === 'confirmed');
    return {
      date: b.label,
      requests: logs.filter((l) => bucketIndex(l.created_at, buckets) === i).length,
      payments: bucketTxs.length,
      volume: Number(confirmed.reduce((s, t) => s + Number(t.amount || 0) / 1e18, 0).toFixed(6)),
      wallets: cumulativeWallets
    };
  });

  return {
    range,
    apiCalls: inRangeLogs.length,
    totalApiCalls: logs.length,
    avgLatencyMs: avgLatency,
    successRate,
    errorRate,
    botVolumeUSDC: formatBOT(sumWei(inRangeTxs)),
    botVolumeBOT: formatBOT(sumWei(inRangeTxs)), // backward compat
    payments: inRangeTxs.length,
    walletsCreated: agents.length,
    mostActiveAgent,
    revenueUsd,
    topCustomers,
    chart: chartData
  };
};

// ==================== API Usage ====================

export const getUsage = async (orgId, developerId) => {
  const agents = await fetchAgents(orgId, developerId);
  const logs = await fetchUsageLogs(orgId);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const errors = logs.filter((l) => l.status_code >= 400);
  const rate4xx = logs.length ? Math.round((logs.filter((l) => l.status_code >= 400 && l.status_code < 500).length / logs.length) * 1000) / 10 : 0;
  const rate5xx = logs.length ? Math.round((logs.filter((l) => l.status_code >= 500).length / logs.length) * 1000) / 10 : 0;
  const successRate = logs.length ? Math.round((logs.filter((l) => l.status_code < 400).length / logs.length) * 1000) / 10 : 100;

  let remainingRequests = null;
  try {
    const { readQuota } = await import('../middleware/quotaMiddleware.js');
    const quota = await readQuota(orgId, null);
    remainingRequests = quota.limit === null ? null : Math.max(0, quota.limit - quota.used);
  } catch {
    remainingRequests = null;
  }

  const avgLatency = logs.length
    ? Math.round((logs.reduce((s, l) => s + (l.duration_ms || 0), 0) / logs.length) * 10) / 10
    : 0;

  const endpointMap = {};
  logs.forEach((l) => {
    const key = `${l.method} ${l.endpoint}`;
    endpointMap[key] = endpointMap[key] || { count: 0, errors: 0, latency: 0 };
    endpointMap[key].count += 1;
    endpointMap[key].latency += l.duration_ms || 0;
    if (l.status_code >= 400) endpointMap[key].errors += 1;
  });
  const topEndpoints = Object.entries(endpointMap)
    .map(([endpoint, v]) => ({
      endpoint,
      count: v.count,
      errors: v.errors,
      avgLatencyMs: Math.round((v.latency / v.count) * 10) / 10
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a.agent_name]));
  const agentMap2 = {};
  logs.forEach((l) => {
    if (!l.agent_id) return;
    agentMap2[l.agent_id] = (agentMap2[l.agent_id] || 0) + 1;
  });
  const topAgents = Object.entries(agentMap2)
    .map(([id, count]) => ({ agentId: id, name: agentMap[id] || id, requests: count }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  const buckets = buildBuckets('week');
  const trafficGraph = buckets.map((b, i) => ({
    date: b.label,
    requests: logs.filter((l) => bucketIndex(l.created_at, buckets) === i).length
  }));

  const statusBuckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  logs.forEach((l) => {
    const bucket = `${Math.floor(l.status_code / 100)}xx`;
    if (statusBuckets[bucket] !== undefined) statusBuckets[bucket] += 1;
  });

  const errSummary = {};
  logs.filter((l) => l.status_code >= 400).forEach((l) => {
    let msg = null;
    try {
      const parsed = JSON.parse(l.error_message || 'null');
      msg = parsed && parsed.message ? parsed.message : null;
    } catch { /* not JSON */ }
    const label = msg ? `${l.status_code} — ${msg.slice(0, 120)}` : `${l.status_code}`;
    errSummary[label] = (errSummary[label] || 0) + 1;
  });
  const topErrors = Object.entries(errSummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, count]) => ({ error, count }));

  return {
    requestsToday: logs.filter((l) => new Date(l.created_at).getTime() >= startOfDay).length,
    requestsThisMonth: logs.filter((l) => new Date(l.created_at).getTime() >= startOfMonth).length,
    rateLimitPerMin: AGENT_RATE_LIMIT_PER_MIN,
    errors: errors.length,
    errorRate: logs.length ? Math.round((errors.length / logs.length) * 1000) / 10 : 0,
    successRate,
    rate4xx,
    rate5xx,
    avgLatencyMs: avgLatency,
    totalRequests: logs.length,
    remainingRequests,
    statusBuckets,
    topErrors,
    topEndpoints,
    topAgents,
    trafficGraph
  };
};

// ==================== Revenue (platform-wide) ====================

export const getRevenue = async () => {
  const [agents, txs, logs, subs, invoices] = await Promise.all([
    fetchAllAgents(),
    fetchAllTransactions(),
    fetchAllUsageLogs(),
    fetchAllSubscriptions(),
    requireTables(() => supabase.from('invoices').select('*')).then((r) => r.data || [])
  ]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const activeSubs = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
  const mrr = activeSubs.reduce((sum, s) => sum + (getPlan(s.plan).priceCents || 0), 0) / 100;
  const arr = mrr * 12;

  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const monthlyRevenue = paidInvoices
    .filter((i) => new Date(i.paid_at || i.created_at) >= startOfMonth)
    .reduce((s, i) => s + (i.amount_cents || 0), 0) / 100;

  const confirmed = txs.filter((t) => t.status === 'confirmed');
  const volumeByAgent = {};
  confirmed.forEach((t) => {
    if (!t.agent_id) return;
    volumeByAgent[t.agent_id] = (volumeByAgent[t.agent_id] || 0n) + (() => {
      try { return BigInt(t.amount || '0'); } catch { return 0n; }
    })();
  });

  const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));
  const topCustomers = Object.entries(volumeByAgent)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 5)
    .map(([id, wei]) => ({
      agentId: agentById[id]?.agent_id || id,
      name: agentById[id]?.agent_name || 'Unknown agent',
      volumeUSDC: formatBOT(wei),
      volumeBOT: formatBOT(wei), // backward compat
      wallet: agentById[id]?.wallet_address || null
    }));

  const planCounts = {};
  activeSubs.forEach((s) => { planCounts[s.plan] = (planCounts[s.plan] || 0) + 1; });
  const topPlans = Object.entries(planCounts)
    .map(([plan, count]) => ({ plan, count, revenue: count * (getPlan(plan).priceCents || 0) / 100 }))
    .sort((a, b) => b.revenue - a.revenue);

  const developersWithAgents = new Set(agents.map((a) => a.developer_id)).size;
  const payingDevelopers = activeSubs.filter((s) => s.status === 'active').length;
  const conversionRate = developersWithAgents
    ? Math.round((payingDevelopers / developersWithAgents) * 1000) / 10
    : 0;

  const walletsThisMonth = agents.filter((a) => new Date(a.created_at) >= startOfMonth).length;
  const requestsThisMonth = logs.filter((l) => new Date(l.created_at) >= startOfMonth).length;

  return {
    monthlyRevenue,
    mrr,
    arr,
    activeSubscribers: activeSubs.length,
    payingSubscribers: payingDevelopers,
    conversionRate,
    topCustomers,
    topPlans,
    apiUsageRevenue: monthlyRevenue * REVENUE_ATTRIBUTION.apiUsage,
    agentRevenue: monthlyRevenue * REVENUE_ATTRIBUTION.agent,
    walletCreationRevenue: monthlyRevenue * REVENUE_ATTRIBUTION.walletCreation,
    walletsThisMonth,
    requestsThisMonth,
    transactionVolumeUSDC: formatBOT(sumWei(confirmed)),
    transactionVolumeBOT: formatBOT(sumWei(confirmed)) // backward compat
  };
};

// ==================== Billing ====================

export const getBilling = async (orgId, developerId) => {
  const [agents, subscription, invoices, logs] = await Promise.all([
    fetchAgents(orgId, developerId),
    fetchSubscription(orgId),
    fetchInvoices(orgId),
    fetchUsageLogs(orgId)
  ]);

  const plan = getPlan(subscription?.plan || 'free');
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const requestsThisMonth = logs.filter((l) => new Date(l.created_at) >= startOfMonth).length;

  return {
    plans: PLAN_CATALOG.map((p) => ({
      name: p.name,
      priceCents: p.priceCents,
      annualPriceCents: p.annualPriceCents || null,
      period: p.period,
      agentLimit: p.agentLimit,
      requestLimit: p.requestLimit,
      historyDays: p.historyDays || null,
      support: p.support,
      highlights: p.highlights,
      trialDays: p.trialDays || null,
      popular: p.popular || false
    })),
    current: {
      plan: plan.name,
      status: subscription?.status || 'trialing',
      priceCents: subscription?.price_cents ?? plan.priceCents,
      currentPeriodStart: subscription?.current_period_start || null,
      currentPeriodEnd: subscription?.current_period_end || null,
      cancelAt: subscription?.cancel_at || null,
      usage: {
        agents: agents.length,
        agentLimit: plan.agentLimit,
        requests: requestsThisMonth,
        requestLimit: plan.requestLimit
      }
    },
    invoices: invoices
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((i) => ({
        id: i.id,
        plan: i.plan,
        amountCents: i.amount_cents,
        currency: i.currency,
        status: i.status,
        dueDate: i.due_date,
        paidAt: i.paid_at,
        createdAt: i.created_at
      })),
    revenueStats: {
      mrr: (subscription && plan.priceCents) / 100 || 0,
      lifetime: invoices.reduce((s, i) => s + (i.amount_cents || 0), 0) / 100
    }
  };
};

export const setPlan = async (orgId, developerId, { plan }) => {
  const resolved = getPlan(plan);
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // Billing is shared per-organization: collapse any prior rows for this org so
  // there is exactly one subscription document. (developer_id is retained as
  // the actor who last selected the plan.)
  const { data: existing } = await requireTables(() =>
    supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle()
  );

  const payload = {
    organization_id: orgId,
    developer_id: developerId,
    plan: resolved.name,
    status: resolved.priceCents > 0 ? 'trialing' : 'active',
    price_cents: resolved.priceCents,
    current_period_start: existing?.current_period_start || now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    updated_at: now.toISOString()
  };

  const { error } = await requireTables(async () => {
    if (existing) {
      return supabase.from('subscriptions').update(payload).eq('id', existing.id);
    }
    // Remove any stale personal (developer_id-keyed, null org) row for this
    // developer so the unique(developer_id) constraint does not block insert.
    await supabase.from('subscriptions').delete().eq('developer_id', developerId).is('organization_id', null);
    return supabase.from('subscriptions').insert(payload);
  });
  if (error) throwMissingTable(error);
  if (error) throw error;

  await audit({
    developerId,
    organizationId: orgId,
    action: 'billing.subscribed',
    resourceType: 'subscription',
    resourceId: orgId,
    metadata: { plan: resolved.name, status: payload.status }
  });

  return { plan: resolved.name, status: payload.status, priceCents: resolved.priceCents };
};

/**
 * Pay for Pro subscription with USDC from wallet.
 * 
 * Flow:
 * 1. Check user has enough USDC in wallet
 * 2. Send 4.9 USDC to treasury (100% to GlobalPay)
 * 3. Upgrade plan to 'pro'
 * 4. Return success with txHash
 */
/**
 * Pay for Pro subscription with USDC.
 * 
 * Supports two payment methods:
 * 1. Agent Wallet (walletId starts with 'agt_') - Backend sends payment directly
 * 2. External Wallet / MetaMask (walletId starts with 'metamask-') - Verify on-chain
 */
export const paySubscriptionWithBOT = async ({ organizationId, developerId, walletId, txHash: externalTxHash }) => {
  const { ethers } = await import('ethers');
  const { getWalletService } = await import('../wallets/walletService.js');
  const { getTreasuryAddress, getPlan } = await import('../config/config.js');
  
  const PRO_PLAN = getPlan('pro');
  const PRO_PRICE_BOT = PRO_PLAN.priceCents / 100 / 10; // $49 / $10 per USDC = 4.9 USDC
  const PRO_PRICE_WEI = ethers.parseEther(String(PRO_PRICE_BOT));
  
  const walletService = getWalletService();
  const treasuryAddress = await getTreasuryAddress();
  
  if (!treasuryAddress) {
    throw new Error('Treasury wallet not configured. Cannot process payment.');
  }
  
  let txHash;
  
  // === EXTERNAL WALLET (MetaMask) PAYMENT ===
  if (walletId && walletId.startsWith('metamask-')) {
    if (!externalTxHash) {
      throw new Error('Transaction hash required for external wallet payment.');
    }
    
    // Verify the transaction on blockchain
    const { getProvider } = await import('../services/chainRpcService.js');
    const provider = getProvider();
    
    let tx;
    try {
      tx = await provider.getTransaction(externalTxHash);
    } catch (err) {
      throw new Error('Failed to fetch transaction from blockchain.');
    }
    
    if (!tx) {
      throw new Error('Transaction not found on blockchain. It may still be pending.');
    }
    
    // Wait for confirmation
    const receipt = await tx.wait(1, 60000); // Wait 1 confirmation, 60s timeout
    
    if (receipt.status !== 1) {
      throw new Error('Transaction failed on blockchain.');
    }
    
    // Verify sender matches user's connected wallet
    const userAddress = walletId.replace('metamask-', '').toLowerCase();
    if (tx.from.toLowerCase() !== userAddress) {
      throw new Error('Transaction sender does not match your wallet address.');
    }
    
    // Verify recipient is treasury
    if (tx.to.toLowerCase() !== treasuryAddress.toLowerCase()) {
      throw new Error('Transaction recipient is not GlobalPay treasury.');
    }
    
    // Verify amount (allow small gas variance)
    const paidWei = BigInt(tx.value.toString());
    const minExpected = PRO_PRICE_WEI - ethers.parseEther('0.001'); // Allow 0.001 USDC variance
    if (paidWei < minExpected) {
      throw new Error(`Insufficient amount. Sent ${ethers.formatEther(paidWei)} USDC, need ${PRO_PRICE_BOT} USDC.`);
    }
    
    txHash = externalTxHash;
    logger.info(`[BILLING] MetaMask payment verified: ${PRO_PRICE_BOT} USDC from ${tx.from}`);
    
  // === AGENT WALLET PAYMENT ===
  } else {
    // 1. Check wallet balance
    let balance;
    try {
      balance = await walletService.getBalance(walletId);
    } catch (err) {
      throw new Error(`Failed to check wallet balance: ${err.message}`);
    }
    
    const balanceWei = BigInt(balance.wei || '0');
    if (balanceWei < PRO_PRICE_WEI) {
      throw new Error(`Insufficient balance. Need ${PRO_PRICE_BOT} USDC, have ${ethers.formatEther(balanceWei)} USDC.`);
    }
    
    // 2. Send payment to treasury (100% to GlobalPay)
    try {
      const result = await walletService.sendPayment({
        walletId,
        to: treasuryAddress,
        wei: PRO_PRICE_WEI.toString(),
        idempotencyKey: `sub-pro:${organizationId}:${Date.now()}`
      });
      txHash = result.txHash;
    } catch (err) {
      throw new Error(`Payment failed: ${err.message}`);
    }
  }
  
  // 3. Upgrade plan
  const result = await setPlan(organizationId, developerId, { plan: 'pro' });
  
  // 4. Audit log
  await audit({
    developerId,
    organizationId,
    action: 'billing.paid',
    resourceType: 'subscription',
    resourceId: organizationId,
    metadata: { plan: 'pro', amountBOT: PRO_PRICE_BOT, txHash, paymentMethod: walletId.startsWith('metamask-') ? 'metamask' : 'agent' }
  }).catch(() => {});
  
  return {
    success: true,
    plan: 'pro',
    amountBOT: PRO_PRICE_BOT,
    txHash,
    message: `✅ Pro plan activated! Paid ${PRO_PRICE_BOT} USDC. Valid for 30 days.`
  };
};

// ==================== Agents (management view) ====================

export const listAgentsWithStats = async (orgId, developerId, { search, status, page = 1, perPage = 10 } = {}) => {
  // Keep older agents aligned with the developer-level verification source of
  // truth. This also repairs agents created before verification inheritance
  // was added without claiming AgentBook registration.
  const verification = developerId
    ? await getUserVerificationStatus(developerId).catch(() => ({ verified: false }))
    : { verified: false };
  if (verification.verified) {
    await supabase
      .from('ai_agents')
      .update({
        world_verified: true,
        human_backed: true,
        verification_method: 'worldid_v4',
        world_verified_at: verification.verifiedAt || new Date().toISOString()
      })
      .eq('organization_id', orgId)
      .eq('developer_id', developerId);
  }
  const agents = await fetchAgents(orgId, developerId);
  const [txs, logs] = await Promise.all([
    fetchTransactions(agents.map((a) => a.id)),
    fetchUsageLogs(orgId)
  ]);

  const txByAgent = {};
  txs.forEach((t) => {
    txByAgent[t.agent_id] = txByAgent[t.agent_id] || [];
    txByAgent[t.agent_id].push(t);
  });
  const logByAgent = {};
  logs.forEach((l) => {
    if (!l.agent_id) return;
    logByAgent[l.agent_id] = logByAgent[l.agent_id] || [];
    logByAgent[l.agent_id].push(l);
  });

  let rows = agents.map((a) => {
    const agentTxs = txByAgent[a.id] || [];
    const agentLogs = logByAgent[a.id] || [];
    const confirmed = agentTxs.filter((t) => t.status === 'confirmed');
    const lastActivity = [agentTxs, agentLogs]
      .flat()
      .map((r) => new Date(r.created_at).getTime())
      .filter(Boolean)
      .sort((x, y) => y - x)[0];

    return {
      agentId: a.agent_id,
      name: a.agent_name,
      description: a.description,
      wallet: a.wallet_address,
      walletId: a.wallet_id,
      chainId: a.chain_id != null ? Number(a.chain_id) : null,
      apiKeyPrefix: a.api_key_prefix,
      balance: a.balance,
      status: a.status,
      provider: a.wallet_provider,
      developerId: a.developer_id,
      createdAt: a.created_at,
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
      requestCount: agentLogs.length,
      paymentCount: agentTxs.length,
      volumeUSDC: Number(confirmed.reduce((s, t) => s + Number(t.amount || 0) / 1e18, 0).toFixed(6)),
      volumeBOT: Number(confirmed.reduce((s, t) => s + Number(t.amount || 0) / 1e18, 0).toFixed(6)) // backward compat
    };
  });

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.wallet || '').toLowerCase().includes(q)
    );
  }
  if (status) rows = rows.filter((a) => a.status === status);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;

  return {
    total,
    page: safePage,
    perPage,
    totalPages,
    agents: rows.slice(start, start + perPage)
  };
};

// ==================== Delete agent ====================

export const deleteAgent = async (orgId, developerId, agentId) => {
  let agent = null;
  {
    const result = await requireTables(() =>
      supabase.from('ai_agents').select('id').eq('agent_id', agentId).eq('organization_id', orgId).maybeSingle()
    );
    if (result.error) throwMissingTable(result.error);
    agent = result.data;
  }

  // Direct DB fallback when Supabase gateway degrades to anon (RLS filters all rows)
  if (!agent) {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id FROM ai_agents WHERE agent_id = $1 AND organization_id = $2 LIMIT 1`,
        [agentId, orgId]
      );
      if (rows.length > 0) agent = rows[0];
    } catch (_) { /* fall through */ }
  }
  if (!agent) throw Object.assign(new Error('Agent not found.'), { status: 404 });

  // Delete related records that reference this agent (foreign keys without CASCADE)
  try {
    const pool = getPool();
    await pool.query(`DELETE FROM service_invoices WHERE consumer_agent_id = $1 OR provider_agent_id = $1`, [agent.id]);
  } catch (_) { /* table may not exist or no rows */ }
  try {
    await supabase.from('service_invoices').delete().or(`consumer_agent_id.eq.${agent.id},provider_agent_id.eq.${agent.id}`);
  } catch (_) { /* ignore */ }

  // Try Supabase delete first, fall back to direct DB
  const { error } = await supabase.from('ai_agents').delete().eq('id', agent.id);
  if (error) {
    try {
      const pool = getPool();
      await pool.query(`DELETE FROM ai_agents WHERE id = $1`, [agent.id]);
    } catch (delErr) { throw delErr; }
  }
  await audit({
    developerId,
    organizationId: orgId,
    action: 'agent.deleted',
    resourceType: 'ai_agent',
    resourceId: agentId
  });
  return { deleted: true };
};

// ==================== Suspend / resume ====================

const setAgentStatus = async (orgId, developerId, agentId, status) => {
  const agent = await getOwnedAgent(orgId, agentId);
  const { error } = await supabase
    .from('ai_agents')
    .update({
      status,
      suspended_at: status === 'suspended' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', agent.id);
  if (error) throw error;
  await audit({
    developerId,
    organizationId: orgId,
    action: status === 'suspended' ? 'agent.suspended' : 'agent.resumed',
    resourceType: 'ai_agent',
    resourceId: agentId
  });
  return { agentId, status };
};

export const suspendAgent = (orgId, developerId, agentId) => setAgentStatus(orgId, developerId, agentId, 'suspended');
export const resumeAgent = (orgId, developerId, agentId) => setAgentStatus(orgId, developerId, agentId, 'active');

// ==================== Developer-scoped agent operations ====================
// The platform UI manages agents via the developer context — it never needs
// the agent's secret API key. These proxies authorize by developer ownership
// and delegate the heavy lifting to agentService.

export const getOwnedAgent = async (orgId, agentId) => {
  const { data, error } = await requireTables(() =>
    supabase.from('ai_agents').select('*').eq('agent_id', agentId).eq('organization_id', orgId).maybeSingle()
  );
  if (error) throwMissingTable(error);
  if (data) return data;
  // The gateway intermittently downgrades service-role reads to anon, and RLS
  // then hides the row (200 / null) — indistinguishable from a real miss.
  // Confirm on the direct DB connection before answering 404, matching the
  // fallback already used by fetchAgents/deleteAgent.
  try {
    const { rows } = await getPool().query(
      'SELECT * FROM ai_agents WHERE agent_id = $1 AND organization_id = $2 LIMIT 1',
      [agentId, orgId]
    );
    if (rows.length > 0) return rows[0];
  } catch {
    /* direct read unavailable — keep the gateway result */
  }
  throw Object.assign(new Error('Agent not found.'), { status: 404 });
};

export const getAgentDetail = async (orgId, developerId, agentId) => {
  const agent = await getOwnedAgent(orgId, agentId);
  const [stats, logs, history] = await Promise.all([
    agentServiceStats(agent),
    fetchUsageLogs(orgId),
    agentServiceHistory(agent, 1)
  ]);
  const agentLogs = logs.filter((l) => l.agent_id === agent.id);
  const activityTs = [
    ...history.map((t) => new Date(t.createdAt).getTime()),
    ...agentLogs.map((l) => new Date(l.created_at).getTime())
  ].filter(Boolean).sort((x, y) => y - x);

  return {
    agentId: agent.agent_id,
    name: agent.agent_name,
    description: agent.description,
    wallet: agent.wallet_address,
    walletId: agent.wallet_id,
    chainId: agent.chain_id != null ? Number(agent.chain_id) : null,
    apiKeyPrefix: agent.api_key_prefix,
    balance: agent.balance,
    status: agent.status,
    provider: agent.wallet_provider,
    developerId: agent.developer_id,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
    requestCount: agentLogs.length,
    lastActivity: activityTs.length ? new Date(activityTs[0]).toISOString() : null,
    ...stats
  };
};

export const agentBalance = async (orgId, agentId) =>
  agentServiceBalance(await getOwnedAgent(orgId, agentId));

export const agentPay = async (orgId, developerId, agentId, body) =>
  agentServicePay(await getOwnedAgent(orgId, agentId), body);

export const agentHistory = async (orgId, agentId, opts = {}) =>
  agentServiceHistory(await getOwnedAgent(orgId, agentId), opts);

export const agentStats = async (orgId, agentId) =>
  agentServiceStats(await getOwnedAgent(orgId, agentId));

export const agentRotateKey = async (orgId, agentId) =>
  agentServiceRotateKey(await getOwnedAgent(orgId, agentId));

// ==================== Request logs ====================

export const listRequestLogs = async (orgId, { page = 1, perPage = 20, statusCode, method, endpoint, developer, source, dateFrom, dateTo } = {}) => {
  let query = supabase
    .from('api_usage_logs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (statusCode) query = query.eq('status_code', Number(statusCode));
  if (method) query = query.ilike('method', String(method).toUpperCase());
  if (endpoint) query = query.ilike('endpoint', `%${endpoint}%`);
  if (developer) query = query.eq('developer_id', developer);
  if (source) query = query.eq('source', source);
  if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
  if (dateTo) query = query.lte('created_at', new Date(dateTo).toISOString());

  const { data, count, error } = await requireTables(() => query.select('*', { count: 'exact' }).limit(1000));
  if (error) throwMissingTable(error);
  if (error) throw error;

  const rows = data || [];
  const total = count != null ? count : rows.length;
  const per = Math.min(Math.max(1, perPage), 200);
  const totalPages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const mapLog = (l) => ({
    id: l.id,
    requestId: l.request_id,
    endpoint: l.endpoint,
    method: l.method,
    statusCode: l.status_code,
    durationMs: l.duration_ms,
    errorCode: l.error_code,
    error: l.error_message,
    source: l.source,
    ip: l.ip,
    userAgent: l.user_agent,
    apiKeyId: l.api_key_id,
    developerId: l.developer_id,
    agentId: l.agent_id,
    headers: l.request_headers || null,
    requestBody: l.request_body,
    responseBody: l.response_body,
    createdAt: l.created_at
  });

  return {
    total,
    page: safePage,
    perPage: per,
    totalPages,
    logs: rows.slice((safePage - 1) * per, safePage * per).map(mapLog)
  };
};

const CSV_ESCAPE = /["\n,]/;
const escapeCsv = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  return CSV_ESCAPE.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const requestLogsToCsv = (rows) => {
  const cols = ['createdAt', 'requestId', 'method', 'endpoint', 'source', 'developerId', 'apiKeyId', 'statusCode', 'durationMs', 'ip', 'userAgent', 'requestBody', 'responseBody', 'error'];
  const header = cols.map((c) => escapeCsv(c)).join(',');
  const lines = rows.map((row) => cols.map((c) => escapeCsv(row[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
};
