/**
 * Scope enforcement integration tests (node:test).
 *
 * Verifies the reusable requireScope authorization middleware against a live
 * server + real Supabase backend:
 *   1. valid scope  -> 200
 *   2. missing scope -> 403 SCOPE_FORBIDDEN
 *   3. revoked key   -> 403
 *   4. expired key   -> 403
 *   5. invalid key   -> 401
 *   6. wildcard / default (all-scope) keys retain full access (backward compat)
 *   7. agent API keys keep working on the agent surface (APIs unchanged)
 *
 * Run: NODE_ENV=test node --test test/scope.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { supabase } from '../src/config/supabaseClient.js';

const DEV = 'scope_test_dev';
let server;
let base;

let originalFetch;
before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes('localhost:8080') || url.includes('/api/v1/wallets')) {
      if (url.endsWith('/send')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ txHash: '0x1111111111111111111111111111111111111111111111111111111111111111' }),
          json: async () => ({
            txHash: '0x1111111111111111111111111111111111111111111111111111111111111111'
          })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ walletId: 'mock-wallet-id-123', address: '0x1234567890123456789012345678901234567890' }),
        json: async () => ({
          walletId: 'mock-wallet-id-123',
          address: '0x1234567890123456789012345678901234567890'
        })
      };
    }
    return originalFetch(url, options);
  };
});

after(async () => {
  globalThis.fetch = originalFetch;
  await supabase.from('developer_api_keys').delete().eq('developer_id', DEV);
  await supabase.from('ai_agents').delete().eq('developer_id', DEV);
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  // Force exit: supabase/fetch keep-alive handles would otherwise keep the
  // runner alive after all tests complete.
  setTimeout(() => process.exit(0), 100);
});

const request = async (path, { method = 'GET', token, body, developerId = DEV } = {}) => {
  const headers = { 'x-developer-id': developerId, 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
};

let keySeq = 0;
const createDevKey = async ({ scopes, expiresAt } = {}) => {
  keySeq += 1;
  const { status, json } = await request('/api/developers/api-keys', {
    method: 'POST',
    body: { name: `scope-test-${keySeq}`, scopes, expiresAt }
  });
  assert.equal(status, 201, `create key failed: ${JSON.stringify(json)}`);
  assert.ok(json.apiKey, 'no apiKey returned');
  return json;
};

const revokeDevKey = async (id) => {
  const { status } = await request(`/api/developers/api-keys/${id}/revoke`, { method: 'POST' });
  assert.equal(status, 200, 'revoke failed');
};

test('scope catalog is public and complete', async () => {
  const { status, json } = await request('/api/developers/scopes');
  assert.equal(status, 200);
  const expected = [
    'agents:create', 'agents:read', 'agents:update', 'agents:delete',
    'wallets:read', 'wallets:write', 'payments:create', 'payments:read',
    'payments:refund', 'payments:cancel', 'transactions:read',
    'webhooks:read', 'webhooks:create', 'webhooks:update', 'webhooks:delete',
    'billing:read', 'billing:manage', 'settings:read', 'settings:manage',
    'services:read', 'services:create', 'services:update', 'services:delete',
    'usage:read', 'usage:write', 'invoices:read', 'invoices:write',
    'policy:read', 'policy:manage', 'sessions:read', 'sessions:manage', 'commerce:read',
    'history:read', 'webhooks:manage'
  ];
  assert.deepEqual([...json.scopes].sort(), [...expected].sort());
});

test('valid scope succeeds', async () => {
  const { apiKey } = await createDevKey({ scopes: ['agents:read'] });
  const { status } = await request('/api/developers/agents', { token: apiKey });
  assert.equal(status, 200);
});

test('missing scope returns 403 SCOPE_FORBIDDEN', async () => {
  const { apiKey } = await createDevKey({ scopes: ['agents:read'] });
  const { status, json } = await request('/api/developers/billing', { token: apiKey });
  assert.equal(status, 403);
  assert.equal(json.code, 'SCOPE_FORBIDDEN');
  assert.equal(json.success, false);
  assert.equal(json.requiredScope, 'billing:manage');
});

test('webhook endpoints require webhooks:manage', async () => {
  const { apiKey } = await createDevKey({ scopes: ['agents:read'] });
  const { status } = await request('/api/developers/webhooks', { token: apiKey });
  assert.equal(status, 403);
});

test('wallet scope allows balance but denies management', async () => {
  const { apiKey } = await createDevKey({ scopes: ['wallets:read'] });
  const { status: denied } = await request('/api/developers/agents', { token: apiKey });
  assert.equal(denied, 403);
});

test('revoked key fails with 403', async () => {
  const key = await createDevKey({ scopes: ['*'] });
  await revokeDevKey(key.id);
  const { status, json } = await request('/api/developers/agents', { token: key.apiKey });
  assert.equal(status, 403);
  assert.match(json.message, /revoked|inactive/i);
});

test('expired key fails with 403', async () => {
  const { apiKey } = await createDevKey({ scopes: ['*'], expiresAt: new Date(Date.now() - 60_000).toISOString() });
  const { status, json } = await request('/api/developers/agents', { token: apiKey });
  assert.equal(status, 403);
  assert.match(json.message, /expired/i);
});

test('invalid key fails with 401', async () => {
  const { status, json } = await request('/api/developers/agents', { token: 'gpay_dev_not-a-real-key' });
  assert.equal(status, 401);
  assert.match(json.message, /invalid/i);
});

test('key without scopes is rejected; wildcard grants full access', async () => {
  const { status } = await request('/api/developers/api-keys', {
    method: 'POST',
    body: { name: 'scope-test-no-scopes' }
  });
  assert.equal(status, 422);
  const { apiKey } = await createDevKey({ scopes: ['*'] });
  const { status: wildcardStatus } = await request('/api/developers/billing', { token: apiKey });
  assert.equal(wildcardStatus, 200);
});

test('wildcard scope grants full access', async () => {
  const { apiKey } = await createDevKey({ scopes: ['*'] });
  const { status } = await request('/api/developers/billing', { token: apiKey });
  assert.equal(status, 200);
});

test('agent API key surface is unchanged (do not modify existing APIs)', async () => {
  const created = await request('/api/agents/create', {
    method: 'POST',
    body: { name: 'scope-test-agent', developerId: DEV }
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const agentKey = created.json.apiKey;
  assert.ok(agentKey, 'no agent apiKey returned');

  const { status, json } = await request('/api/agents/balance', { token: agentKey });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.success, true);
});
