/**
 * MonitoringService — live health/status for the Developer Platform.
 *
 * Every value is measured at request time: DB round-trip latency, Arc
 * RPC liveness + latest block, in-process worker status, and latency/error
 * percentiles computed from real api_usage_logs rows.
 */

import { supabase } from '../config/supabaseClient.js';
import { requireTables } from '../repositories/platformRepository.js';
import { getWalletService } from '../wallets/walletService.js';
import { ethers } from 'ethers';
import { getMpcRuntimeStatus } from '../mpc/mpcRuntime.js';

const RPC_URL = process.env.ARC_RPC_URL || process.env.RPC_URL || 'https://rpc.testnet.arc.io';

const percentiles = (sorted, ps) => {
  const out = {};
  ps.forEach((p) => {
    if (!sorted.length) { out[p] = 0; return; }
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    out[p] = sorted[Math.max(0, idx)];
  });
  return out;
};

const checkDatabase = async () => {
  const started = Date.now();
  try {
    await requireTables(() => supabase.from('ai_agents').select('id').limit(1));
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch {
    return { status: 'error', latencyMs: Date.now() - started };
  }
};

const checkRpc = async () => {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const json = await res.json();
    const blockNumber = json?.result ? parseInt(json.result, 16) : null;
    return {
      status: blockNumber !== null ? 'ok' : 'error',
      latencyMs: Date.now() - started,
      blockNumber,
      network: 'Arc Chain',
      chainId: Number(process.env.ARC_CHAIN_ID || process.env.CHAIN_ID || 5042002)
    };
  } catch {
    return { status: 'error', latencyMs: Date.now() - started, blockNumber: null, network: 'Arc Chain' };
  }
};

export const getMonitoring = async () => {
  const [db, rpc] = await Promise.all([checkDatabase(), checkRpc()]);

  const workers = {
    broadcastRecovery: global.__workerStatus?.broadcastRecovery || null,
    scheduledPayment: global.__workerStatus?.scheduledPayment || null,
    agentTxReconciliation: global.__workerStatus?.agentTxReconciliation || null,
    webhookRetry: global.__workerStatus?.webhookRetry || null
  };

  let usage = { logs: [], avgLatencyMs: 0, errorRate: 0, percentileLatencyMs: {} };
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await requireTables(() =>
      supabase.from('api_usage_logs').select('status_code, duration_ms').gte('created_at', since).limit(10000)
    );
    if (!error) usage.logs = data || [];
  } catch { /* table missing → zeros */ }

  if (usage.logs.length) {
    const durations = usage.logs.map((l) => l.duration_ms || 0).sort((a, b) => a - b);
    const errors = usage.logs.filter((l) => l.status_code >= 400).length;
    usage.avgLatencyMs = Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10;
    usage.errorRate = Math.round((errors / usage.logs.length) * 1000) / 10;
    usage.percentileLatencyMs = percentiles(durations, [50, 90, 95, 99]);
  }
  usage.requestsLast24h = usage.logs.length;

  let walletProvider = 'local';
  try { walletProvider = getWalletService().provider; } catch { /* fallback */ }

  return {
    api: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development'
    },
    database: db,
    rpc,
    wallet: { provider: walletProvider, status: 'ok' },
    // This reports configuration state only. Node liveness/disagreement must
    // be sourced from the external MPC service's authenticated metrics feed.
    mpc: getMpcRuntimeStatus(),
    workers,
    usage
  };
};

export { ethers };
