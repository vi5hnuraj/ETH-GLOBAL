/**
 * ChainRpcService — resilient Arc Testnet JSON-RPC access.
 *
 * Provides:
 *  - Multiple Arc RPC fallback URLs (ARC_RPC_URLS="a,b,c" or ARC_RPC_URL).
 *  - Per-request timeout (RPC_TIMEOUT_MS, default 10s) via AbortController.
 *  - Exponential retries across the URL list.
 *  - A per-URL circuit breaker (opens after RPC_MAX_FAILURES consecutive
 *    failures for RPC_COOLDOWN_MS, so a dead endpoint stops being hammered).
 *  - A drop-in ethers JsonRpcProvider subclass (getProvider()) so every
 *    signing/reading call site gets the same resilience for free.
 */

import { ethers } from 'ethers';

const DEFAULT_RPC = 'https://rpc.testnet.arc.io';
const FALLBACK_RPCS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io'
];
const REQUEST_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 10000);
const MAX_FAILURES = Number(process.env.RPC_MAX_FAILURES || 3);
const COOLDOWN_MS = Number(process.env.RPC_COOLDOWN_MS || 30000);
const RETRIES = Number(process.env.RPC_RETRIES || 2);
const BACKOFF_MS = Number(process.env.RPC_BACKOFF_MS || 250);

export const getRpcUrls = () => {
  const fromEnv = process.env.ARC_RPC_URLS || process.env.ARC_RPC_URL || process.env.RPC_URLS || process.env.RPC_URL;
  const urls = fromEnv
    ? fromEnv.split(',').map((u) => u.trim()).filter(Boolean)
    : [];
  return urls.length ? urls : FALLBACK_RPCS;
};

const circuit = new Map();

const isOpen = (url) => {
  const c = circuit.get(url);
  if (!c) return false;
  if (c.openUntil && c.openUntil > Date.now()) return true;
  if (c.openUntil && c.openUntil <= Date.now()) {
    circuit.delete(url);
    return false;
  }
  return c.failures >= MAX_FAILURES;
};

const recordFailure = (url) => {
  const c = circuit.get(url) || { failures: 0, openUntil: null };
  c.failures += 1;
  if (c.failures >= MAX_FAILURES) c.openUntil = Date.now() + COOLDOWN_MS;
  circuit.set(url, c);
};

const recordSuccess = (url) => circuit.delete(url);

const rpcFetch = async (url, method, params) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(String(json.error.message || `RPC error ${json.error.code}`));
    return json.result;
  } finally {
    clearTimeout(timer);
  }
};

export const callRpc = async (method, params) => {
  const urls = getRpcUrls();
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    for (const url of urls) {
      if (isOpen(url)) continue;
      try {
        const result = await rpcFetch(url, method, params);
        recordSuccess(url);
        return result;
      } catch (err) {
        recordFailure(url);
        lastErr = err;
      }
    }
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, BACKOFF_MS * (attempt + 1)));
  }
  const err = new Error(`All Arc RPC endpoints are unavailable. Last error: ${lastErr?.message}`);
  err.code = 'RPC_UNAVAILABLE';
  throw err;
};

const ARC_NETWORK = () => {
  try {
    const chainId = Number(process.env.ARC_CHAIN_ID || process.env.CHAIN_ID || 5042002);
    return new ethers.Network('arc-testnet', chainId);
  } catch {
    return undefined;
  }
};

/**
 * Drop-in ethers provider with retry/timeout/fallback/circuit-breaker built in.
 */
export class ResilientJsonRpcProvider extends ethers.JsonRpcProvider {
  constructor(url) {
    super(url || getRpcUrls()[0], undefined, {
      staticNetwork: ARC_NETWORK() || true,
      batchMaxCount: 1
    });
  }

  async request(method, params) {
    return callRpc(method, params);
  }
}

let cachedProvider = null;

export const getProvider = () => {
  if (!cachedProvider) cachedProvider = new ResilientJsonRpcProvider();
  return cachedProvider;
};
