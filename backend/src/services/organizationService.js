/**
 * OrganizationService — multi-tenant organizations, membership, invitations,
 * settings and org audit logs. The RBAC enforcement lives in the middleware
 * (requirePermission) on top of the permission catalog in config/roles.js;
 * this service only mutates/reads tenant state and always scopes queries to
 * an organization id so cross-tenant access is structurally impossible.
 *
 * Backward compatibility: every legacy developer_id is lazily provisioned a
 * "personal" organization (owner membership) on first touch, and the legacy
 * resource tables (ai_agents, developer_api_keys, …) are backfilled with
 * organization_id so existing single-user accounts keep working unchanged.
 */

import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';
import { DEFAULT_DEVELOPER_ID } from '../config/config.js';
import { INVITABLE_ROLES } from '../config/roles.js';
import logger from '../utils/logger.js';
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==================== Small helpers ====================

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const slugTaken = async (slug) => {
  // Single direct-DB query (skip gateway roundtrip to cut latency in half)
  const direct = await getOrgDirect({ slug });
  return !!direct;
};

export const makeOrgSlug = async (base) => {
  const candidate = slugify(base) || 'org';
  if (!(await slugTaken(candidate))) return candidate;
  for (let i = 0; i < 5; i += 1) {
    const attempt = `${candidate}-${i + 1}`;
    if (!(await slugTaken(attempt))) return attempt;
  }
  return `${candidate}-${crypto.randomBytes(3).toString('hex')}`;
};

const TRANSIENT_ERROR_CODES = new Set(['42501', '54001', '57014']);

/**
 * Create an organization directly via the PostgreSQL connection pool,
 * bypassing PostgREST and therefore RLS entirely. Used as a fallback when
 * the gateway intermittently downgrades the service-role JWT to `anon`,
 * which rejects writes with PostgreSQL error code 42501 ("new row violates
 * row-level security policy"). Runs as a privileged DB user (BYPASSRLS).
 */
const createOrganizationDirect = async ({ slug, name, avatarUrl, metadata, developerId }) => {
  const { rows } = await getPool().query(
    `INSERT INTO organizations (slug, name, avatar_url, metadata, owner_developer_id, is_personal, created_by)
     VALUES ($1, $2, $3, $4, $5, false, $5)
     RETURNING id, slug, name, avatar_url, metadata, owner_developer_id, is_personal, created_by, created_at, updated_at`,
    [slug, name, avatarUrl || null, (typeof metadata === 'object' && metadata) || {}, developerId]
  );
  return rows[0];
};

/**
 * Update an organization directly via the PostgreSQL connection pool,
 * bypassing PostgREST and therefore RLS entirely. Mirrors
 * createOrganizationDirect as the fallback for gateway anon-downgrade
 * failures (42501) and other transient PostgREST errors. The column names
 * come from a fixed whitelist built by updateOrganization, never from user
 * input.
 */
const updateOrganizationDirect = async ({ orgId, updates }) => {
  const cols = Object.keys(updates).map((k) => `"${k}"`).join(', ');
  const placeholders = Object.keys(updates).map((_, i) => `$${i + 1}`).join(', ');
  const values = Object.values(updates);
  const { rows } = await getPool().query(
    `UPDATE organizations SET (${cols}) = (${placeholders}) WHERE id = $${values.length + 1}
     RETURNING id, slug, name, avatar_url, metadata, updated_at`,
    [...values, orgId]
  );
  return rows[0];
};

/**
 * Upsert the owner membership directly via the DB pool. Bypasses the
 * PostgREST gateway (and therefore RLS) so it is immune to gateway
 * anon-downgrade failures.
 */
const ensureOwnerMemberDirect = async (orgId, developerId) => {
  const { rows } = await getPool().query(
    `INSERT INTO organization_members (organization_id, developer_id, role, status, joined_at, updated_at)
     VALUES ($1, $2, 'owner', 'active', NOW(), NOW())
     ON CONFLICT (organization_id, developer_id)
     DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = NOW()
     RETURNING *`,
    [orgId, developerId]
  );
  return rows[0];
};

/**
 * Insert organization_settings directly via the DB pool. Non-fatal.
 */
const createOrgSettingsDirect = async (orgId) => {
  try {
    await getPool().query(
      `INSERT INTO organization_settings (organization_id, data)
       VALUES ($1, '{}')
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId]
    );
  } catch {
    /* non-fatal */
  }
};

/**
 * Read helpers that fall back to the direct PostgreSQL pool when the gateway
 * is degraded. An anon-downgraded `maybeSingle` read silently returns `null`
 * (200 []), which otherwise makes tenant resolution treat a real org/membership
 * as missing and fall back to the personal org — surfacing as spurious
 * "Agent not found" / "not a member" on resource-scoped pages.
 */
const getOrgDirect = async ({ id, slug }) => {
  if (id) {
    if (!UUID_RE.test(id)) return null;
    const { rows } = await getPool().query(
      'SELECT * FROM organizations WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }
  if (slug) {
    const { rows } = await getPool().query(
      'SELECT * FROM organizations WHERE slug = $1',
      [slug]
    );
    return rows[0] || null;
  }
  return null;
};

const getMembershipDirect = async (organizationId, developerId) => {
  const { rows } = await getPool().query(
    `SELECT * FROM organization_members
     WHERE organization_id = $1 AND developer_id = $2`,
    [organizationId, developerId]
  );
  return rows[0] || null;
};

const listMembershipsDirect = async (developerId) => {
  const { rows } = await getPool().query(
    `SELECT m.role, m.joined_at, m.organization_id,
            o.id, o.slug, o.name, o.avatar_url, o.metadata, o.is_personal,
            o.owner_developer_id, o.created_at
     FROM organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.developer_id = $1 AND m.status = 'active'
     ORDER BY m.joined_at DESC`,
    [developerId]
  );
  return rows;
};

// ==================== Personal org (backward compat) ====================

const findPersonalOrg = (developerId) =>
  supabase
    .from('organizations')
    .select('*')
    .eq('owner_developer_id', developerId)
    .eq('is_personal', true)
    .maybeSingle()
    .then((r) => (r.error ? Promise.reject(r.error) : r.data));

export const getMembership = async (organizationId, developerId) => {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('developer_id', developerId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active') {
    // A `null` from the gateway is ambiguous: it may be a genuine non-membership
    // or a degraded anon read hiding the row. Resolve the ambiguity on the
    // direct DB connection, which bypasses RLS entirely.
    const direct = await getMembershipDirect(organizationId, developerId);
    if (!direct) return null;
    if (direct.status !== 'active') return null;
    return direct;
  }
  return data;
};

const ensureOwnerMember = async (org, developerId) => {
  const existing = await getMembership(org.id, developerId);
  if (existing) return existing;
  // Concurrent requests (dashboard/orgs/status all resolve the personal org on
  // mount) race this insert. upsert with the unique (organization_id,
  // developer_id) constraint resolves the race natively instead of a 23505 500.
  const { data, error } = await supabase
    .from('organization_members')
    .upsert(
      { organization_id: org.id, developer_id: developerId, role: 'owner', status: 'active' },
      { onConflict: 'organization_id,developer_id', ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) {
    // Safety net: another request won the race — re-fetch instead of failing.
    if (error.code === '23505') {
      const retry = await getMembership(org.id, developerId);
      if (retry) return retry;
    }
    throw error;
  }
  return data;
};

const RESOURCE_TABLES = [
  'ai_agents',
  'developer_api_keys',
  'webhook_endpoints',
  'webhook_deliveries',
  'api_usage_logs',
  'subscriptions',
  'invoices',
  'audit_logs'
];

/** Backfill organization_id on legacy rows owned by this developer (idempotent). */
export const backfillDeveloper = async (developerId, organizationId) => {
  await Promise.allSettled(
    RESOURCE_TABLES.map(async (table) => {
      try {
        await supabase
          .from(table)
          .update({ organization_id: organizationId })
          .eq('developer_id', developerId)
          .is('organization_id', null);
      } catch {
        /* non-fatal: some tables may not exist yet */
      }
    })
  );
};

/**
 * Find or create the developer's personal organization and owner membership.
 * This is the backward-compat bridge: every request that carries no explicit
 * organization context resolves to this tenant.
 *
 * Primary path: the SECURITY DEFINER RPC `public.ensure_personal_org` invoked
 * over the DIRECT DB connection (never the PostgREST gateway). It runs as a
 * privileged DB user (BYPASSRLS) and is immune to the gateway intermittently
 * downgrading service-role calls to anon (the cause of 42501 "new row
 * violates RLS") and to PGRST125 schema-cache drops. The function atomically
 * provisions the org, the owner membership, and backfills legacy rows.
 * Falls back to the gateway RPC, then a hardened direct insert, for DBs where
 * the function is absent.
 */
export const ensurePersonalOrg = async (developerId) => {
  const devId = developerId || DEFAULT_DEVELOPER_ID;

  // Never create orgs for non-UUID dev IDs (dev_xxxxx random IDs from old browser sessions)
  if (!UUID_RE.test(devId)) {
    logger.warn('[ensurePersonalOrg] rejected non-UUID devId:', devId);
    return null;
  }

  try {
    const { rows } = await getPool().query(
      'SELECT public.ensure_personal_org($1) AS payload',
      [devId]
    );
    const payload = rows[0] && rows[0].payload;
    if (payload && payload.org && payload.membership) {
      await backfillDeveloper(devId, payload.org.id);
      return { org: payload.org, membership: payload.membership };
    }
  } catch (err) {
    logger.error('[ensurePersonalOrg] direct DB provisioning failed', JSON.stringify({
      devId, message: err.message, code: err.code
    }));
  }

  // Gateway RPC fallback (only reachable on older DBs without the function or
  // when the direct connection is unavailable).
  const { data, error } = await supabase.rpc('ensure_personal_org', { p_dev_id: devId });
  if (!error && data && data.org) {
    await backfillDeveloper(devId, data.org.id);
    return { org: data.org, membership: data.membership };
  }
  if (error) {
    logger.error('[ensurePersonalOrg] RPC failed, falling back to direct path', JSON.stringify({
      devId, message: error.message, code: error.code, details: error.details, hint: error.hint
    }));
  }

  let org = await findPersonalOrg(devId);
  if (!org) {
    // Look up user's name/email for a readable workspace name
    let userName = '';
    try {
      const pool = getPool();
      const { rows } = await pool.query('SELECT name, email FROM profiles WHERE id = $1 LIMIT 1', [devId]);
      if (rows[0]) {
        userName = rows[0].name || rows[0].email?.split('@')[0] || '';
      }
    } catch { }
    const displayName = userName || 'My Workspace';
    const slug = await makeOrgSlug(slugify(displayName));
    let insertErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 300));
      const { data: ins, error } = await supabase
        .from('organizations')
        .insert({
          slug,
          name: displayName,
          owner_developer_id: devId,
          is_personal: true,
          created_by: devId
        })
        .select()
        .single();
      if (!error) {
        org = ins;
        break;
      }
      insertErr = error;
      if (error.code !== '42501' && error.code !== '54001' && error.code !== '57014') {
        // A genuine, non-transient failure (e.g. unique/constraint): no point in retrying.
        break;
      }
    }
    if (!org && insertErr) {
      logger.error('[ensurePersonalOrg] INSERT org failed', JSON.stringify({
        devId, slug, message: insertErr.message, code: insertErr.code
      }));
      // Gateway INSERT failed (RLS). Try direct DB INSERT which bypasses RLS.
      try {
        org = await createOrganizationDirect({ slug, name: displayName, avatarUrl: null, metadata: {}, developerId: devId });
      } catch (directErr) {
        logger.error('[ensurePersonalOrg] direct DB INSERT also failed', JSON.stringify({ devId, message: directErr.message }));
        // Final fallback: re-read hoping the row appeared via another path
        let seen = false;
        for (let i = 0; i < 4; i += 1) {
          await new Promise((r) => setTimeout(r, 250));
          org = await findPersonalOrg(devId);
          if (org) {
            seen = true;
            break;
          }
        }
        if (!seen) throw insertErr;
      }
    }
  }
  const membership = await ensureOwnerMember(org, devId);
  await backfillDeveloper(devId, org.id);
  return { org, membership };
};

// ==================== Request-time resolution ====================

/**
 * Resolve the active organization for a request.
 * Precedence: path param -> X-Organization-Id header -> ?organizationId
 *            -> X-Organization-Slug header -> API key's org -> personal org.
 * Explicitly requested orgs require active membership (403 otherwise).
 */
export const resolveForRequest = async ({
  developerId,
  jwtUserId,
  apiKey,
  orgId,
  headerOrgId,
  headerSlug
}) => {
  const devId = developerId || DEFAULT_DEVELOPER_ID;
  // If JWT user ID differs from devId, use it as a fallback for membership lookups
  const fallbackId = jwtUserId && jwtUserId !== devId ? jwtUserId : null;

  const explicitId = orgId || headerOrgId || null;
  const explicitSlug = headerSlug || null;

  if (explicitId || explicitSlug) {
    // Header-sourced context (X-Organization-Id / X-Organization-Slug) is
    // ambient: the browser may hold a stale id for an org that was deleted or
    // a foreign id it no longer belongs to. Falling back to the personal org
    // makes that self-heal instead of hard-failing the platform UI. Path-param
    // org ids are explicit targets (delete, invite accept, member ops) and keep
    // strict 404/403 semantics — never silently retarget them.
    const ambientContext = !orgId;
    // A malformed org id must never reach Postgres: PostgREST rejects a
    // non-UUID with `invalid input syntax for type uuid`, surfacing as a 500.
    // Treat it exactly like an unknown tenant (clean 404).
    if (explicitId && !UUID_RE.test(explicitId)) {
      if (ambientContext) return ensurePersonalOrg(devId);
      throw httpError(404, 'Organization not found.', 'ORG_NOT_FOUND');
    }
    const { data: directRead, error } = explicitId
      ? await supabase.from('organizations').select('*').eq('id', explicitId).maybeSingle()
      : await supabase.from('organizations').select('*').eq('slug', explicitSlug).maybeSingle();
    if (error) throw error;
    let org = directRead;
    if (!org) {
      // The gateway may have hidden the row via an anon-downgraded read.
      // Confirm on the direct DB connection before declaring it missing.
      const directOrg = await getOrgDirect(explicitId ? { id: explicitId } : { slug: explicitSlug });
      if (!directOrg) {
        if (ambientContext) return ensurePersonalOrg(devId);
        throw httpError(404, 'Organization not found.', 'ORG_NOT_FOUND');
      }
      org = directOrg;
    }
    let membership = await getMembership(org.id, devId);
    // If devId membership not found, try JWT user ID fallback
    if (!membership && fallbackId) {
      membership = await getMembership(org.id, fallbackId);
    }
    if (!membership) {
      if (ambientContext) return ensurePersonalOrg(devId);
      throw httpError(403, 'You are not a member of this organization.', 'ORG_FORBIDDEN');
    }
    return { org, membership };
  }

  if (apiKey?.organizationId) {
    if (!UUID_RE.test(apiKey.organizationId)) {
      throw httpError(403, 'Organization for this API key no longer exists.', 'ORG_FORBIDDEN');
    }
    const { data: org, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', apiKey.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!org) throw httpError(403, 'Organization for this API key no longer exists.', 'ORG_FORBIDDEN');
    let membership = await getMembership(org.id, devId);
    if (!membership && fallbackId) membership = await getMembership(org.id, fallbackId);
    if (!membership) throw httpError(403, 'Membership is required for this organization.', 'ORG_FORBIDDEN');
    return { org, membership };
  }

  return ensurePersonalOrg(devId);
};

// ==================== Organization CRUD ====================

export const getOrgById = async (orgId) => {
  const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
  if (error) throw error;
  return data;
};

export const listMyOrganizations = async (developerId) => {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('developer_id', developerId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];

  // Build the gateway-sourced list, silently skipping rows whose
  // organizations join returned null (gateway RLS degradation, etc).
  const gatewayOrgs = rows
    .filter((m) => m.organizations)
    .map((m) => ({
      id: m.organizations.id,
      slug: m.organizations.slug,
      name: m.organizations.name,
      avatarUrl: m.organizations.avatar_url,
      metadata: m.organizations.metadata,
      isPersonal: m.organizations.is_personal,
      owner: m.organizations.owner_developer_id,
      role: m.role,
      createdAt: m.organizations.created_at
    }));

  // Always check the direct DB as a safety-net.  The gateway can return
  // partial results — some rows with null `.organizations` that get
  // filtered out above — which silently drops early organizations that
  // were created via direct-DB fallback.  Merging both sources and
  // deduplicating by id ensures nothing is lost.
  const direct = await listMembershipsDirect(developerId);
  if (!direct.length) return gatewayOrgs;

  const byId = new Map();
  for (const o of gatewayOrgs) byId.set(o.id, o);
  for (const r of direct) {
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id,
        slug: r.slug,
        name: r.name,
        avatarUrl: r.avatar_url,
        metadata: r.metadata,
        isPersonal: r.is_personal,
        owner: r.owner_developer_id,
        role: r.role,
        createdAt: r.created_at
      });
    }
  }
  return Array.from(byId.values());
};

export const createOrganization = async ({ developerId, name, slug, avatarUrl, metadata }) => {
  const displayName = String(name || '').trim();
  if (!displayName) throw httpError(400, 'Organization name is required.', 'VALIDATION');

  const explicitSlug = slug ? String(slug).toLowerCase() : null;
  if (explicitSlug && !SLUG_RE.test(explicitSlug)) {
    throw httpError(400, 'Slug must be 3–63 lowercase letters, digits or dashes.', 'VALIDATION');
  }

  const buildRow = (orgSlug) => ({
    slug: orgSlug,
    name: displayName,
    avatar_url: avatarUrl || null,
    metadata: (typeof metadata === 'object' && metadata) || {},
    owner_developer_id: developerId,
    is_personal: false,
    created_by: developerId
  });

  const MAX_SLUG_ATTEMPTS = 5;
  let org = null;
  let orgSlug = null;
  let lastErr = null;

  // Primary path: insert via the PostgREST gateway (service-role client).
  // 23505 means a concurrent request won the organizations_slug_key race: for
  // an auto-generated slug we resolve a fresh candidate and retry; for an
  // explicit user slug we surface a clean 409. Transient gateway errors
  // (anon-downgrade 42501, deadlock, statement timeout) retry here before the
  // direct-DB fallback below.
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    if (explicitSlug) {
      if (await slugTaken(explicitSlug)) {
        throw httpError(409, `The slug '${explicitSlug}' is already taken.`, 'SLUG_TAKEN');
      }
      orgSlug = explicitSlug;
    } else {
      orgSlug = await makeOrgSlug(displayName);
    }

    if (attempt > 0) await new Promise((r) => setTimeout(r, 250));
    const { data: ins, error: insErr } = await supabase
      .from('organizations')
      .insert(buildRow(orgSlug))
      .select()
      .single();
    if (!insErr) {
      org = ins;
      break;
    }
    lastErr = insErr;
    if (insErr.code === '23505') {
      if (explicitSlug) throw httpError(409, `The slug '${explicitSlug}' is already taken.`, 'SLUG_TAKEN');
      continue;
    }
    if (!TRANSIENT_ERROR_CODES.has(insErr.code)) break;
  }

  // Fallback: direct DB insert bypassing the gateway (and RLS entirely).
  // slugTaken is now direct-DB-backed, so makeOrgSlug yields genuinely fresh
  // auto-candidates; loop like the gateway path so a rare concurrent 23505 on
  // an auto-slug still resolves instead of escaping as a raw PG error.
  if (!org) {
    if (lastErr) {
      logger.error('[createOrganization] gateway INSERT failed, using direct DB fallback', JSON.stringify({
        slug: orgSlug, message: lastErr.message, code: lastErr.code
      }));
    }
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !org; attempt += 1) {
      if (explicitSlug) {
        if (await slugTaken(explicitSlug)) {
          throw httpError(409, `The slug '${explicitSlug}' is already taken.`, 'SLUG_TAKEN');
        }
        orgSlug = explicitSlug;
      } else {
        orgSlug = await makeOrgSlug(displayName);
      }
      try {
        org = await createOrganizationDirect({ slug: orgSlug, name: displayName, avatarUrl, metadata, developerId });
      } catch (directErr) {
        if (directErr.code !== '23505') throw directErr;
        lastErr = directErr;
      }
    }
    if (!org) {
      throw httpError(409, `The slug '${orgSlug || displayName}' is already taken.`, 'SLUG_TAKEN');
    }
  }

  // Fire post-create tasks in parallel (member + settings + audit)
  const ensureMember = (async () => {
    try {
      await ensureOwnerMember(org, developerId);
    } catch (memberErr) {
      if (TRANSIENT_ERROR_CODES.has(memberErr.code)) {
        await ensureOwnerMemberDirect(org.id, developerId);
      } else {
        throw memberErr;
      }
    }
  })();

  const settingsInit = supabase
    .from('organization_settings')
    .insert({ organization_id: org.id, data: {} })
    .then(() => { })
    .catch(() => { });

  const auditLog = orgAudit({
    organizationId: org.id,
    actorId: developerId,
    action: 'organization.created',
    resourceType: 'organization',
    resourceId: org.id,
    metadata: { name: displayName, slug: orgSlug }
  });

  // Wait only for the member — settings + audit are fire-and-forget
  await ensureMember;
  Promise.allSettled([settingsInit, auditLog]);

  return { id: org.id, slug: orgSlug, name: displayName, role: 'owner' };
};

export const updateOrganization = async ({ orgId, actorId, patch = {} }) => {
  const updates = {};
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim();
    if (!name) throw httpError(400, 'Organization name cannot be empty.', 'VALIDATION');
    updates.name = name;
  }
  if (patch.avatarUrl !== undefined) updates.avatar_url = patch.avatarUrl || null;
  if (patch.metadata !== undefined) {
    if (typeof patch.metadata !== 'object' || Array.isArray(patch.metadata)) {
      throw httpError(400, 'metadata must be an object.', 'VALIDATION');
    }
    updates.metadata = patch.metadata;
  }
  if (patch.slug !== undefined) {
    const slug = String(patch.slug || '').toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw httpError(400, 'Slug must be 3–63 lowercase letters, digits or dashes.', 'VALIDATION');
    }
    const taken = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (taken.data && taken.data.id !== orgId) {
      throw httpError(409, `The slug '${slug}' is already taken.`, 'SLUG_TAKEN');
    }
    updates.slug = slug;
  }
  if (!Object.keys(updates).length) return { updated: false };

  updates.updated_at = new Date().toISOString();

  // Primary path: update via the PostgREST gateway (service-role client).
  // Transient gateway errors (anon-downgrade 42501, deadlock, statement
  // timeout) retry on fresh sockets before the direct-DB fallback below,
  // mirroring createOrganization. A unique violation from a raced SLA hint
  // maps back to a clean 409 SLUG_TAKEN.
  let org = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250));
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();
    if (!error) {
      org = data;
      break;
    }
    lastErr = error;
    if (error.code === '23505') {
      throw httpError(409, `The slug '${updates.slug}' is already taken.`, 'SLUG_TAKEN');
    }
    if (!TRANSIENT_ERROR_CODES.has(error.code)) break;
  }

  // Fallback: direct DB update bypassing the gateway (and RLS entirely).
  if (!org) {
    if (lastErr) {
      logger.error('[updateOrganization] gateway UPDATE failed, using direct DB fallback', JSON.stringify({
        orgId, message: lastErr.message, code: lastErr.code
      }));
    }
    org = await updateOrganizationDirect({ orgId, updates });
    if (!org) throw httpError(404, 'Organization not found.', 'ORG_NOT_FOUND');
  }

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'organization.updated',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { changed: Object.keys(updates).filter((k) => k !== 'updated_at') }
  });

  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    avatarUrl: org.avatar_url,
    metadata: org.metadata,
    updated: true
  };
};

export const countOrgResources = async (orgId) => {
  const counts = {};
  const queries = {
    ai_agents: (q) => q.eq('status', 'active'),
    developer_api_keys: (q) => q.neq('status', 'revoked'),
    webhook_endpoints: (q) => q.eq('is_active', true),
    subscriptions: (q) => q.not('status', 'in', '(cancelled,canceled)'),
    invoices: (q) => q
  };
  await Promise.all(
    Object.entries(queries).map(async ([table, scope]) => {
      try {
        let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
        q = scope(q);
        const { count, error } = await q;
        counts[table] = error ? 0 : count || 0;
      } catch {
        counts[table] = 0;
      }
    })
  );
  return counts;
};

export const deleteOrganization = async ({ orgId, actorId }) => {
  const membership = await getMembership(orgId, actorId);
  if (!membership || membership.role !== 'owner') {
    throw httpError(403, 'Only the organization owner can delete it.', 'ROLE_FORBIDDEN');
  }

  const resources = await countOrgResources(orgId);
  const present = Object.entries(resources).filter(([, n]) => n > 0);
  if (present.length) {
    const detail = present.map(([t, n]) => `${t}:${n}`).join(', ');
    throw httpError(409, `Cannot delete: organization still owns resources (${detail}). Remove or transfer them first.`, 'ORG_HAS_RESOURCES');
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!org) throw httpError(404, 'Organization not found.', 'ORG_NOT_FOUND');

  // Mirrored to the global audit log because the org audit trail cascades away.
  await globalAudit({
    developerId: actorId,
    organizationId: orgId,
    action: 'organization.deleted',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { name: org.name, slug: org.slug }
  });

  const { error: delErr } = await supabase.from('organizations').delete().eq('id', orgId);
  if (delErr) throw delErr;
  return { deleted: true, id: orgId };
};

// ==================== Members ====================

export const listMembers = async (orgId) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.*, p.name, p.email as profile_email, p.global_pay_tag
     FROM organization_members m
     LEFT JOIN profiles p ON p.id::text = m.developer_id::text
     WHERE m.organization_id = $1
     ORDER BY m.joined_at ASC`,
    [orgId]
  );
  return (rows || []).map((m) => ({
    id: m.id,
    developerId: m.developer_id,
    email: m.profile_email || m.email,
    name: m.name,
    globalPayTag: m.global_pay_tag,
    role: m.role,
    status: m.status || 'active',
    isOwner: m.role === 'owner',
    joinedAt: m.joined_at,
    lastActiveAt: m.last_active_at || m.updated_at || null
  }));
};

export const changeMemberRole = async ({ orgId, actorId, memberId, role }) => {
  const target = await getMemberById(orgId, memberId);
  if (target.role === 'owner') {
    throw httpError(400, 'The owner role cannot be changed. Transfer ownership instead.', 'OWNER_IMMUTABLE');
  }
  if (!INVITABLE_ROLES.includes(role)) {
    throw httpError(400, `Invalid role. Use one of: ${INVITABLE_ROLES.join(', ')}.`, 'VALIDATION');
  }

  const { data, error } = await supabase
    .from('organization_members')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error) throw error;

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'member.role_changed',
    resourceType: 'organization_member',
    resourceId: memberId,
    metadata: { developerId: target.developer_id, from: target.role, to: role }
  });
  return { memberId, developerId: target.developer_id, role };
};

export const removeMember = async ({ orgId, actorId, memberId }) => {
  const actorMembership = await getMembership(orgId, actorId);
  if (!actorMembership) throw httpError(403, 'Membership required.', 'ORG_FORBIDDEN');

  const target = await getMemberById(orgId, memberId);
  if (target.role === 'owner') {
    throw httpError(400, 'The owner cannot be removed. Transfer ownership first.', 'OWNER_IMMUTABLE');
  }
  if (target.developer_id === actorId) {
    throw httpError(400, 'Use “leave organization” to remove yourself.', 'VALIDATION');
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', orgId);
  if (error) throw error;

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'member.removed',
    resourceType: 'organization_member',
    resourceId: memberId,
    metadata: { developerId: target.developer_id, role: target.role }
  });
  return { removed: true, memberId, developerId: target.developer_id };
};

export const leaveOrganization = async ({ orgId, developerId }) => {
  const membership = await getMembership(orgId, developerId);
  if (!membership) throw httpError(404, 'You are not a member of this organization.', 'ORG_NOT_FOUND');
  if (membership.role === 'owner') {
    throw httpError(400, 'The owner cannot leave. Transfer ownership first.', 'OWNER_IMMUTABLE');
  }
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', membership.id);
  if (error) throw error;

  await orgAudit({
    organizationId: orgId,
    actorId: developerId,
    action: 'member.left',
    resourceType: 'organization_member',
    resourceId: membership.id,
    metadata: { developerId, role: membership.role }
  });
  return { left: true };
};

export const transferOwnership = async ({ orgId, actorId, toDeveloperId, memberId }) => {
  const actorMembership = await getMembership(orgId, actorId);
  if (!actorMembership || actorMembership.role !== 'owner') {
    throw httpError(403, 'Only the organization owner can transfer ownership.', 'ROLE_FORBIDDEN');
  }

  let target;
  if (memberId) {
    target = await getMemberById(orgId, memberId);
  } else if (toDeveloperId) {
    target = await getMembership(orgId, toDeveloperId);
    if (!target) throw httpError(404, 'Target developer is not a member.', 'NOT_FOUND');
  } else {
    throw httpError(400, 'Provide toDeveloperId or memberId.', 'VALIDATION');
  }

  if (target.developer_id === actorId) {
    throw httpError(400, 'Ownership already belongs to you.', 'VALIDATION');
  }

  const now = new Date().toISOString();
  await supabase
    .from('organization_members')
    .update({ role: 'owner', updated_at: now })
    .eq('id', target.id);
  await supabase
    .from('organization_members')
    .update({ role: 'admin', updated_at: now })
    .eq('id', actorMembership.id);
  await supabase
    .from('organizations')
    .update({ owner_developer_id: target.developer_id, updated_at: now })
    .eq('id', orgId);

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'organization.ownership_transferred',
    resourceType: 'organization',
    resourceId: orgId,
    metadata: { from: actorId, to: target.developer_id }
  });
  return { owner: target.developer_id };
};

const getMemberById = async (orgId, memberId) => {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('id', memberId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Member not found.', 'NOT_FOUND');
  return data;
};

// ==================== Invitations ====================

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

export const inviteMember = async ({ orgId, actorId, email, role }) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw httpError(400, 'A valid email is required.', 'VALIDATION');
  if (!INVITABLE_ROLES.includes(role)) {
    throw httpError(400, `Invalid role. Use one of: ${INVITABLE_ROLES.join(', ')}.`, 'VALIDATION');
  }

  const pool = getPool();

  const { rows: existingMembers } = await pool.query(
    'SELECT id FROM organization_members WHERE organization_id = $1 AND email = $2',
    [orgId, normalized]
  );
  if (existingMembers.length) throw httpError(409, 'This email is already a member.', 'ALREADY_MEMBER');

  const { rows: dupes } = await pool.query(
    `SELECT id FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND status = 'pending'`,
    [orgId, normalized]
  );
  if (dupes.length) throw httpError(409, 'An invitation to this email is already pending.', 'DUPLICATE_INVITATION');

  const token = `inv_${crypto.randomBytes(24).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { rows: invRows } = await pool.query(
    `INSERT INTO organization_invitations (organization_id, email, role, token, status, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
    [orgId, normalized, role, token, actorId, expiresAt]
  );
  const data = invRows[0];

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'member.invited',
    resourceType: 'organization_invitation',
    resourceId: data.id,
    metadata: { email: normalized, role }
  });

  return {
    id: data.id,
    email: normalized,
    role,
    token,
    status: 'pending',
    expiresAt,
    acceptUrl: `/api/developers/orgs/${orgId}/invitations/${token}/accept`
  };
};

export const listInvitations = async (orgId, currentUserEmail) => {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    // Exclude invitations addressed TO the current user — they see those in Notifications
    .filter((i) => !currentUserEmail || i.email?.toLowerCase() !== currentUserEmail.toLowerCase())
    .map((i) => ({
      id: i.id,
      token: i.token,
      email: i.email,
      role: i.role,
      status: i.status,
      invitedBy: i.invited_by,
      expiresAt: i.expires_at,
      expired: new Date(i.expires_at).getTime() < Date.now(),
      createdAt: i.created_at
    }));
};

export const cancelInvitation = async ({ orgId, actorId, token }) => {
  const { data: invite, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!invite) throw httpError(404, 'Invitation not found.', 'NOT_FOUND');
  if (invite.status !== 'pending') throw httpError(409, 'Invitation is no longer pending.', 'INVITATION_STATE');

  await supabase.from('organization_invitations').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', invite.id);

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'invitation.cancelled',
    resourceType: 'organization_invitation',
    resourceId: invite.id,
    metadata: { email: invite.email }
  });
  return { cancelled: true };
};

export const acceptInvitation = async ({ orgId, token, developerId }) => {
  const { data: invite, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  if (!invite) throw httpError(404, 'Invitation not found or already resolved.', 'INVALID_INVITATION');
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw httpError(400, 'Invitation has expired.', 'INVITATION_EXPIRED');
  }

  const existing = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('developer_id', developerId)
    .maybeSingle();
  if (existing.data) throw httpError(409, 'You are already a member of this organization.', 'ALREADY_MEMBER');

  await supabase
    .from('organization_invitations')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', invite.id);

  const { data: member, error: memberErr } = await supabase
    .from('organization_members')
    .insert({
      organization_id: orgId,
      developer_id: developerId,
      email: invite.email,
      role: invite.role,
      status: 'active'
    })
    .select()
    .single();
  if (memberErr) throw memberErr;

  await orgAudit({
    organizationId: orgId,
    actorId: developerId,
    action: 'member.accepted',
    resourceType: 'organization_member',
    resourceId: member.id,
    metadata: { email: invite.email, role: invite.role }
  });

  const org = await getOrgById(orgId);
  return { accepted: true, organizationId: orgId, name: org?.name || null, role: invite.role };
};

export const declineInvitation = async ({ orgId, token, developerId }) => {
  const { data: invite, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  if (!invite) throw httpError(404, 'Invitation not found or already resolved.', 'INVALID_INVITATION');

  await supabase
    .from('organization_invitations')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', invite.id);

  await orgAudit({
    organizationId: orgId,
    actorId: developerId,
    action: 'invitation.declined',
    resourceType: 'organization_invitation',
    resourceId: invite.id,
    metadata: { email: invite.email }
  });
  return { declined: true };
};

export const myInvitations = async ({ email }) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return [];
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*, organizations(name, slug)')
    .eq('email', normalized)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    .filter((i) => i.organizations)
    .map((i) => ({
      id: i.id,
      organizationId: i.organization_id,
      organizationName: i.organizations.name,
      organizationSlug: i.organizations.slug,
      role: i.role,
      token: i.token,
      expiresAt: i.expires_at,
      expired: new Date(i.expires_at).getTime() < Date.now(),
      createdAt: i.created_at
    }));
};

// ==================== Settings ====================

export const getOrgSettings = async (orgId) => {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return { organizationId: orgId, ...(data?.data || {}) };
};

export const updateOrgSettings = async ({ orgId, actorId, patch }) => {
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    throw httpError(400, 'Settings payload must be an object.', 'VALIDATION');
  }
  if (JSON.stringify(patch).length > 32_000) {
    throw httpError(400, 'Settings payload too large.', 'VALIDATION');
  }
  const current = (await getOrgSettings(orgId));
  const merged = { ...current, ...patch };

  const { error } = await supabase
    .from('organization_settings')
    .upsert(
      { organization_id: orgId, data: merged, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' }
    );
  if (error) throw error;

  await orgAudit({
    organizationId: orgId,
    actorId,
    action: 'organization.settings_updated',
    resourceType: 'organization_settings',
    resourceId: orgId,
    metadata: { changed: Object.keys(patch) }
  });
  return merged;
};

// ==================== Audit logs ====================

const orgAudit = async ({ organizationId, actorId, action, resourceType, resourceId, metadata }) => {
  try {
    await supabase.from('organization_audit_logs').insert({
      organization_id: organizationId,
      actor_developer_id: actorId || null,
      action,
      resource_type: resourceType || null,
      resource_id: resourceId || null,
      metadata: metadata || {}
    });
  } catch (err) {
    logger.warn('[ORG AUDIT] Failed to record:', err.message);
  }
  await globalAudit({
    developerId: actorId,
    organizationId,
    action,
    resourceType,
    resourceId,
    metadata
  });
};

const globalAudit = async ({ developerId, organizationId, action, resourceType, resourceId, metadata }) => {
  try {
    await supabase.from('audit_logs').insert({
      developer_id: developerId || null,
      organization_id: organizationId || null,
      action,
      resource_type: resourceType || null,
      resource_id: resourceId || null,
      metadata: metadata || {}
    });
  } catch (err) {
    logger.warn('[AUDIT] Failed to record:', err.message);
  }
};

export const listOrgAuditLogs = async (orgId, limit = 50) => {
  const { data, error } = await supabase
    .from('organization_audit_logs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 50, 200));
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    actorId: row.actor_developer_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    createdAt: row.created_at
  }));
};

// ==================== Notifications ====================

/**
 * Create an in-app notification.
 */
export const createNotification = async ({ recipientId, senderId, type, title, body, data, actionUrl }) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO notifications (recipient_id, sender_id, type, title, body, data, action_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [recipientId, senderId || null, type || 'invitation', title, body || null, JSON.stringify(data || {}), actionUrl || null]
  );
  return rows[0];
};

/**
 * List notifications for a user.
 */
export const listNotifications = async ({ recipientId, unreadOnly }) => {
  const pool = getPool();
  const where = ['recipient_id = $1'];
  const params = [recipientId];
  if (unreadOnly) { where.push('read = false'); }
  const { rows } = await pool.query(
    `SELECT n.*, p.name as sender_name, p.email as sender_email, p.global_pay_tag as sender_tag
     FROM notifications n
     LEFT JOIN profiles p ON p.id = n.sender_id
     WHERE ${where.join(' AND ')}
     ORDER BY n.created_at DESC
     LIMIT 50`,
    params
  );
  return rows;
};

/**
 * Mark a notification as read.
 */
export const markNotificationRead = async ({ notificationId, recipientId }) => {
  const pool = getPool();
  await pool.query(
    'UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2',
    [notificationId, recipientId]
  );
  return { read: true };
};

/**
 * Mark all notifications as read for a user.
 */
export const markAllNotificationsRead = async ({ recipientId }) => {
  const pool = getPool();
  await pool.query('UPDATE notifications SET read = true WHERE recipient_id = $1 AND read = false', [recipientId]);
  return { read: true };
};

/**
 * Get unread notification count.
 */
export const unreadNotificationCount = async ({ recipientId }) => {
  const pool = getPool();
  const { rows } = await pool.query('SELECT COUNT(*)::int as count FROM notifications WHERE recipient_id = $1 AND read = false', [recipientId]);
  return rows[0]?.count || 0;
};

// ==================== Tag-based user search ====================

/**
 * Search users by GlobalPay tag.
 */
export const searchByTag = async ({ query }) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, email, global_pay_tag FROM profiles
     WHERE global_pay_tag ILIKE $1 OR name ILIKE $2 OR email ILIKE $2
     LIMIT 10`,
    [`%${query}%`, `%${query}%`]
  );
  return rows;
};

/**
 * Invite by GlobalPay tag — creates notification instead of email.
 */
export const inviteByTag = async ({ orgId, actorId, tag, role }) => {
  const normalized = String(tag || '').trim().toLowerCase();
  if (!normalized) throw httpError(400, 'GlobalPay tag is required.', 'VALIDATION');
  if (!INVITABLE_ROLES.includes(role)) {
    throw httpError(400, `Invalid role. Use one of: ${INVITABLE_ROLES.join(', ')}.`, 'VALIDATION');
  }

  // Find user by tag
  const pool = getPool();
  const { rows: users } = await pool.query(
    'SELECT id, name, email, global_pay_tag FROM profiles WHERE LOWER(global_pay_tag) = $1',
    [normalized]
  );
  if (!users.length) throw httpError(404, `No user found with tag ${normalized}.`, 'USER_NOT_FOUND');
  const target = users[0];

  // Check if already a member (direct DB)
  const { rows: existingMembers } = await pool.query(
    'SELECT id FROM organization_members WHERE organization_id = $1 AND developer_id = $2',
    [orgId, target.id]
  );
  if (existingMembers.length) throw httpError(409, `${normalized} is already a member.`, 'ALREADY_MEMBER');

  // Check for pending invite (direct DB)
  const { rows: dupes } = await pool.query(
    `SELECT id FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND status = 'pending'`,
    [orgId, target.email]
  );
  if (dupes.length) throw httpError(409, 'An invitation to this user is already pending.', 'DUPLICATE_INVITATION');

  // Create invitation token
  const token = `inv_${crypto.randomBytes(24).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  // Insert invitation (direct DB to bypass RLS)
  const { rows: invRows } = await pool.query(
    `INSERT INTO organization_invitations (organization_id, email, role, token, status, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
    [orgId, target.email, role, token, actorId, expiresAt]
  );
  const data = invRows[0];

  // Get org name for notification
  const { rows: orgRows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
  const orgName = orgRows[0]?.name || 'an organization';

  // Get actor info
  const { rows: actorRows } = await pool.query('SELECT name, global_pay_tag FROM profiles WHERE id = $1', [actorId]);
  const actorName = actorRows[0]?.name || 'Someone';
  const actorTag = actorRows[0]?.global_pay_tag || '';

  // Create in-app notification
  await createNotification({
    recipientId: target.id,
    senderId: actorId,
    type: 'org_invitation',
    title: `${actorName} invited you to ${orgName}`,
    body: `${actorTag} invited you as a ${role}.
Click to accept or decline.`,
    data: { orgId, orgName, role, token, inviterName: actorName, inviterTag: actorTag },
    actionUrl: `/accept-invite/${orgId}/${token}`
  });

  return {
    id: data.id,
    tag: target.global_pay_tag,
    name: target.name,
    role,
    token,
    status: 'pending',
    expiresAt,
    notificationCreated: true
  };
};
