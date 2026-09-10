/**
 * AdminService — platform-wide analytics and management for super_admin users.
 *
 * Every query uses direct DB via getPool() to avoid Supabase gateway degradation.
 */

import { getPool } from '../utils/db.js';

// ============================================================================
// Dashboard
// ============================================================================

export const getDashboard = async () => {
  const pool = getPool();

  const [
    devCount,
    orgCount,
    agentCount,
    serviceCount,
    sessionCount,
    paidInvoices,
    failedInvoices,
    recentAudits,
    profilesPending,
  ] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM profiles'),
    pool.query('SELECT COUNT(*)::int AS count FROM organizations'),
    pool.query("SELECT COUNT(*)::int AS count FROM ai_agents WHERE status = 'active'"),
    pool.query("SELECT COUNT(*)::int AS count FROM ai_services WHERE is_active = true"),
    pool.query('SELECT COUNT(*)::int AS count FROM purchase_sessions'),
    pool.query("SELECT COUNT(*)::int AS count FROM service_invoices WHERE status = 'paid'"),
    pool.query("SELECT COUNT(*)::int AS count FROM service_invoices WHERE status IN ('failed','expired')"),
    pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20"),
    pool.query("SELECT COUNT(*)::int AS count FROM organization_profiles WHERE verification_level = 'unverified'"),
  ]);

  // Revenue
  let totalRevenue = 0;
  let monthlyRevenue = 0;
  try {
    const revResult = await pool.query(
      "SELECT COALESCE(SUM(CAST(amount_wei AS NUMERIC)), 0) AS total FROM service_invoices WHERE status = 'paid'"
    );
    totalRevenue = Number(revResult.rows[0]?.total || 0) / 1e18;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthResult = await pool.query(
      "SELECT COALESCE(SUM(CAST(amount_wei AS NUMERIC)), 0) AS total FROM service_invoices WHERE status = 'paid' AND paid_at >= $1",
      [monthStart.toISOString()]
    );
    monthlyRevenue = Number(monthResult.rows[0]?.total || 0) / 1e18;
  } catch {}

  // API requests today
  let apiRequestsToday = 0;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const apiResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM api_usage_logs WHERE created_at >= $1',
      [today.toISOString()]
    );
    apiRequestsToday = apiResult.rows[0]?.count || 0;
  } catch {}

  // Marketplace installs
  let marketplaceInstalls = 0;
  try {
    const installResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM agent_installations WHERE status IN ('active','running')"
    );
    marketplaceInstalls = installResult.rows[0]?.count || 0;
  } catch {}

  // Recent activity
  const recentActivity = (recentAudits.rows || []).slice(0, 10).map((a) => ({
    action: a.action,
    admin: a.actor_id || null,
    target: a.resource_type ? `${a.resource_type}${a.resource_id ? `: ${a.resource_id}` : ''}` : null,
    timestamp: a.created_at,
    type: a.action?.includes('delete') || a.action?.includes('suspend') ? 'danger' :
          a.action?.includes('reject') ? 'warning' : 'info',
  }));

  return {
    totalDevelopers: devCount.rows[0]?.count || 0,
    totalOrganizations: orgCount.rows[0]?.count || 0,
    totalAgents: agentCount.rows[0]?.count || 0,
    publishedServices: serviceCount.rows[0]?.count || 0,
    marketplaceRevenue: totalRevenue.toFixed(4),
    pendingVerifications: profilesPending.rows[0]?.count || 0,
    failedPayments: failedInvoices.rows[0]?.count || 0,
    apiRequestsToday,
    monthlyRevenue: monthlyRevenue.toFixed(4),
    marketplaceInstalls,
    totalTransactions: sessionCount.rows[0]?.count || 0,
    successfulPayments: paidInvoices.rows[0]?.count || 0,
    recentActivity,
  };
};

// ============================================================================
// Developers
// ============================================================================

export const listDevelopers = async ({ page = 1, perPage = 20, search = '' } = {}) => {
  const pool = getPool();
  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  const offset = from;
  const limit = per;

  let whereClause = '';
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    whereClause = `WHERE p.email ILIKE $${params.length} OR p.name ILIKE $${params.length}`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM profiles p ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT p.id, p.email, p.name, p.platform_role, p.world_verified, p.world_nullifier, p.created_at,
            COALESCE((SELECT COUNT(*)::int FROM ai_agents a WHERE a.developer_id = p.id::text AND a.world_verified = true), 0) AS verified_agent_count,
            (SELECT COUNT(*)::int FROM organization_members m WHERE m.developer_id::text = p.id::text AND m.status = 'active') AS org_count
     FROM profiles p
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    developers: rows,
    meta: {
      page: Math.max(1, Number(page) || 1),
      perPage: per,
      total: countResult.rows[0]?.count || 0,
      totalPages: Math.ceil((countResult.rows[0]?.count || 0) / per),
    },
  };
};

export const revokeWorldVerification = async (developerId) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sandboxReset = String(process.env.WORLD_ENVIRONMENT || '').toLowerCase() !== 'production' || process.env.NODE_ENV !== 'production';
    const profile = await client.query(
      `UPDATE profiles
          SET world_verified = false,
              world_verified_at = NULL,
              world_nullifier = CASE WHEN $2 THEN NULL ELSE world_nullifier END
        WHERE id::text = $1
        RETURNING id`,
      [developerId, sandboxReset]
    );
    const agents = await client.query(
      `UPDATE ai_agents
          SET world_verified = false, human_backed = false, world_verified_at = NULL,
              verification_method = NULL, agent_book_id = NULL, agentbook_tx_hash = NULL
        WHERE developer_id = $1
        RETURNING agent_id`,
      [developerId]
    );
    // Sandbox proofs are resettable for presentation/testing. Production
    // nullifier history remains immutable replay protection.
    if (sandboxReset) {
      await client.query(
        'DELETE FROM world_id_nullifiers WHERE developer_id = $1',
        [developerId]
      );
    }
    await client.query('COMMIT');
    return { developerId, profileUpdated: profile.rowCount > 0, agentsReset: agents.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ============================================================================
// Organizations
// ============================================================================

export const listOrganizations = async ({ page = 1, perPage = 20, search = '' } = {}) => {
  const pool = getPool();
  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  const offset = from;

  let whereClause = '';
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    whereClause = `WHERE o.name ILIKE $${params.length} OR o.slug ILIKE $${params.length}`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM organizations o ${whereClause}`,
    params
  );

  params.push(per, offset);
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.is_personal, o.created_at, o.owner_developer_id,
            COALESCE(owner_p.email, member_p.email) AS owner_email,
            COALESCE(owner_p.name, member_p.name) AS owner_name,
            (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS member_count,
            (SELECT COUNT(*)::int FROM ai_agents a WHERE a.organization_id = o.id) AS agent_count,
            op.verification_level AS profile_status
     FROM organizations o
     LEFT JOIN profiles owner_p ON owner_p.id::text = o.owner_developer_id::text
     LEFT JOIN organization_members owner_m ON owner_m.organization_id = o.id AND owner_m.role = 'owner' AND owner_m.status = 'active'
     LEFT JOIN profiles member_p ON member_p.id::text = owner_m.developer_id::text
     LEFT JOIN organization_profiles op ON op.organization_id = o.id
     ${whereClause}
     ORDER BY COALESCE(owner_p.email, member_p.email) NULLS LAST, o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    organizations: rows,
    meta: {
      page: Math.max(1, Number(page) || 1),
      perPage: per,
      total: countResult.rows[0]?.count || 0,
      totalPages: Math.ceil((countResult.rows[0]?.count || 0) / per),
    },
  };
};

export const approveOrgProfile = async (orgId) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE organization_profiles SET verification_level = 'verified_company', verified_at = NOW(), updated_at = NOW()
     WHERE organization_id = $1 RETURNING *`,
    [orgId]
  );
  if (!rows.length) throw new Error('Profile not found');
  return rows[0];
};

export const rejectOrgProfile = async (orgId) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE organization_profiles SET verification_level = 'unverified', verified_at = NULL, updated_at = NOW()
     WHERE organization_id = $1 RETURNING *`,
    [orgId]
  );
  if (!rows.length) throw new Error('Profile not found');
  return rows[0];
};

// ============================================================================
// Marketplace
// ============================================================================

export const listServices = async ({ page = 1, perPage = 20 } = {}) => {
  const pool = getPool();
  const per = Math.min(Number(perPage) || 20, 100);
  const offset = (Math.max(1, Number(page) || 1) - 1) * per;

  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM ai_services');
  const { rows } = await pool.query(
    `SELECT s.id, s.service_id, s.title, s.category, s.is_active, s.pricing_model, s.unit_price, s.created_at,
            a.agent_name AS provider_name
     FROM ai_services s
     LEFT JOIN ai_agents a ON a.id = s.agent_id
     ORDER BY s.created_at DESC
     LIMIT $1 OFFSET $2`,
    [per, offset]
  );

  return {
    services: rows,
    meta: { page: Math.max(1, Number(page) || 1), perPage: per, total: countResult.rows[0]?.count || 0 },
  };
};

// ============================================================================
// Payments / Invoices
// ============================================================================

export const listPayments = async ({ page = 1, perPage = 20, status = '' } = {}) => {
  const pool = getPool();
  const per = Math.min(Number(perPage) || 20, 100);
  const offset = (Math.max(1, Number(page) || 1) - 1) * per;

  let whereClause = '';
  const params = [];
  if (status) {
    params.push(status);
    whereClause = `WHERE i.status = $${params.length}`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM service_invoices i ${whereClause}`,
    params
  );

  params.push(per, offset);
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_id, i.status, i.amount_wei, i.service_code, i.created_at, i.paid_at,
            a.agent_name AS provider_name
     FROM service_invoices i
     LEFT JOIN ai_agents a ON a.agent_id = i.provider_agent_code
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    payments: rows.map((r) => ({
      ...r,
      amountBOT: r.amount_wei ? (Number(r.amount_wei) / 1e18).toFixed(6) : '0',
    })),
    meta: { page: Math.max(1, Number(page) || 1), perPage: per, total: countResult.rows[0]?.count || 0 },
  };
};

// ============================================================================
// Wallets
// ============================================================================

export const listWallets = async ({ page = 1, perPage = 20 } = {}) => {
  const pool = getPool();
  const per = Math.min(Number(perPage) || 20, 100);
  const offset = (Math.max(1, Number(page) || 1) - 1) * per;

  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM mpc_wallets');
  const { rows } = await pool.query(
    `SELECT w.wallet_id, w.address, w.status, w.wallet_type, w.chain_id, w.created_at
     FROM mpc_wallets w
     ORDER BY w.created_at DESC
     LIMIT $1 OFFSET $2`,
    [per, offset]
  );

  return {
    wallets: rows,
    meta: { page: Math.max(1, Number(page) || 1), perPage: per, total: countResult.rows[0]?.count || 0 },
  };
};

// ============================================================================
// Platform Health
// ============================================================================

export const getPlatformHealth = async () => {
  const pool = getPool();
  const checks = {};

  // Database
  const dbStart = Date.now();
  try {
    await pool.query('SELECT 1');
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: 'error', latencyMs: null };
  }

  // RPC (via env check)
  checks.rpc = {
    status: (process.env.ARC_RPC_URL || process.env.RPC_URL) ? 'ok' : 'unknown',
    latencyMs: null,
    blockNumber: null,
  };

  // Workers
  checks.workers = global.__workerStatus || {
    broadcastRecovery: { status: 'unknown' },
    scheduledPayment: { status: 'unknown' },
  };

  // API
  checks.api = {
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
  };

  return checks;
};

// ============================================================================
// Profile Approvals
// ============================================================================

export const listPendingProfiles = async () => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT op.*, o.name AS org_name, o.slug AS org_slug, o.owner_developer_id,
            p.email AS owner_email, p.name AS owner_name
     FROM organization_profiles op
     JOIN organizations o ON o.id = op.organization_id
     LEFT JOIN profiles p ON p.id::text = o.owner_developer_id::text
      WHERE op.verification_level = 'unverified'
     ORDER BY op.updated_at DESC`
  );
  return rows;
};

export const getProfileDetail = async (profileId) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT op.*, o.name AS org_name, o.slug AS org_slug, o.owner_developer_id,
            p.email AS owner_email, p.name AS owner_name
     FROM organization_profiles op
     JOIN organizations o ON o.id = op.organization_id
     LEFT JOIN profiles p ON p.id::text = o.owner_developer_id::text
     WHERE op.id = $1`,
    [profileId]
  );
  return rows[0] || null;
};

// ============================================================================
// Audit Logs
// ============================================================================

export const listAuditLogs = async ({ page = 1, perPage = 50, action = '' } = {}) => {
  const pool = getPool();
  const per = Math.min(Number(perPage) || 50, 200);
  const offset = (Math.max(1, Number(page) || 1) - 1) * per;

  let whereClause = '';
  const params = [];
  if (action) {
    params.push(`%${action}%`);
    whereClause = `WHERE action ILIKE $${params.length}`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM audit_logs ${whereClause}`,
    params
  );

  params.push(per, offset);
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    logs: rows,
    meta: { page: Math.max(1, Number(page) || 1), perPage: per, total: countResult.rows[0]?.count || 0 },
  };
};
