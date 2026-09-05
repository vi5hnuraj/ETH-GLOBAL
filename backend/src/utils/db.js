/**
 * DB — a minimal internal PostgreSQL connection for operations that must NOT
 * rely on the Supabase PostgREST/gateway.
 *
 * The hosted gateway intermittently fails to map the service key to the
 * `service_role` JWT and downgrades requests to `anon`, which RLS-restricts
 * reads (silent `[]`) and rejects writes (42501). It can also drop RPCs from
 * its schema cache (PGRST125). Direct SQL through SUPABASE_DATABASE_URL runs
 * as a privileged DB user, bypasses RLS, and never touches the gateway — so
 * critical provisioning (personal-org creation) is bulletproof against those
 * failures. Used only for short, infrequent function calls.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool = null;

export const getPool = () => {
  if (pool) return pool;
  const connectionString =
    process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  pool = new pg.Pool({
    connectionString: connectionString || 'postgres://localhost:5432/postgres',
    ssl:
      connectionString && connectionString.includes('supabase')
        ? { rejectUnauthorized: false }
        : false,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'globpay-backend-provisioning'
  });
  pool.on('error', () => {
    /* idle client errors must not crash the process */
  });
  return pool;
};

const SAFE_TABLES = new Set([
  'workflow_runs',
  'workflow_templates',
  'ai_services',
  'organization_profiles',
  'agent_catalog',
  'developer_api_keys',
  'developer_settings',
  'ai_agents',
  'audit_logs',
  'api_usage_logs',
  'request_money',
  'subscriptions',
  'webhook_endpoints',
  'webhook_deliveries',
  'organizations',
  'organization_members',
  'organization_settings',
  'organization_invitations',
  'organization_audit_logs',
  'invoices',
  'usage_reports',
  'service_invoices',
  'purchase_sessions',
  'agent_installations',
  'agent_subscriptions',
  'agent_versions',
  'agent_reviews',
  'agent_invocation_logs',
  'ai_agent_transactions',
  'ai_services',
  'provider_capabilities',
  'provider_reputation',
  'procurement_policies',
  'workflow_run_steps',
  'enterprise_workspaces',
  'enterprise_workspace_members',
  'collaboration_projects',
  'collaboration_project_participants',
  'business_relationships',
  'org_partnerships',
  'org_activity_feed',
  'bank_details',
  'mpc_wallets',
  'mpc_shares',
  'mpc_transactions',
  'mpc_sessions',
  'payments',
  'money_transfers',
  'profiles'
]);

const isSafeIdent = (x) => /^[a-z_][a-z0-9_]*$/.test(String(x) || '');

/**
 * selectViaDb — run a SELECT query straight through the Postgres pool.
 * Works like a simple Supabase .select() but bypasses the gateway entirely.
 * Returns { data, error } to match the Supabase client shape.
 */
export const selectViaDb = async (table, { where = {}, orderBy, orderDir = 'desc', limit, single = false } = {}) => {
  if (!isSafeIdent(table) || !SAFE_TABLES.has(table)) return { data: null, error: { message: 'unsafe table' } };
  const cols = Object.keys(where).filter(isSafeIdent);
  const conds = cols.map((c, i) => `${c} = $${i + 1}`);
  const params = cols.map((c) => where[c]);
  const whereSql = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
  let sql = `SELECT * FROM ${table}${whereSql}`;
  if (isSafeIdent(orderBy)) sql += ` ORDER BY ${orderBy} ${orderDir === 'asc' ? 'ASC' : 'DESC'}`;
  if (single) sql += ' LIMIT 1';
  else if (Number.isFinite(limit)) sql += ` LIMIT ${Math.floor(limit)}`;
  try {
    const { rows } = await getPool().query({ text: sql, values: params });
    return { data: single ? (rows[0] || null) : rows, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message } };
  }
};

/**
 * insertViaDb — INSERT a single row and return it.
 */
export const insertViaDb = async (table, row) => {
  if (!isSafeIdent(table) || !SAFE_TABLES.has(table)) return { data: null, error: { message: 'unsafe table' } };
  const cols = Object.keys(row);
  const vals = cols.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`;
  try {
    const { rows } = await getPool().query({ text: sql, values: cols.map((c) => row[c]) });
    return { data: rows[0], error: null };
  } catch (err) {
    return { data: null, error: { message: err.message } };
  }
};

/**
 * updateViaDb — UPDATE rows and return the first updated row.
 */
export const updateViaDb = async (table, set, where) => {
  if (!isSafeIdent(table) || !SAFE_TABLES.has(table)) return { data: null, error: { message: 'unsafe table' } };
  const setCols = Object.keys(set).filter(isSafeIdent);
  const whereCols = Object.keys(where).filter(isSafeIdent);
  const allParams = [...setCols.map((c) => set[c]), ...whereCols.map((c) => where[c])];
  const setSql = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const whereSql = whereCols.map((c, i) => `${c} = $${setCols.length + i + 1}`).join(' AND ');
  const sql = `UPDATE ${table} SET ${setSql} WHERE ${whereSql} RETURNING *`;
  try {
    const { rows } = await getPool().query({ text: sql, values: allParams });
    return { data: rows[0] || null, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message } };
  }
};

/**
 * deleteViaDb — DELETE rows matching conditions.
 */
export const deleteViaDb = async (table, where) => {
  if (!isSafeIdent(table) || !SAFE_TABLES.has(table)) return { data: null, error: { message: 'unsafe table' } };
  const whereCols = Object.keys(where).filter(isSafeIdent);
  const params = whereCols.map((c) => where[c]);
  const whereSql = whereCols.map((c, i) => `${c} = $${i + 1}`).join(' AND ');
  const sql = `DELETE FROM ${table} WHERE ${whereSql} RETURNING *`;
  try {
    const { rows } = await getPool().query({ text: sql, values: params });
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message } };
  }
};

/**
 * countViaDb — count rows matching conditions.
 */
export const countViaDb = async (table, where = {}) => {
  if (!isSafeIdent(table) || !SAFE_TABLES.has(table)) return 0;
  const cols = Object.keys(where).filter(isSafeIdent);
  const conds = cols.map((c, i) => `${c} = $${i + 1}`);
  const params = cols.map((c) => where[c]);
  const whereSql = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
  const sql = `SELECT count(*)::int as n FROM ${table}${whereSql}`;
  try {
    const { rows } = await getPool().query({ text: sql, values: params });
    return rows[0]?.n || 0;
  } catch {
    return 0;
  }
};

/**
 * listViaDb — read rows straight from the privileged DB connection, bypassing
 * the Supabase gateway. Backward-compatible wrapper around selectViaDb.
 */
export const listViaDb = async (table, opts = {}) => {
  const { where = {}, orderBy = 'created_at', orderDir = 'desc', limit, offset } = opts;
  const result = await selectViaDb(table, { where, orderBy, orderDir, limit: limit || (Number.isFinite(offset) ? undefined : undefined) });
  if (!result || !result.data) return null;
  let rows = result.data;
  if (Number.isFinite(offset)) rows = rows.slice(offset);
  return { rows, count: rows.length };
};