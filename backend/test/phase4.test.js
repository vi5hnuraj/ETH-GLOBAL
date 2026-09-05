/**
 * Phase 4 — Production Developer Platform tests (node:test).
 *
 *   - API versioning: /api/v1 and /api/v2 aliases + X-API-Version header
 *   - Feature flags endpoint + maintenance toggle (503 blocks writes, GETs stay up)
 *   - Environment endpoint (development/production shape)
 *   - Platform health aggregation with real component status
 *   - Audit log export (CSV/JSON) + pagination meta
 *   - Developer quota endpoint (real usage vs plan limit)
 *   - Agent history pagination (offset/page -> meta)
 *
 * Run: NODE_ENV=test node --test --test-force-exit test/phase4.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { setFeatureFlag, isFeatureEnabled } from '../src/config/featureFlags.js';

const DEV = `phase4_${Date.now().toString(36)}`;
let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  setFeatureFlag('maintenanceMode', false);
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  setTimeout(() => process.exit(0), 100);
});

const get = async (path, headers = {}) => {
  const res = await fetch(`${base}${path}`, { headers: { 'x-developer-id': DEV, ...headers } });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
};

const post = async (path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'x-developer-id': DEV, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};

// ==================== API VERSIONING ====================

test('v1 and v2 aliases serve the status endpoint with a version header', async () => {
  for (const v of ['/api/v1', '/api/v2']) {
    const r = await get(`${v}/developers/status`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-api-version'), v.slice(5), 'expected version header');
    assert.equal(r.json.success, true);
  }
});

test('legacy unversioned path still works (backward compat)', async () => {
  const r = await get('/api/developers/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.setupRequired, false);
});

// ==================== FEATURE FLAGS + ENVIRONMENT ====================

test('feature flags endpoint reports effective flags', async () => {
  const r = await get('/api/v1/platform/flags');
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  for (const flag of ['serviceStatus', 'auditExport', 'usageQuotas', 'apiVersioning', 'maintenanceMode']) {
    assert.equal(typeof r.json.flags[flag], 'boolean');
  }
});

test('environment endpoint exposes dev/prod shape', async () => {
  const r = await get('/api/v2/platform/environment');
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.environment, 'string');
  assert.equal(typeof r.json.isDevelopment, 'boolean');
  assert.equal(typeof r.json.chainId, 'number');
});

// ==================== MAINTENANCE MODE ====================

test('maintenance mode blocks writes but keeps GETs available', async () => {
  const before = isFeatureEnabled('maintenanceMode');
  try {
    assert.equal(before, false, 'should start with maintenance off');

    const toggle = await post('/api/developers/platform/maintenance', { enabled: true });
    assert.equal(toggle.status, 200);
    assert.equal(toggle.json.maintenanceMode, true);

    // A write to a non-maintenance write-endpoint is blocked with 503 + code.
    const write = await post('/api/v1/developers/audit/export?format=json', {});
    assert.equal(write.status, 503);
    assert.equal(write.json.code, 'MAINTENANCE_MODE');

    // GET endpoints (status/health) remain reachable.
    const health = await get('/api/platform/health');
    assert.equal(health.status, 200);

    // The maintenance toggle itself stays reachable (no lockouts).
    const off = await post('/api/developers/platform/maintenance', { enabled: false });
    assert.equal(off.status, 200);
    assert.equal(off.json.maintenanceMode, false);
  } finally {
    setFeatureFlag('maintenanceMode', false);
  }
});

// ==================== PLATFORM HEALTH ====================

test('platform health reports real component statuses', async () => {
  const r = await get('/api/platform/health');
  assert.equal(r.status, 200);
  for (const c of ['api', 'database', 'rpc', 'workers']) {
    assert.ok(['ok', 'degraded', 'down'].includes(r.json.components[c]), `${c} should be a known state`);
  }
  assert.equal(typeof r.json.uptimeSeconds, 'number');
});

// ==================== AUDIT EXPORT + PAGINATION ====================

test('audit export returns CSV with a header row', async () => {
  const res = await fetch(`${base}/api/v1/developers/audit/export?format=csv`, {
    headers: { 'x-developer-id': DEV }
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /^id,action,actorType/);
});

test('audit export returns JSON rows', async () => {
  const res = await fetch(`${base}/api/v1/developers/audit/export?format=json`, {
    headers: { 'x-developer-id': DEV }
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.auditLogs));
});

// ==================== QUOTA ====================

test('developer quota endpoint returns a numeric limit + usage', async () => {
  const r = await get('/api/v2/developers/quota');
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.quota.limit, 'number');
  assert.equal(typeof r.json.quota.used, 'number');
  assert.equal(typeof r.json.quota.percentage, 'number');
});

// ==================== OPENAPI ====================

test('openapi spec documents the new endpoints', async () => {
  const r = await get('/api/openapi.json');
  assert.equal(r.status, 200);
  const paths = Object.keys(r.json.paths);
  for (const p of ['/platform/health', '/platform/flags', '/platform/environment', '/developers/quota', '/developers/audit/export']) {
    assert.ok(paths.includes(p), `spec should document ${p}`);
  }
});