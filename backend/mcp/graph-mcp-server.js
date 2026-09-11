#!/usr/bin/env node

/**
 * GlobalPay x The Graph MCP Server
 * ==================================
 * Model Context Protocol server that exposes GlobalPay's live The Graph
 * settlement data as tools for AI agents (Claude, Cursor, ChatGPT, etc.).
 *
 * Tools:
 *   analyze_provider   — Get The Graph trust/risk data for a wallet address
 *   ask_trust_engine   — Natural-language query over all indexed settlements
 *   graph_status       — Current subgraph sync, indexed block, payment count
 *
 * Usage:
 *   GRAPH_QUERY_URL=https://... GRAPH_API_KEY=... node mcp/graph-mcp-server.js
 *
 * This is a Continuity Track submission for the "Best AI Tooling with The Graph"
 * prize at ETHGlobal.
 */

import http from 'node:http';
import { URL } from 'node:url';

/* ── Configuration ────────────────────────────────────────────── */

const QUERY_URL = process.env.GRAPH_QUERY_URL || '';
const API_KEY = process.env.GRAPH_API_KEY || '';
const DEPLOYMENT_ID = process.env.GRAPH_DEPLOYMENT_ID || '';
const PORT = Number(process.env.MCP_PORT || 8931);
const SCOPE = process.env.GRAPH_NETWORK || 'Arc Testnet';

if (!QUERY_URL || !API_KEY) {
  console.error('❌ GRAPH_QUERY_URL and GRAPH_API_KEY required');
  process.exit(1);
}

/* ── Graph query helper ───────────────────────────────────────── */

const PAYMENT_FIELDS = `
  id transactionHash blockNumber timestamp payer payee amount paymentType
  status releaseTime invoiceReference { id reference }
`;

const graphQuery = async (query, variables = {}) => {
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables })
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(body.errors?.[0]?.message || `Graph error ${res.status}`);
  return body.data || {};
};

/* ── Core logic (same as graphIntelligenceService) ────────────── */

const loadSnapshot = async () => {
  const MAX_PAGES = 5;
  const PAGE_SIZE = 1000;
  const payments = [];
  let lastId = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const isFirst = lastId == null;
    const data = await graphQuery(isFirst
      ? `{ payments(first: ${PAGE_SIZE}, orderBy: blockNumber, orderDirection: desc) { ${PAYMENT_FIELDS} } _meta { block { number } deployment } }`
      : `{ payments(first: ${PAGE_SIZE}, where: { blockNumber_lt: $lastBlock }, orderBy: blockNumber, orderDirection: desc) { ${PAYMENT_FIELDS} } }`,
      isFirst ? {} : { lastId }
    );
    payments.push(...(data.payments || []));
    if ((data.payments || []).length < PAGE_SIZE) break;
    lastId = data.payments[data.payments.length - 1].id;
  }
  return { payments, meta: payments.length > 0 ? { block: { number: null }, deployment: DEPLOYMENT_ID } : {} };
};

const providerAddress = (input) => {
  const s = String(input || '').toLowerCase().trim();
  if (s.startsWith('0x') || s.length === 42) return s;
  return s;
};

const amount = (v) => { try { return Number(v || '0') / 1e18; } catch { return 0; } };

const analyzeProvider = (addr, snap, humanBacked = false, publisherContext = null) => {
  const address = providerAddress(addr);
  const rows = (snap || []).filter((p) => String(p.payee || '').toLowerCase() === address);
  const successfulRows = rows.filter((p) => ['HELD', 'RELEASED'].includes(String(p.status).toUpperCase()));
  const failedRows = rows.filter((p) => String(p.status).toUpperCase() === 'FAILED');
  const total = rows.length;
  const successRate = total ? successfulRows.length / total : 0;
  const volume = rows.reduce((s, p) => s + amount(p.amount), 0);
  const successfulVolume = successfulRows.reduce((s, p) => s + amount(p.amount), 0);
  const uniquePayerSet = new Set(rows.map((p) => String(p.payer || '').toLowerCase()).filter(Boolean));
  const amounts = rows.map((p) => amount(p.amount)).filter((a) => a > 0).sort((a, b) => a - b);
  const medianPayment = amounts.length ? (amounts.length % 2 === 0 ? (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2 : amounts[Math.floor(amounts.length / 2)]) : 0;
  const timestamps = rows.map((p) => Number(p.timestamp || 0)).filter(Boolean).sort((a, b) => a - b);
  const lastTimestamp = timestamps.length ? timestamps[timestamps.length - 1] : null;
  const secondsSinceLast = lastTimestamp ? Math.floor(Date.now() / 1000 - lastTimestamp) : null;
  const last7 = timestamps.filter((t) => t > Math.floor(Date.now() / 1000 - 7 * 86400)).length;
  const repeatPayers = rows.filter((p) => {
    const count = rows.filter((r) => String(r.payer || '').toLowerCase() === String(p.payer || '').toLowerCase()).length;
    return count > 1;
  }).length > 0 ? [...uniquePayerSet].filter((p) => rows.filter((r) => String(r.payer || '').toLowerCase() === p).length > 1).length : 0;

  let trust = 0;
  trust += successRate * 40;
  trust += Math.min(1, uniquePayerSet.size / 10) * 15;
  trust += Math.min(1, successfulRows.length / 25) * 15;
  if (secondsSinceLast != null && secondsSinceLast < 86400) trust += 15;
  else if (secondsSinceLast != null && secondsSinceLast < 7 * 86400) trust += 10;
  else if (secondsSinceLast != null && secondsSinceLast < 30 * 86400) trust += 5;
  trust += Math.min(1, last7 / 5) * 15;
  trust = Math.max(0, Math.min(100, Math.round(trust)));

  if (humanBacked && trust < 25) trust = 25;
  else if (humanBacked && trust > 0) trust = Math.min(100, trust + 5);

  const riskFlags = [];
  if (total < 3) riskFlags.push({ code: 'new_provider', detail: 'Fewer than 3 indexed payments' });
  if (uniquePayerSet.size <= 1 && total >= 3) riskFlags.push({ code: 'single_payer', detail: 'All payments from one buyer' });
  if (failedRows.length > 0 && failedRows.length / total > 0.5) riskFlags.push({ code: 'failure_dominant', detail: 'Over 50% failed payments' });
  const riskLevel = riskFlags.length > 1 ? 'high' : riskFlags.length === 1 ? 'medium' : 'low';

  return {
    providerId: address,
    trustScore: trust,
    successfulPayments: successfulRows.length,
    failedPayments: failedRows.length,
    paymentCount: total,
    settlementVolume: successfulVolume,
    uniquePayers: uniquePayerSet.size,
    repeatPayers,
    medianPayment,
    lastPaymentTimestamp: lastTimestamp,
    lastPaymentAgo: secondsSinceLast,
    recentPayments7d: last7,
    successRate: Number(successRate.toFixed(4)),
    riskLevel,
    riskFlags: riskFlags.map((f) => f.code),
    humanBacked,
    confidence: Math.min(1, Number((total / 20).toFixed(2))),
    source: 'The Graph',
    graphLive: true,
    network: SCOPE
  };
};

const getStatus = async () => {
  const snap = await loadSnapshot();
  return {
    provider: 'The Graph',
    deploymentId: DEPLOYMENT_ID,
    paymentCount: snap.payments.length,
    network: SCOPE,
    graphLive: true,
    lastIndexedBlock: snap.meta?.block?.number || null
  };
};

/* ── MCP protocol handlers ────────────────────────────────────── */

const tools = {
  analyze_provider: {
    description: 'Get The Graph trust/risk analysis for a provider wallet address on GlobalPay',
    inputSchema: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'Wallet address or agent ID of the provider' }
      },
      required: ['providerId']
    },
    handler: async (args) => {
      const snap = await loadSnapshot();
      const result = analyzeProvider(args.providerId, snap.payments);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    }
  },
  ask_trust_engine: {
    description: 'Query GlobalPay\'s on-chain trust data indexed by The Graph in natural language',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural language question about provider trust' }
      },
      required: ['question']
    },
    handler: async (args) => {
      const snap = await loadSnapshot();
      const payees = [...new Set(snap.payments.map((p) => String(p.payee || '').toLowerCase()).filter(Boolean))];
      const providers = payees.map((p) => analyzeProvider(p, snap.payments)).sort((a, b) => b.trustScore - a.trustScore);
      const q = String(args.question || '').toLowerCase();
      let answer;
      if (/\/safest|best|recommend|top/.test(q)) {
        answer = providers.slice(0, 5).map((p, i) => `${i + 1}. ${p.providerId} — trust ${p.trustScore}/100, ${p.successfulPayments} settled, ${p.settlementVolume.toFixed(4)} USDC volume`).join('\n');
      } else if (/who|provider/i.test(q) || providers.length > 0) {
        answer = providers.map((p, i) => `${i + 1}. ${p.providerId} — trust ${p.trustScore}/100, ${p.paymentCount} payments, ${p.settlementVolume.toFixed(4)} USDC, risk ${p.riskLevel}`).join('\n');
      } else {
        answer = `${providers.length} providers indexed on ${SCOPE}. ${providers.reduce((s, p) => s + p.paymentCount, 0)} total payments, ${providers.reduce((s, p) => s + p.settlementVolume, 0).toFixed(4)} USDC total volume.`;
      }
      return { content: [{ type: 'text', text: answer }] };
    }
  },
  graph_status: {
    description: 'Get the current status of GlobalPay\'s The Graph subgraph deployment',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const status = await getStatus();
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }
  }
};

/* ── HTTP server (MCP over HTTP — works with all MCP clients) ─── */

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', provider: 'The Graph', network: SCOPE }));
    return;
  }

  // MCP protocol endpoints
  if (path === '/mcp/tools') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(Object.entries(tools).map(([name, t]) => ({
      name,
      description: t.description,
      input_schema: t.inputSchema
    }))));
    return;
  }

  if (req.method === 'POST' && path === '/mcp/call') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', async () => {
      try {
        const { tool, arguments: args } = JSON.parse(body || '{}');
        const handler = tools[tool];
        if (!handler) { res.writeHead(404); res.end(JSON.stringify({ error: `Unknown tool: ${tool}` })); return; }
        const result = await handler.handler(args || {});
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log(`\n  🟣 GlobalPay × The Graph MCP Server`);
  console.log(`  📡 Port  : ${PORT}`);
  console.log(`  🔗 Graph : ${SCOPE}`);
  console.log(`  🛠️  Tools : ${Object.keys(tools).join(', ')}`);
  console.log(`  ✅ Ready — connect your MCP client to http://localhost:${PORT}\n`);
});