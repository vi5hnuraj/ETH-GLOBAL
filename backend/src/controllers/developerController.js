/**
 * DeveloperController — setup status, dashboard, analytics, usage, revenue,
 * agent management view and request logs for the Developer Platform UI.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkRequiredTables,
  REQUIRED_TABLES,
  MIGRATION_FILE
} from '../repositories/platformRepository.js';
import {
  getDashboard,
  getAnalytics,
  getUsage,
  getRevenue,
  listAgentsWithStats,
  deleteAgent,
  suspendAgent,
  resumeAgent,
  getAgentDetail,
  agentBalance,
  agentPay,
  agentHistory,
  agentStats,
  agentRotateKey,
  listRequestLogs,
  requestLogsToCsv
} from '../services/developerService.js';
import { createAgent } from '../services/agentService.js';
import { ensurePersonalOrg } from '../services/organizationService.js';
import { getMonitoring } from '../services/monitoringService.js';
import { listAuditLogs, auditToCsv } from '../services/auditService.js';
import { readQuota } from '../middleware/quotaMiddleware.js';
import { cache } from '../utils/ttlCache.js';
import { ok, handleError } from '../utils/respond.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadMigrationSql = () => {
  try {
    return fs.readFileSync(path.resolve(__dirname, '../config/agents_migration.sql'), 'utf8');
  } catch {
    return null;
  }
};

export const status = async (req, res) => {
  try {
    const { ready, missing, degraded, tables } = await checkRequiredTables();
    const setupRequired = !ready && !degraded;
    return res.status(200).json({
      success: true,
      setupRequired,
      ready,
      degraded,
      message: degraded ? 'Platform check is degraded; retrying the table probe.' : undefined,
      missing,
      tables: Object.fromEntries(tables.map((t) => [t.table, t.exists === true])),
      requiredTables: REQUIRED_TABLES,
      migrationFile: MIGRATION_FILE,
      migrationSql: setupRequired ? loadMigrationSql() : null,
      steps: [
        { title: 'Open Supabase', detail: 'Go to your Supabase project → SQL Editor.' },
        { title: 'Run the migration', detail: `Paste and run the contents of ${MIGRATION_FILE}. It is idempotent and safe to re-run.` },
        { title: 'Refresh', detail: 'Return to this page and refresh — the platform activates automatically.' }
      ]
    });
  } catch (err) {
    handleError(res, err, 'status');
  }
};

export const dashboard = async (req, res) => {
  try {
    const value = await cache.getOrCompute(`dashboard:${req.organization.id}:${req.developerId}`, () =>
      getDashboard(req.organization.id, req.developerId), 10_000);
    ok(res, { dashboard: value });
  } catch (err) {
    handleError(res, err, 'dashboard');
  }
};

export const analytics = async (req, res) => {
  try {
    const range = req.query.range || 'month';
    const value = await cache.getOrCompute(`analytics:${req.organization.id}:${range}`, () =>
      getAnalytics(req.organization.id, range, req.developerId), 10_000);
    ok(res, { analytics: value });
  } catch (err) {
    handleError(res, err, 'analytics');
  }
};

export const usage = async (req, res) => {
  try {
    const value = await cache.getOrCompute(`usage:${req.organization.id}`, () =>
      getUsage(req.organization.id, req.developerId), 5_000);
    ok(res, { usage: value });
  } catch (err) {
    handleError(res, err, 'usage');
  }
};

export const revenue = async (req, res) => {
  try {
    ok(res, { revenue: await getRevenue() });
  } catch (err) {
    handleError(res, err, 'revenue');
  }
};

export const agents = async (req, res) => {
  try {
    const { search, status, page = 1, perPage = 10 } = req.query;
    ok(res, await listAgentsWithStats(req.organization.id, req.developerId, {
      search,
      status,
      page: Number(page),
      perPage: Number(perPage)
    }));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

/**
 * POST /developers/agents
 * Create an AI agent (programmatic, developer-key scoped). Returns the
 * agentId, wallet address/id and the one-time gpay_sk_… API key.
 */
export const agentCreate = async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Agent name is required (POST /developers/agents — {"name": "…"}).' });
    }
    const result = await createAgent({
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      developerId: req.developerId,
      organizationId: req.organization.id
    });
    ok(res, {
      agentId: result.agentId,
      walletAddress: result.wallet,
      walletId: result.walletId,
      apiKey: result.apiKey,
      apiKeyPrefix: result.apiKeyPrefix,
      provider: result.provider,
      network: result.network,
      chainId: result.chainId
    });
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentDelete = async (req, res) => {
  try {
    ok(res, await deleteAgent(req.organization.id, req.developerId, req.params.agentId));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentSuspend = async (req, res) => {
  try {
    ok(res, await suspendAgent(req.organization.id, req.developerId, req.params.agentId));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentResume = async (req, res) => {
  try {
    ok(res, await resumeAgent(req.organization.id, req.developerId, req.params.agentId));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentDetail = async (req, res) => {
  try {
    ok(res, { agent: await getAgentDetail(req.organization.id, req.developerId, req.params.agentId) });
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentBalanceHandler = async (req, res) => {
  try {
    ok(res, await agentBalance(req.organization.id, req.params.agentId));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentPayHandler = async (req, res) => {
  try {
    const { destination, to, amount, token, wei, note } = req.body || {};
    ok(res, await agentPay(req.organization.id, req.developerId, req.params.agentId, { to: destination || to, amount, token, wei, note }));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentHistoryHandler = async (req, res) => {
  try {
    const { limit, page, offset } = req.query;
    const result = await agentHistory(req.organization.id, req.params.agentId, { limit, page, offset });
    ok(res, result.transactions ? result : { transactions: result });
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentStatsHandler = async (req, res) => {
  try {
    ok(res, await agentStats(req.organization.id, req.params.agentId));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const agentRotateHandler = async (req, res) => {
  try {
    ok(res, await agentRotateKey(req.organization.id, req.params.agentId));
  } catch (err) {
    handleError(res, err, 'agents');
  }
};

export const requestLogs = async (req, res) => {
  try {
    const { page = 1, perPage = 20, statusCode, method, endpoint, developer, source, dateFrom, dateTo } = req.query;
    ok(res, await listRequestLogs(req.organization.id, {
      page: Number(page),
      perPage: Number(perPage),
      statusCode,
      method,
      endpoint,
      developer,
      source,
      dateFrom,
      dateTo
    }));
  } catch (err) {
    handleError(res, err, 'request-logs');
  }
};

export const requestLogsExport = async (req, res) => {
  try {
    const { statusCode, method, endpoint, developer, source, dateFrom, dateTo, format = 'csv' } = req.query;
    const result = await listRequestLogs(req.organization.id, {
      page: 1,
      perPage: 200,
      statusCode,
      method,
      endpoint,
      developer,
      source,
      dateFrom,
      dateTo
    });
    const rows = result.logs || [];
    if (format === 'json') {
      return res.json({ success: true, count: rows.length, logs: rows });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="request-logs.csv"');
    return res.send(requestLogsToCsv(rows));
  } catch (err) {
    handleError(res, err, 'request-logs');
  }
};

export const monitoring = async (req, res) => {
  try {
    const value = await cache.getOrCompute('monitoring', () => getMonitoring(), 5_000);
    ok(res, { monitoring: value });
  } catch (err) {
    handleError(res, err, 'monitoring');
  }
};

export const auditLogs = async (req, res) => {
  try {
    const { page, perPage, limit, format } = req.query;
    // Always filter by developer_id so audit logs show across all orgs
    const result = await listAuditLogs(req.developerId, null, { page, perPage, limit });

    // Export mode: return raw CSV or JSON for machine consumption.
    if (format === 'csv' || format === 'json') {
      const rows = Array.isArray(result) ? result : result.logs;
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
        return res.send(auditToCsv(rows));
      }
      return res.json({ success: true, auditLogs: rows });
    }

    ok(res, { auditLogs: result });
  } catch (err) {
    handleError(res, err, 'audit');
  }
};

/** Report the effective org/developer monthly request quota (run after quotaMiddleware). */
export const quotaStatus = async (req, res) => {
  const q = req.quota || await readQuota(req.organization?.id || null, req.developerId);
  ok(res, {
    quota: {
      limit: q.limit,
      used: q.used,
      percentage: q.limit ? Math.min(100, Math.round((q.used / q.limit) * 1000) / 10) : null,
      remaining: q.limit === null ? null : Math.max(0, q.limit - q.used),
      resetKey: 'monthly',
      totalPages: q.limit === null ? null : Math.ceil(q.used / q.limit)
    }
  });
};
