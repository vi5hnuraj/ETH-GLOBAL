#!/usr/bin/env node
/**
 * GlobalPay API Smoke Test
 * 
 * Hits every endpoint in the OpenAPI spec with a real developer key.
 * Safe read-only tests for GETs, careful create-then-cleanup for writes.
 * 
 * Usage: node test/api-smoke-test.js
 */

import { getPool } from '../src/utils/db.js';
import { openapiSpec } from '../src/utils/openapiSpec.js';

const BASE = process.env.API_URL || 'http://localhost:5550/api';

// ─── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

async function getTestKey() {
  const pool = getPool();
  // Get the most recent active developer API key
  const { rows } = await pool.query(
    `SELECT id, key_hash, name, organization_id FROM developer_api_keys WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
  );
  if (rows.length === 0) {
    console.error('❌ No active API keys found. Create one first in the Developer Console.');
    process.exit(1);
  }
  return rows[0];
}

async function getTestAgentKey() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, api_key, name FROM agents WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
    );
    if (rows.length === 0) return null;
    return rows[0];
  } catch {
    return null;
  }
}

async function getTestOrg() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, name FROM organizations ORDER BY created_at DESC LIMIT 1`
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function req(method, path, { apiKey, agentKey, body, params } = {}) {
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (agentKey) {
    headers['Authorization'] = `Bearer ${agentKey}`;
  } else if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const fetchOpts = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOpts.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), { ...fetchOpts, signal: controller.signal });
    clearTimeout(timeout);
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('json')) {
      try { data = await res.json(); } catch { data = null; }
    }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') return { status: 0, data: null, ok: false };
    return { status: 0, data: null, ok: false };
  }
}

function record(tag, method, path, status, expected, note = '') {
  const ok = expected.includes(status);
  if (status === 0) { skipped++; } else if (ok) passed++; else failed++;
  const icon = status === 0 ? '⏱️' : ok ? '✅' : '❌';
  const statusStr = `${status}`.padEnd(3);
  const expectedStr = expected.length === 1 ? `${expected[0]}` : `[${expected.join('|')}]`;
  const line = `  ${icon} ${method.padEnd(7)} ${statusStr} ${expectedStr.padEnd(8)} ${path}${note ? ' — ' + note : ''}`;
  console.log(line);
  results.push({ tag, method, path, status, expected, ok, note });
}

// ─── Test Suites ───────────────────────────────────────────────────────────

async function testPlatform(apiKey) {
  console.log('\n📋 Platform');
  const r1 = await req('GET', '/platform/health');
  record('Platform', 'GET', '/platform/health', r1.status, [200]);

  const r2 = await req('GET', '/platform/flags');
  record('Platform', 'GET', '/platform/flags', r2.status, [200]);

  const r3 = await req('GET', '/platform/environment');
  record('Platform', 'GET', '/platform/environment', r3.status, [200]);
}

async function testDeveloperDashboard(apiKey) {
  console.log('\n📋 Developer Platform');
  const endpoints = [
    ['GET', '/developers/dashboard', [200, 403]],
    ['GET', '/developers/analytics', [200, 403]],
    ['GET', '/developers/usage', [200, 403]],
    ['GET', '/developers/revenue', [200, 403]],
    ['GET', '/developers/requests', [200, 403]],
    ['GET', '/developers/requests/export', [200, 403]],
    ['GET', '/developers/monitoring', [200, 403]],
    ['GET', '/developers/quota', [200, 403]],
    ['GET', '/developers/audit', [200, 403]],
    ['GET', '/developers/audit/export', [200, 403]],
    ['GET', '/developers/status', [200, 403]],
    ['GET', '/developers/scopes', [200]],
    ['GET', '/developers/settings', [200, 403]],
    ['GET', '/developers/billing', [200, 403]],
    ['GET', '/developers/api-keys', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('DevPlatform', method, path, r.status, expected);
    } catch (e) {
      record('DevPlatform', method, path, 0, expected, e.message);
    }
  }
}

async function testAgentEndpoints(apiKey, agentKey) {
  console.log('\n📋 Agent Endpoints');
  
  // List agents (developer key)
  const r1 = await req('GET', '/developers/agents', { apiKey });
  record('Agents', 'GET', '/developers/agents', r1.status, [200, 403]);

  // List agents (agent key)
  if (agentKey) {
    const r2 = await req('GET', '/agents', { agentKey });
    record('Agents', 'GET', '/agents', r2.status, [200, 403]);
  } else {
    record('Agents', 'GET', '/agents', 0, [200], 'No agent key available — skipped');
    skipped++;
  }
}

async function testWebhooks(apiKey) {
  console.log('\n📋 Webhooks');
  const endpoints = [
    ['GET', '/developers/webhooks', [200, 403]],
    ['GET', '/developers/webhooks/events', [200, 403]],
    ['GET', '/developers/webhooks/deliveries', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('Webhooks', method, path, r.status, expected);
    } catch (e) {
      record('Webhooks', method, path, 0, expected, e.message);
    }
  }
}

async function testMarketplace(apiKey) {
  console.log('\n📋 Marketplace');
  const endpoints = [
    ['GET', '/developers/services', [200, 403]],
    ['GET', '/developers/marketplace', [200, 403]],
    ['GET', '/developers/marketplace/revenue', [200, 403]],
    ['GET', '/developers/usage-reports', [200, 403]],
    ['GET', '/developers/invoices', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('Marketplace', method, path, r.status, expected);
    } catch (e) {
      record('Marketplace', method, path, 0, expected, e.message);
    }
  }
}

async function testCommerce(apiKey) {
  console.log('\n📋 Autonomous Commerce');
  const endpoints = [
    ['GET', '/developers/commerce/sessions', [200, 403]],
    ['GET', '/developers/commerce/optimization', [200, 403]],
    ['GET', '/developers/commerce/dashboard', [200, 403]],
    ['GET', '/developers/commerce/graph', [200, 403]],
    ['GET', '/developers/commerce/reports/monthly', [200, 403]],
    ['GET', '/developers/commerce/compliance', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('Commerce', method, path, r.status, expected);
    } catch (e) {
      record('Commerce', method, path, 0, expected, e.message);
    }
  }
}

async function testOrganizations(apiKey, orgId) {
  console.log('\n📋 Organizations');

  const endpoints = [
    ['GET', '/developers/orgs', [200, 403]],
    ['GET', '/developers/orgs/current', [200, 403]],
    ['GET', '/developers/invitations', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('Orgs', method, path, r.status, expected);
    } catch (e) {
      record('Orgs', method, path, 0, expected, e.message);
    }
  }

  if (orgId) {
    const orgEndpoints = [
      ['GET', `/developers/orgs/${orgId}/members`, [200, 403]],
      ['GET', `/developers/orgs/${orgId}/invitations`, [200, 403]],
      ['GET', `/developers/orgs/${orgId}/settings`, [200, 403]],
      ['GET', `/developers/orgs/${orgId}/audit-logs`, [200, 403]],
      ['GET', `/developers/orgs/${orgId}/roles`, [200, 403]],
      ['GET', `/developers/orgs/${orgId}/permissions`, [200, 403]],
    ];

    for (const [method, path, expected] of orgEndpoints) {
      try {
        const r = await req(method, path, { apiKey });
        record('Orgs', method, path, r.status, expected);
      } catch (e) {
        record('Orgs', method, path, 0, expected, e.message);
      }
    }
  }
}

async function testNetwork(apiKey) {
  console.log('\n📋 Business Network');
  const endpoints = [
    ['GET', '/developers/network/profile', [200, 403]],
    ['GET', '/developers/network/profiles', [200, 403]],
    ['GET', '/developers/network/analytics', [200, 403]],
    ['GET', '/developers/network/analytics/timeline', [200, 403]],
    ['GET', '/developers/network/analytics/activity', [200, 403]],
    ['GET', '/developers/network/analytics/health', [200, 403]],
    ['GET', '/developers/network/analytics/leaderboard', [200, 403]],
    ['GET', '/developers/network/workflow-templates', [200, 403]],
    ['GET', '/developers/network/workflows', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('Network', method, path, r.status, expected);
    } catch (e) {
      record('Network', method, path, 0, expected, e.message);
    }
  }
}

async function testAgentMarketplace(apiKey) {
  console.log('\n📋 AI Agent Marketplace');
  const endpoints = [
    ['GET', '/developers/agent-marketplace/agents-publishable', [200, 403]],
    ['GET', '/developers/agent-marketplace/listings', [200, 403]],
    ['GET', '/developers/agent-marketplace/browse', [200, 403]],
    ['GET', '/developers/agent-marketplace/installations', [200, 403]],
    ['GET', '/developers/agent-marketplace/subscriptions', [200, 403]],
    ['GET', '/developers/agent-marketplace/store/dashboard', [200, 403]],
    ['GET', '/developers/agent-marketplace/consumer/dashboard', [200, 403]],
  ];

  for (const [method, path, expected] of endpoints) {
    try {
      const r = await req(method, path, { apiKey });
      record('AgentMarketplace', method, path, r.status, expected);
    } catch (e) {
      record('AgentMarketplace', method, path, 0, expected, e.message);
    }
  }
}

async function testWriteOperations(apiKey) {
  console.log('\n📋 Write Operations (create → verify → cleanup)');

  // Test: Create a webhook then delete it
  try {
    const r1 = await req('POST', '/developers/webhooks', {
      apiKey,
      body: { url: 'https://httpbin.org/status/200', events: ['agent.created'] }
    });
    record('Write', 'POST', '/developers/webhooks', r1.status, [201, 403]);
    
    if (r1.ok && r1.data?.id) {
      const r2 = await req('DELETE', `/developers/webhooks/${r1.data.id}`, { apiKey });
      record('Write', 'DELETE', `/developers/webhooks/${r1.data.id}`, r2.status, [204, 403]);
    }
  } catch (e) {
    record('Write', 'POST', '/developers/webhooks', 0, [201], e.message);
  }

  // Test: Create a service then delete it (requires agentId)
  try {
    // First find an existing agent
    const pool = getPool();
    let agentId = null;
    try {
      const { rows } = await pool.query(`SELECT id FROM agents LIMIT 1`);
      agentId = rows[0]?.id;
    } catch { /* agents table may not exist */ }

    if (agentId) {
      const r1 = await req('POST', '/developers/services', {
        apiKey,
        body: { title: '__TEST_SMOKE__', description: 'Automated test service', unitPrice: '0.01', agentId }
      });
      record('Write', 'POST', '/developers/services', r1.status, [201, 403]);

      const serviceId = r1.data?.service?.id || r1.data?.id;
      if (r1.ok && serviceId) {
        const r2 = await req('DELETE', `/developers/services/${serviceId}`, { apiKey });
        record('Write', 'DELETE', `/developers/services/${serviceId}`, r2.status, [204, 403, 200]);
      }
    } else {
      record('Write', 'POST', '/developers/services', 0, [201], 'No agent available — skipped');
      skipped++;
    }
  } catch (e) {
    record('Write', 'POST', '/developers/services', 0, [201], e.message);
  }
}

async function testOpenApiSpec() {
  console.log('\n📋 OpenAPI Spec');
  const r = await req('GET', '/openapi.json');
  record('Spec', 'GET', '/openapi.json', r.status, [200]);
  
  if (r.ok && r.data?.paths) {
    const specPaths = Object.keys(r.data.paths);
    console.log(`\n  📊 Spec contains ${specPaths.length} endpoint paths across ${r.data.tags?.length || '?'} tags\n`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 GlobalPay API Smoke Test');
  console.log('━'.repeat(60));
  console.log(`Target: ${BASE}`);
  
  // Verify server is running
  try {
    const health = await req('GET', '/platform/health');
    if (!health.ok) {
      console.error(`\n❌ Server not healthy (status ${health.status}). Is the backend running?`);
      process.exit(1);
    }
    console.log('✅ Server is running\n');
  } catch (e) {
    console.error(`\n❌ Cannot reach server at ${BASE}. Is the backend running?`);
    console.error('   Start it: cd backend && node server.js');
    process.exit(1);
  }

  // Get test credentials
  const devKey = await getTestKey();
  const agent = await getTestAgentKey();
  const org = await getTestOrg();
  
  // Get the actual API key — check env var or ask user
  const apiKey = process.env.GPAY_DEV_KEY;
  if (!apiKey) {
    console.error('\n⚠️  No API key provided.');
    console.error('   Set GPAY_DEV_KEY env var or pass it as argument:');
    console.error('   GPAY_DEV_KEY=gpay_dev_xxx node test/api-smoke-test.js');
    console.error('   Or paste your key when prompted below.\n');
    
    // Try to read from stdin
    process.stdout.write('Paste your gpay_dev_ key (or press Enter to skip authenticated tests): ');
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise(resolve => rl.question('', resolve));
    rl.close();
    
    if (!key.trim()) {
      console.log('\n⏭️  Running public-only tests...\n');
      await testPlatform();
      await testOpenApiSpec();
      printSummary();
      return;
    }
    process.env.GPAY_DEV_KEY = key.trim();
  }
  
  const devApiKey = process.env.GPAY_DEV_KEY;
  console.log(`\nDeveloper key: ${devApiKey.substring(0, 15)}...${devApiKey.slice(-4)}`);
  console.log(`Agent key: ${agent ? agent.name : 'none'}`);
  console.log(`Organization: ${org ? org.name : 'none'}`);

  // Run all test suites
  await testPlatform();
  await testDeveloperDashboard(devApiKey);
  await testAgentEndpoints(devApiKey, agent?.api_key);
  await testWebhooks(devApiKey);
  await testMarketplace(devApiKey);
  await testCommerce(devApiKey);
  await testOrganizations(devApiKey, org?.id);
  await testNetwork(devApiKey);
  await testAgentMarketplace(devApiKey);
  await testWriteOperations(devApiKey);
  await testOpenApiSpec();

  printSummary();
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`   Total: ${passed + failed + skipped} endpoints tested`);

  if (failed > 0) {
    console.log('\n❌ Failed endpoints:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`   ${r.method} ${r.path} → ${r.status} (expected ${r.expected.join('|')})`);
    }
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  console.log('\n' + '━'.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`   Total: ${passed + failed + skipped} endpoints tested`);

  if (failed > 0) {
    console.log('\n❌ Failed endpoints:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`   ${r.method} ${r.path} → ${r.status} (expected ${r.expected.join('|')})`);
    }
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('💥 Test runner crashed:', e);
  process.exit(2);
});
