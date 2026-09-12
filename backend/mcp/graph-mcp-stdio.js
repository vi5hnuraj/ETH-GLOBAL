#!/usr/bin/env node

/**
 * Standards-compliant MCP stdio server for GlobalPay's live Graph intelligence.
 * Compatible with Claude Desktop, Cursor, and other MCP clients.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const QUERY_URL = process.env.GRAPH_QUERY_URL || '';
const API_KEY = process.env.GRAPH_API_KEY || '';
const DEPLOYMENT_ID = process.env.GRAPH_DEPLOYMENT_ID || '';
const NETWORK = process.env.GRAPH_NETWORK || 'Arc Testnet';

if (!QUERY_URL || !API_KEY) throw new Error('GRAPH_QUERY_URL and GRAPH_API_KEY are required.');

const fields = `id transactionHash blockNumber timestamp payer payee amount paymentType status releaseTime invoiceReference { id reference }`;
const graphQuery = async (query, variables = {}) => {
  const response = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(body.errors?.[0]?.message || `The Graph request failed (${response.status})`);
  return body.data || {};
};

const snapshot = async () => {
  const data = await graphQuery(`{ _meta { block { number } deployment } payments(first: 1000, orderBy: id, orderDirection: asc) { ${fields} } }`);
  return data;
};
const usdc = (value) => Number(value || 0) / 1e18;
const analyze = (providerId, payments) => {
  const id = String(providerId || '').toLowerCase();
  const rows = (payments || []).filter((p) => String(p.payee || '').toLowerCase() === id);
  const successful = rows.filter((p) => ['HELD', 'RELEASED'].includes(String(p.status).toUpperCase()));
  const payers = new Set(rows.map((p) => String(p.payer || '').toLowerCase()).filter(Boolean));
  const volume = successful.reduce((sum, p) => sum + usdc(p.amount), 0);
  const successRate = rows.length ? successful.length / rows.length : 0;
  const riskFlags = [];
  if (rows.length < 3) riskFlags.push('new_provider');
  if (successful.length < rows.length / 2) riskFlags.push('failure_dominant');
  return {
    providerId: id,
    trustScore: Math.round((successRate * 60) + Math.min(1, payers.size / 10) * 20 + Math.min(1, successful.length / 25) * 20),
    paymentCount: rows.length,
    successfulPayments: successful.length,
    successRate,
    settlementVolume: volume,
    uniquePayers: payers.size,
    riskLevel: riskFlags.length ? 'high' : 'low',
    riskFlags,
    source: 'The Graph',
    graphLive: true,
    network: NETWORK
  };
};

const server = new McpServer({ name: 'globalpay-graph-intelligence', version: '1.0.0' });

server.registerTool('graph_status', {
  title: 'GlobalPay Graph Status',
  description: 'Return live sync and indexed payment status from the GlobalPay Arc Subgraph.',
  inputSchema: {}
}, async () => {
  const data = await snapshot();
  return { content: [{ type: 'text', text: JSON.stringify({ provider: 'The Graph', network: NETWORK, deploymentId: DEPLOYMENT_ID, indexedBlock: data._meta?.block?.number, paymentCount: data.payments?.length || 0, graphLive: true }, null, 2) }] };
});

server.registerTool('analyze_provider', {
  title: 'Analyze Provider',
  description: 'Analyze a provider wallet using live indexed Arc settlement evidence.',
  inputSchema: { providerId: z.string().min(1).describe('Provider wallet address') }
}, async ({ providerId }) => {
  const data = await snapshot();
  return { content: [{ type: 'text', text: JSON.stringify(analyze(providerId, data.payments), null, 2) }] };
});

server.registerTool('ask_trust_engine', {
  title: 'Ask Trust Engine',
  description: 'Answer a natural-language provider trust question using live Graph settlements.',
  inputSchema: { question: z.string().min(3).describe('Question such as Which provider is safest?') }
}, async ({ question }) => {
  const data = await snapshot();
  const ids = [...new Set((data.payments || []).map((p) => String(p.payee || '').toLowerCase()).filter(Boolean))];
  const providers = ids.map((id) => analyze(id, data.payments)).sort((a, b) => b.trustScore - a.trustScore);
  const answer = providers.slice(0, 5).map((p, i) => `${i + 1}. ${p.providerId} — trust ${p.trustScore}/100, ${p.successfulPayments}/${p.paymentCount} successful, ${p.settlementVolume.toFixed(4)} USDC, ${p.uniquePayers} buyer(s), ${p.riskLevel} risk`).join('\n');
  return { content: [{ type: 'text', text: `Question: ${question}\n\n${answer}\n\nSource: The Graph · ${NETWORK}` }] };
});

await server.connect(new StdioServerTransport());
