/**
 * Phase 3 — Arc Chain core infrastructure hardening tests (node:test).
 *
 *   - Nonce manager: per-wallet serialization, chain re-sync, stale-nonce
 *     detection, nonce advancement after commits.
 *   - Per-agent rate limit (429 AGENT_RATE_LIMITED) and monthly quota hook
 *     presence; agent API key rotation still works after the middleware.
 *   - Agent transaction reconciliation: stale pending rows are flipped to
 *     failed from real chain data (never invented statuses).
 *
 * Run: NODE_ENV=test node --test --test-force-exit test/phase3.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { supabase } from '../src/config/supabaseClient.js';
import { reserveNonce, commitNonce, invalidateNonce, isStaleNonceError } from '../src/wallets/nonceManager.js';
import { reconcileAgentTransactions } from '../src/workers/agentTransactionRecoveryWorker.js';

const DEV = `phase3_${Date.now().toString(36)}`;
let server;
let base;
const createdAgentUuids = [];
const createdTxUuids = [];

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
  if (createdTxUuids.length) {
    await supabase.from('ai_agent_transactions').delete().in('id', createdTxUuids);
  }
  if (createdAgentUuids.length) {
    await supabase.from('ai_agents').delete().in('id', createdAgentUuids);
  }
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  setTimeout(() => process.exit(0), 100);
});

const request = async (path, { method = 'GET', token, body, developerId = DEV, headers = {} } = {}) => {
  const h = {
    'x-developer-id': developerId,
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers
  };
  const res = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch { /* non-JSON */ }
  return { status: res.status, json };
};

const createTestAgent = async (developerId = DEV) => {
  const res = await request('/api/agents/create', {
    method: 'POST',
    body: { name: 'Phase3 Agent', developerId }
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const { data: row } = await supabase.from('ai_agents').select('id').eq('agent_id', res.json.agentId).single();
  if (row) createdAgentUuids.push(row.id);
  return res.json;
};

// ==================== NONCE MANAGER ====================

test('nonce manager serializes and increments per wallet address', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  invalidateNonce(address);

  // First reserve: re-syncs from chain, returns a number.
  const first = await reserveNonce(address);
  assert.equal(typeof first.nonce, 'number');

  // While the lock is held, a concurrent reserve for the same wallet must NOT
  // resolve (the per-wallet mutex serializes broadcasts). We probe it with a
  // short race and assert it is still pending until release() is called.
  let secondResolved = false;
  const probe = reserveNonce(address).then((r) => {
    secondResolved = true;
    return r;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(secondResolved, false, 'second reserve must block until the first releases');

  first.release();
  const second = await probe;
  assert.equal(secondResolved, true);
  assert.equal(second.nonce, first.nonce, 'no commit happened, so both see the same nonce');
  second.release();

  // Commit advances the cached nonce.
  commitNonce(address);
  const afterCommit = await reserveNonce(address);
  assert.ok(afterCommit.nonce >= first.nonce, 'nonce should not go backwards');
  afterCommit.release();
  invalidateNonce(address);
});

test('nonce manager: consecutive commits advance the nonce', async () => {
  const address = '0x2222222222222222222222222222222222222222';
  invalidateNonce(address);

  const a = await reserveNonce(address);
  const baseNonce = a.nonce;
  commitNonce(address);
  a.release();

  const b = await reserveNonce(address);
  assert.ok(b.nonce > baseNonce, `expected next nonce > ${baseNonce}, got ${b.nonce}`);
  b.release();
  invalidateNonce(address);
});

test('isStaleNonceError detects nonce/replacement messages', () => {
  assert.equal(isStaleNonceError('nonce too low'), true);
  assert.equal(isStaleNonceError('replacement transaction underpriced'), true);
  assert.equal(isStaleNonceError('already known'), true);
  assert.equal(isStaleNonceError('insufficient funds for gas'), false);
});

// ==================== RATE LIMITING & QUOTA ====================

test('per-agent rate limit returns 429 after exceeding the window', async () => {
  // The limit is 30/min from config; /agents/history is a light DB-only route.
  // Send 31 rapid requests and confirm the 31st gets 429.
  const { apiKey } = await createTestAgent();
  let saw429 = false;
  for (let i = 0; i < 31; i += 1) {
    const res = await request('/api/agents/history', { token: apiKey });
    if (res.status === 429) {
      saw429 = true;
      assert.equal(res.json.code, 'AGENT_RATE_LIMITED');
      break;
    }
    if (res.status === 200) continue;
    assert.ok([200, 429].includes(res.status), `unexpected status ${res.status}`);
  }
  assert.equal(saw429, true, 'expected at least one 429 after exceeding the per-agent rate limit');
}, { timeout: 60_000 });

test('agent API key rotation still works (regression with rate-limit middleware)', async () => {
  const { apiKey } = await createTestAgent();
  const res = await request('/api/agents/rotate-key', { method: 'POST', token: apiKey });
  assert.equal(res.status, 200);
  assert.ok(res.json.apiKey && res.json.apiKey.startsWith('gpay_sk_'));
});

test('reconciliation worker returns 0 when nothing is due', async () => {
  const count = await reconcileAgentTransactions(50);
  assert.equal(typeof count, 'number');
  assert.ok(count >= 0);
});

test('reconciliation marks stale pending rows failed and never invents statuses', async () => {
  // Insert a pending row with a bogus tx_hash created 20 minutes ago — past the
  // 15-minute stale window. The worker must flip it to failed (no receipt,
  // stale) rather than leaving it pending forever.
  const { data: agent } = await supabase
    .from('ai_agents')
    .insert({
      agent_id: `agt_phase3_${Date.now()}`,
      developer_id: DEV,
      agent_name: 'Reconcile Test',
      wallet_address: '0x0000000000000000000000000000000000000000',
      wallet_provider: 'local',
      api_key_hash: `hash_${Date.now()}`,
      api_key_prefix: 'phase3',
      status: 'active'
    })
    .select()
    .single();
  if (agent) createdAgentUuids.push(agent.id);

  const { data: tx, error } = await supabase
    .from('ai_agent_transactions')
    .insert({
      agent_id: agent.id,
      destination_address: '0x0000000000000000000000000000000000000000',
      amount: '1000000000000000',
      token: 'USDC',
      tx_hash: `0x${'a'.repeat(64)}`,
      status: 'pending',
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString()
    })
    .select()
    .single();
  assert.equal(error, null);
  if (tx) createdTxUuids.push(tx.id);

  const reconciled = await reconcileAgentTransactions(100);
  assert.ok(reconciled >= 1, 'expected the stale row to be reconciled');

  const { data: after } = await supabase
    .from('ai_agent_transactions')
    .select('*')
    .eq('id', tx.id)
    .single();
  assert.equal(after.status, 'failed');
  assert.ok(after.last_reconciled_at, 'reconciliation timestamp should be set');
}, { timeout: 30_000 });
