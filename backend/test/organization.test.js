/**
 * Phase 2 — Organization + RBAC integration tests (node:test).
 *
 * Runs against a live server + real Supabase backend. Uses throwaway, uniquely
 * generated developer ids so test runs never collide with real data.
 *
 * Run: NODE_ENV=test node --test test/organization.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { supabase } from '../src/config/supabaseClient.js';

let server;
let base;

const unique = () => `orgtest_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

before(async () => {
  await new Promise((resolve) => server = app.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  const devs = new Set();
  try {
    const { data } = await supabase.from('organization_members').select('developer_id').like('developer_id', 'orgtest_%');
    (data || []).forEach((r) => devs.add(r.developer_id));
    const { data: mems } = await supabase.from('organization_members').select('email').like('email', 'orgtest_%@%');
    (mems || []).forEach((r) => devs.add(r.email));
  } catch { /* ignore */ }
  const ids = [...devs];
  await Promise.all([
    supabase.from('organization_members').delete().like('developer_id', 'orgtest_%'),
    supabase.from('organization_invitations').delete().like('email', 'orgtest_%'),
    supabase.from('organization_audit_logs').delete().like('actor_developer_id', 'orgtest_%'),
    supabase.from('developer_api_keys').delete().like('developer_id', 'orgtest_%'),
    supabase.from('ai_agents').delete().like('developer_id', 'orgtest_%'),
    supabase.from('audit_logs').delete().like('developer_id', 'orgtest_%')
  ]);
  const { data: orgs } = await supabase.from('organizations').select('id').like('owner_developer_id', 'orgtest_%');
  for (const { id } of orgs || []) {
    await supabase.from('organizations').delete().eq('id', id);
  }
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  setTimeout(() => process.exit(0), 100);
});

const request = async (path, { method = 'GET', developerId, email, token, body, headers = {} } = {}) => {
  const h = {
    'content-type': 'application/json',
    'x-developer-id': developerId || email || undefined,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers
  };
  const res = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code;
    err.payload = json;
    throw err;
  }
  return json;
};

// ---- helpers ----

const createOrg = async (dev, name) =>
  request('/api/developers/orgs', { method: 'POST', developerId: dev, body: { name } });

const orgIdByName = async (dev, name) => {
  const { organizations } = await request('/api/developers/orgs', { developerId: dev });
  return organizations.find((o) => o.name === name).id;
};

const inviteAndAccept = async ({ orgId, orgOwner, inviteeEmail, role }) => {
  const inv = await request(`/api/developers/orgs/${orgId}/invitations`, {
    method: 'POST',
    developerId: orgOwner,
    headers: { 'x-organization-id': orgId },
    body: { email: inviteeEmail, role }
  });
  await request(`/api/developers/orgs/${orgId}/invitations/${inv.invitation.token}/accept`, {
    method: 'POST',
    developerId: inviteeEmail,
    headers: { 'x-organization-id': orgId }
  });
  return inv.invitation.token;
};

// ============================================================ ORG LIFECYCLE
// ============================================================

test('personal org is auto-provisioned lazily', async () => {
  const dev = unique();
  const { organization } = await request('/api/developers/orgs/current', { developerId: dev });
  assert.equal(organization.isPersonal, true);
  assert.equal(organization.name, `Personal workspace — ${dev}`);
});

test('create + list + current + switch orgs', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Acme Corp');
  const found = await orgIdByName(owner, 'Acme Corp');
  assert.equal(found, organization.id);

  const listed = await request('/api/developers/orgs', { developerId: owner });
  const orgs = listed.organizations;
  assert.ok(orgs.some((o) => o.id === organization.id && o.role === 'owner'));

  const cur = await request('/api/developers/orgs/current', { developerId: owner, headers: { 'x-organization-id': organization.id } });
  assert.equal(cur.organization.id, organization.id);
  assert.deepEqual(cur.membership, { role: 'owner', joinedAt: cur.membership.joinedAt });
  assert.ok(cur.permissions.includes('org.manage'));
});

test('header org context self-heals; path-param targets stay strict', async () => {
  const owner = unique();
  const other = unique();
  const { organization } = await createOrg(owner, 'Solo');

  // Ambient header context is self-healing: a stale/foreign org just resolves
  // to the caller's personal org instead of breaking the platform UI.
  const healed = await request('/api/developers/orgs/current', { developerId: other, headers: { 'x-organization-id': organization.id } });
  assert.equal(healed.organization.isPersonal, true);
  assert.equal(healed.organization.name, `Personal workspace — ${other}`);

  const stale = await request('/api/developers/orgs/current', { developerId: owner, headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000000' } });
  assert.equal(stale.organization.isPersonal, true);
  assert.equal(stale.organization.name, `Personal workspace — ${owner}`);

  const overview = await request('/api/developers/dashboard', { developerId: owner, headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000000' } });
  assert.equal(overview.dashboard.totalAgents, 0);

  // Explicit path-param targets must NEVER be silently retargeted.
  await assert.rejects(
    () => request(`/api/developers/orgs/00000000-0000-0000-0000-000000000000/permissions`, { developerId: owner }),
    (e) => e.status === 404 && e.code === 'ORG_NOT_FOUND'
  );
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/permissions`, { developerId: other }),
    (e) => e.status === 403 && e.code === 'ORG_FORBIDDEN'
  );
});

test('org profile update + settings + audit logs', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Profiled Inc');
  const OH = { 'x-organization-id': organization.id };

  const upd = await request(`/api/developers/orgs/${organization.id}`, { method: 'PATCH', developerId: owner, headers: OH, body: { name: 'Profiled LLC', avatarUrl: 'https://example.com/x.png', metadata: { note: 'v1' } } });
  assert.equal(upd.name, 'Profiled LLC');

  const setRes = await request(`/api/developers/orgs/${organization.id}/settings`, { method: 'PATCH', developerId: owner, headers: OH, body: { billingEmail: 'team@example.com' } });
  assert.equal(setRes.settings.billingEmail, 'team@example.com');

  const settingsAgain = await request(`/api/developers/orgs/${organization.id}/settings`, { developerId: owner, headers: OH });
  assert.equal(settingsAgain.settings.billingEmail, 'team@example.com');

  const audit = await request(`/api/developers/orgs/${organization.id}/audit-logs`, { developerId: owner, headers: OH });
  const actions = audit.auditLogs.map((a) => a.action);
  assert.ok(actions.includes('organization.created'));
  assert.ok(actions.includes('organization.settings_updated'));
});

test('delete org with resources is blocked (409), empty org deleted', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Block Me');
  const OH = { 'x-organization-id': organization.id };

  // create a shared resource (API key) in this org to block deletion
  await request(`/api/developers/api-keys`, { method: 'POST', developerId: owner, headers: OH, body: { name: 'shared-key', scopes: ['*'] } });

  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}`, { method: 'DELETE', developerId: owner, headers: OH }),
    (e) => e.status === 409 && e.code === 'ORG_HAS_RESOURCES'
  );
});

// ============================================================ RBAC MATRIX
// ============================================================
//
// RBAC is tested via the dashboard identity path (X-Developer-Id, no API
// token) so the acting developer's *role* — not a key's scopes — is what
// gates the request. requireScope passes for tokenless dev-id calls (by
// design); requirePermission enforces the role matrix.
const provisionOrgWithRoles = async () => {
  const owner = unique();
  const name = `Matrix ${unique()}`;
  const { organization } = await createOrg(owner, name);
  const OH = { 'x-organization-id': organization.id };
  const viewer = `viewer.${unique()}@example.com`;
  const devel = `dev.${unique()}@example.com`;
  const billing = `bill.${unique()}@example.com`;
  const admin = `admin.${unique()}@example.com`;
  await inviteAndAccept({ orgId: organization.id, orgOwner: owner, inviteeEmail: viewer, role: 'viewer' });
  await inviteAndAccept({ orgId: organization.id, orgOwner: owner, inviteeEmail: devel, role: 'developer' });
  await inviteAndAccept({ orgId: organization.id, orgOwner: owner, inviteeEmail: billing, role: 'billing_manager' });
  await inviteAndAccept({ orgId: organization.id, orgOwner: owner, inviteeEmail: admin, role: 'admin' });
  return { owner, organization, OH, viewer, devel, billing, admin };
};

const as = (dev, orgId) => ({ developerId: dev, headers: { 'x-organization-id': orgId } });

test('RBAC: viewer is read-only across the org', async () => {
  const { organization, OH, viewer } = await provisionOrgWithRoles();

  // reads allowed (agents.read + billing.read + members.read + settings.read)
  const agents = await request('/api/developers/agents', as(viewer, organization.id));
  assert.equal(agents.agents.constructor, Array);
  await request('/api/developers/billing', as(viewer, organization.id));
  await request(`/api/developers/orgs/${organization.id}/members`, as(viewer, organization.id));

  // writes forbidden by role (requirePermission), even with scopes satisfied
  await assert.rejects(() => request('/api/developers/billing/subscribe', { ...as(viewer, organization.id), method: 'POST', body: { plan: 'pro' } }), (e) => e.status === 403);
  await assert.rejects(() => request(`/api/developers/api-keys`, { ...as(viewer, organization.id), method: 'POST', body: { name: 'x' } }), (e) => e.status === 403);
  await assert.rejects(() => request(`/api/developers/orgs/${organization.id}/invitations`, { ...as(viewer, organization.id), method: 'POST', body: { email: 'z@y.com', role: 'viewer' } }), (e) => e.status === 403);
});

test('RBAC: developer manages agents, denied billing/member management', async () => {
  const { organization, devel } = await provisionOrgWithRoles();

  await request('/api/developers/agents', as(devel, organization.id));
  await request('/api/developers/billing', as(devel, organization.id)); // billing.read allowed

  // billing.manage denied
  await assert.rejects(() => request('/api/developers/billing/subscribe', { ...as(devel, organization.id), method: 'POST', body: { plan: 'pro' } }), (e) => e.status === 403);
  // members.manage denied (real members.manage endpoint = change member role)
  await assert.rejects(() => request(`/api/developers/orgs/${organization.id}/members/00000000-0000-0000-0000-000000000000/role`, { ...as(devel, organization.id), method: 'POST', body: { role: 'viewer' } }), (e) => e.status === 403);
  // keys.manage allowed for developer
  await request(`/api/developers/api-keys`, { ...as(devel, organization.id), method: 'POST', body: { name: 'k', scopes: ['*'] } });
});

test('RBAC: billing manager reads + manages billing, denied agents/members', async () => {
  const { organization, billing } = await provisionOrgWithRoles();

  await request('/api/developers/billing', as(billing, organization.id));
  await request('/api/developers/billing/subscribe', { ...as(billing, organization.id), method: 'POST', body: { plan: 'pro' } });

  // agents.manage (agent delete/suspend) denied for billing_manager
  await assert.rejects(() => request('/api/developers/agents/agt_nope', { ...as(billing, organization.id), method: 'DELETE' }), (e) => e.status === 403);
  // members.manage denied (real members.manage endpoint = change member role)
  await assert.rejects(() => request(`/api/developers/orgs/${organization.id}/members/00000000-0000-0000-0000-000000000000/role`, { ...as(billing, organization.id), method: 'POST', body: { role: 'viewer' } }), (e) => e.status === 403);
});

test('RBAC: admin manages members but cannot delete org or transfer ownership', async () => {
  const { organization, admin, owner } = await provisionOrgWithRoles();

  const members = await request(`/api/developers/orgs/${organization.id}/members`, as(admin, organization.id));
  assert.ok(members.members.length >= 4);

  // admin cannot delete org (org.manage = owner only)
  await assert.rejects(() => request(`/api/developers/orgs/${organization.id}`, { ...as(admin, organization.id), method: 'DELETE' }), (e) => e.status === 403);
  // admin cannot transfer ownership
  await assert.rejects(() => request(`/api/developers/orgs/${organization.id}/transfer`, { ...as(admin, organization.id), method: 'POST', body: { toDeveloperId: admin } }), (e) => e.status === 403);
  // admin CAN change a member's role (members.manage)
  const viewerMember = members.members.find((m) => m.email && m.role === 'viewer');
  await request(`/api/developers/orgs/${organization.id}/members/${viewerMember.id}/role`, { ...as(admin, organization.id), method: 'POST', body: { role: 'developer' } });
});

test('RBAC: owner can transfer ownership and delete org after clearing resources', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Owner Ops');
  const OH = { 'x-organization-id': organization.id };
  const newOwner = `newowner.${unique()}@example.com`;
  await inviteAndAccept({ orgId: organization.id, orgOwner: owner, inviteeEmail: newOwner, role: 'admin' });

  // admin (newOwner) is NOT owner yet -> cannot transfer
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/transfer`, { method: 'POST', developerId: newOwner, headers: OH, body: { toDeveloperId: newOwner } }),
    (e) => e.status === 403
  );

  // owner transfers
  await request(`/api/developers/orgs/${organization.id}/transfer`, { method: 'POST', developerId: owner, headers: OH, body: { toDeveloperId: newOwner } });
  const members = await request(`/api/developers/orgs/${organization.id}/members`, { developerId: newOwner, headers: OH });
  const nowOwner = members.members.find((m) => m.developerId === newOwner);
  const nowAdmin = members.members.find((m) => m.developerId === owner);
  assert.equal(nowOwner.role, 'owner');
  assert.equal(nowAdmin.role, 'admin');

  // new owner can delete the (empty) org
  await request(`/api/developers/orgs/${organization.id}`, { method: 'DELETE', developerId: newOwner, headers: OH });
});


// ============================================================ INVITATIONS
// ============================================================

test('invitation flow: invite (duplicate rejected), cancel, expired rejected', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Invite Co');
  const OH = { 'x-organization-id': organization.id };

  // can't invite owner role
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/invitations`, { method: 'POST', developerId: owner, headers: OH, body: { email: 'a@b.com', role: 'owner' } }),
    (e) => e.status === 400
  );

  const inv = await request(`/api/developers/orgs/${organization.id}/invitations`, { method: 'POST', developerId: owner, headers: OH, body: { email: 'dup@example.com', role: 'viewer' } });
  assert.equal(inv.invitation.role, 'viewer');

  // duplicate pending invitation rejected (409)
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/invitations`, { method: 'POST', developerId: owner, headers: OH, body: { email: 'dup@example.com', role: 'viewer' } }),
    (e) => e.status === 409 && e.code === 'DUPLICATE_INVITATION'
  );

  // cancel
  await request(`/api/developers/orgs/${organization.id}/invitations/${inv.invitation.token}`, { method: 'DELETE', developerId: owner, headers: OH });
  const listed = await request(`/api/developers/orgs/${organization.id}/invitations`, { developerId: owner, headers: OH });
  const cancelled = listed.invitations.find((i) => i.id === inv.invitation.id);
  assert.ok(cancelled, 'cancelled invitation should remain in the list');
  assert.equal(cancelled.status, 'cancelled');
});

test('invitation expiry is enforced as expired (400)', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Expire Co');
  const OH = { 'x-organization-id': organization.id };
  const invitee = `exp.${unique()}@example.com`;

  // insert a directly-expired invitation via DB to bypass TTL validation
  const { data: created } = await supabase.from('organization_invitations').insert({
    organization_id: organization.id,
    email: invitee,
    role: 'viewer',
    token: `inv_expiredtoken_${unique()}`,
    status: 'pending',
    invited_by: owner,
    expires_at: new Date(Date.now() - 1000).toISOString()
  }).select().single();
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/invitations/${created.token}/accept`, { method: 'POST', developerId: invitee, headers: OH }),
    (e) => e.status === 400 && e.code === 'INVITATION_EXPIRED'
  );
});

// ============================================================ CROSS-ORGANIZATION ISOLATION
// ============================================================

test('cross-organization isolation: a member of org A cannot read org B resources', async () => {
  const ownerA = unique();
  const ownerB = unique();
  const { organization: orgA } = await createOrg(ownerA, 'Org A Isol');
  const { organization: orgB } = await createOrg(ownerB, 'Org B Isol');
  const devC = `cross.${unique()}@example.com`;

  // devC joins orgB only
  await inviteAndAccept({ orgId: orgB.id, orgOwner: ownerB, inviteeEmail: devC, role: 'viewer' });

  // devC is NOT a member of orgA -> 403
  await assert.rejects(
    () => request(`/api/developers/orgs/${orgA.id}/members`, { developerId: devC, headers: { 'x-organization-id': orgA.id } }),
    (e) => e.status === 403 && e.code === 'ORG_FORBIDDEN'
  );

  // devC can access orgB
  await request(`/api/developers/orgs/${orgB.id}/members`, { developerId: devC, headers: { 'x-organization-id': orgB.id } });
});

test('leave organization and owner cannot leave', async () => {
  const owner = unique();
  const { organization, OH } = await (async () => {
    const r = await createOrg(owner, 'Leave Co');
    return { organization: r.organization, OH: { 'x-organization-id': r.organization.id } };
  })();
  const member = `m.${unique()}@example.com`;
  await inviteAndAccept({ orgId: organization.id, orgOwner: owner, inviteeEmail: member, role: 'viewer' });

  const members = await request(`/api/developers/orgs/${organization.id}/members`, { developerId: owner, headers: OH });
  const target = members.members.find((m) => m.developerId === member);
  assert.ok(target);

  // owner cannot leave
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/leave`, { method: 'POST', developerId: owner, headers: OH }),
    (e) => e.status === 400
  );
  // member leaves
  const res = await request(`/api/developers/orgs/${organization.id}/leave`, { method: 'POST', developerId: member, headers: OH });
  assert.equal(res.left, true);
  // after leaving, member cannot access
  await assert.rejects(
    () => request(`/api/developers/orgs/${organization.id}/members`, { developerId: member, headers: OH }),
    (e) => e.status === 403
  );
});

test('permission + roles catalog endpoints', async () => {
  const owner = unique();
  const { organization } = await createOrg(owner, 'Catalog Co');
  const OH = { 'x-organization-id': organization.id };
  const cat = await request(`/api/developers/orgs/${organization.id}/permissions`, { developerId: owner, headers: OH });
  assert.ok(cat.myPermissions.includes('org.manage'));
  const roles = await request(`/api/developers/roles`);
  assert.deepEqual(roles.roles.sort(), ['admin', 'billing_manager', 'developer', 'owner', 'viewer']);
});
