/**
 * AuditService — fire-and-forget recording of meaningful platform actions.
 * A failure to persist must never break the primary operation.
 */

import crypto from 'crypto';
import { isMissingTable } from '../repositories/platformRepository.js';
import { insertViaDb, getPool } from '../utils/db.js';
import logger from '../utils/logger.js';
export const audit = async ({
  developerId,
  organizationId = null,
  actorType = 'developer',
  actorId = null,
  action,
  resourceType = null,
  resourceId = null,
  ip = null,
  userAgent = null,
  metadata = {}
}) => {
  try {
    // Use direct DB to bypass RLS
    const result = await insertViaDb('audit_logs', {
      id: crypto.randomUUID(),
      developer_id: developerId,
      organization_id: organizationId,
      actor_type: actorType,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip,
      user_agent: userAgent,
      metadata,
      created_at: new Date().toISOString()
    });
    if (result.error) logger.warn('[AUDIT] Failed to record:', result.error.message);
  } catch (err) {
    if (!isMissingTable(err)) {
      logger.warn('[AUDIT] Failed to record:', err.message);
    }
  }
};

export const listAuditLogs = async (developerId, organizationId, { limit, page, perPage = 100 } = {}) => {
  const pool = getPool();
  const params = [];
  const conditions = [];

  if (organizationId) {
    params.push(organizationId);
    conditions.push(`organization_id = $${params.length}`);
  } else if (developerId) {
    params.push(developerId);
    conditions.push(`developer_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const isPaginated = page !== undefined || limit === undefined;
  const activePage = page !== undefined ? page : 1;
  const per = Math.min(Number(perPage) || 100, 200);

  // Count total
  const countResult = await pool.query(`SELECT COUNT(*)::int as total FROM audit_logs ${where}`, params);
  const total = countResult.rows[0]?.total || 0;

  // Fetch rows
  if (isPaginated) {
    const from = (Math.max(1, Number(activePage)) - 1) * per;
    params.push(per, from);
    const { rows: data } = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const rows = data.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ip: row.ip,
      userAgent: row.user_agent,
      metadata: row.metadata,
      createdAt: row.created_at
    }));
    return {
      logs: rows,
      meta: {
        page: Number(activePage),
        perPage: per,
        total,
        totalPages: Math.ceil(total / per),
        hasMore: total > Number(activePage) * per
      }
    };
  } else {
    const lim = Math.min(Number(limit) || 50, 200);
    params.push(lim);
    const { rows: data } = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return data.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ip: row.ip,
      userAgent: row.user_agent,
      metadata: row.metadata,
      createdAt: row.created_at
    }));
  }
};

/** Build a CSV string from audit log rows (safe, header-only if empty). */
const CSV_ESCAPE = /["\n,]/;
const escapeCsv = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  return CSV_ESCAPE.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const auditToCsv = (rows, columns) => {
  const cols = columns || ['id', 'action', 'actorType', 'actorId', 'resourceType', 'resourceId', 'ip', 'createdAt'];
  const header = cols.map((c) => escapeCsv(c)).join(',');
  const lines = rows.map((row) => cols.map((c) => escapeCsv(row[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
};
