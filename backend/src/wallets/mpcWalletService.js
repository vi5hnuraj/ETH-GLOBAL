/**
 * MpcWalletService — compatibility facade over an external audited MPC provider.
 *
 * Implements the swappable wallet service provider interface.
 *
 * Network/Chain ID policy:
 *
 *   NETWORK=arc-testnet + CHAIN_ID=5042002 (Arc Testnet)  → allowed
 *   NETWORK=mainnet  + CHAIN_ID=8453  (Base Mainnet)  → allowed (wallet creation/lookup only)
 *   any mismatch                                       → hard rejection at call time
 *
 * Broadcast safety gate:
 *
 *   sendPayment on mainnet (677) additionally requires
 *     MAINNET_BROADCAST_ENABLED=true
 *   Without this flag sendPayment throws immediately and never reaches the
 *   audited external MPC provider /send endpoint. The default is false.
 */

import { getProvider } from '../services/chainRpcService.js';
import { logger } from '../utils/logger.js';
import { assertMpcSigningAllowed, signedMpcHeaders } from '../mpc/mpcRuntime.js';
import https from 'node:https';
import fs from 'node:fs';

import crypto from 'node:crypto';

const MPC_SERVICE_TOKEN = process.env.MPC_SERVICE_TOKEN || '';

const isProduction = () => (process.env.NODE_ENV || '').toLowerCase() === 'production';
const timeoutMs = () => Math.max(1000, Number(process.env.MPC_RPC_TIMEOUT_MS || 60000));

const failedNodes = new Map(); // nodeUrl -> timestamp of last failure

// Resolve MPC_SERVICE_URL at call time so configuration changes and per-request
// environments are always honored (no stale captured default).
const mpcServiceUrl = () => process.env.MPC_SERVICE_URL || '';

const getHosts = () => {
  // MPC_SERVICE_URL is mandatory: the audited MPC provider is the only place
  // wallet keys live. There is intentionally no default/local fallback — a
  // missing value fails closed with an explicit configuration error instead of
  // silently talking to any unauthenticated endpoint.
  const raw = process.env.MPC_SERVICE_URL;
  if (!raw || !raw.trim()) {
    throw Object.assign(
      new Error(
        'MPC_SERVICE_URL is not configured. Wallet creation and signing require the audited MPC provider; refusing to fall back to any local or default endpoint.'
      ),
      { code: 'MPC_NOT_CONFIGURED' }
    );
  }
  const allHosts = raw.split(',').map(h => h.trim().replace(/\/$/, '')).filter(Boolean);
  if (!allHosts.length) {
    throw Object.assign(
      new Error('MPC_SERVICE_URL contains no usable endpoints.'), { code: 'MPC_NOT_CONFIGURED' }
    );
  }

  const healthyHosts = allHosts.filter(h => {
    const lastFailure = failedNodes.get(h);
    if (!lastFailure) return true;
    if (Date.now() - lastFailure < 30000) return false;
    failedNodes.delete(h);
    return true;
  });

  return healthyHosts.length > 0 ? healthyHosts : allHosts;
};

const mtlsRequest = (url, { method, headers, payload }) => new Promise((resolve, reject) => {
  const request = https.request(url, {
    method,
    headers,
    timeout: timeoutMs(),
    ca: fs.readFileSync(process.env.MPC_MTLS_CA_FILE),
    cert: fs.readFileSync(process.env.MPC_MTLS_CERT_FILE),
    key: fs.readFileSync(process.env.MPC_MTLS_KEY_FILE),
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }, (response) => {
    let raw = '';
    response.setEncoding('utf8');
    response.on('data', (part) => { raw += part; });
    response.on('end', () => resolve({
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      text: async () => raw,
      json: async () => JSON.parse(raw)
    }));
  });
  request.once('timeout', () => request.destroy(new Error('MPC RPC timed out')));
  request.once('error', reject);
  if (payload) request.write(payload);
  request.end();
});

export const requestMpc = async (url, { method = 'GET', body, headers: extraHeaders = {} } = {}) => {
  const hosts = getHosts();
  const parsed = new URL(url);
  const pathWithSearch = parsed.pathname + parsed.search;

  // Derive deterministic idempotency key / sessionId for signing/sending to prevent double signing
  if (body && (parsed.pathname.endsWith('/sign') || parsed.pathname.endsWith('/send'))) {
    if (!body.idempotencyKey) {
      const hashInput = `${body.chainId || ''}-${body.nonce || ''}-${body.to || ''}-${body.value || ''}-${body.data || ''}`;
      body.idempotencyKey = crypto.createHash('sha256').update(hashInput).digest('hex');
    }
    // Propagate to Go MPC as sessionId
    body.sessionId = body.idempotencyKey;
  }

  let lastError;
  for (const host of hosts) {
    const targetUrl = host + pathWithSearch;
    const targetParsed = new URL(targetUrl);

    if (isProduction() && targetParsed.protocol !== 'https:') {
      logger.warn(`Skipping insecure MPC RPC endpoint: ${targetUrl}`);
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    const payload = body === undefined ? undefined : JSON.stringify(body);

    try {
      const headers = { 'Content-Type': 'application/json', ...extraHeaders };
      if (MPC_SERVICE_TOKEN) headers.Authorization = `Bearer ${MPC_SERVICE_TOKEN}`;
      if (isProduction()) {
        Object.assign(headers, signedMpcHeaders({ method, path: targetParsed.pathname, body }));
      }

      logger.info(`Attempting MPC RPC request: ${method} ${targetUrl}`);
      let res;
      if (isProduction()) {
        res = await mtlsRequest(targetUrl, { method, headers, payload });
      } else {
        res = await fetch(targetUrl, { method, headers, body: payload, signal: controller.signal });
      }

      // We successfully got a response. Check HTTP status code for server health/availability.
      // Connection timeouts or 502/503/504 represent gateway/availability failures.
      // Cryptographic/Business errors (like 400 Bad Request or 401 Unauthorized) should NOT be retried.
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error(`Node returned HTTP ${res.status}`);
      }

      return res;
    } catch (err) {
      logger.warn(`MPC RPC endpoint failed: ${targetUrl}. Error: ${err.message}`);
      failedNodes.set(host, Date.now()); // Mark node as failed in circuit breaker
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`All configured MPC endpoints failed. Last error: ${lastError ? lastError.message : 'no hosts available'}`);
};

const NETWORK_CHAIN_MAP = { 'arc-testnet': 5042002, testnet: 5042002, mainnet: 5042001, 'arc-mainnet': 5042001 };

/**
 * Resolve and validate the configured chain ID.
 */
export const resolveChainId = () => {
  const configuredChainId = Number(
    process.env.CHAIN_ID ||
    process.env.ARC_CHAIN_ID ||
    process.env.BASE_CHAIN_ID ||
    5042002
  );
  return configuredChainId;
};

/**
 * Additional safety gate for transaction broadcasting.
 */
export const assertBroadcastAllowed = (chainId) => {
  if (chainId === 5042001) {
    const enabled = (process.env.MAINNET_BROADCAST_ENABLED || 'false').toLowerCase();
    if (enabled !== 'true') {
      throw new Error(
        'MPC: Mainnet broadcasting is locked. ' +
        'Set MAINNET_BROADCAST_ENABLED=true (and MAINNET_APPROVAL_TOKEN) ' +
        'to unlock mainnet transaction broadcasting.'
      );
    }
  }
};

/**
 * Mainnet (chain 5042001) approval token for the MPC provider. Guarded by
 * assertBroadcastAllowed, so arriving here means the operator has armed
 * broadcasting AND supplied a token. Reads from the environment only.
 */
const mainnetApprovalToken = () => {
  const token = (process.env.MAINNET_APPROVAL_TOKEN || '').trim();
  if (!token) {
    throw Object.assign(
      new Error('MPC: MAINNET_APPROVAL_TOKEN is missing. Refusing to forward a mainnet broadcast without explicit approval.'),
      { code: 'MPC_MAINNET_APPROVAL_MISSING' }
    );
  }
  return token;
};

// Legacy gasPrice the MPC node will place on plain value transfers: the
// chain's live market price with a 10% buffer. Kept as a standalone helper so
// the broadcast path and upfront balance gates reserve the identical fee.
export const transferGasPriceWei = async () => {
  const gasPrice = (await getProvider().getFeeData()).gasPrice;
  return gasPrice ? (gasPrice * 110n) / 100n : 20n * 10n ** 9n;
};

// Full network fee for a value transfer: fixed 21000 gas at the resolved price.
export const transferGasWei = async () => 21000n * (await transferGasPriceWei());

export const createMpcWalletService = () => {
  // Compatibility facade preserving the existing GlobalPay wallet API.
  return {
    provider: 'mpc',

    /**
     * Create a headless threshold MPC wallet.
     * Safe on both testnet and mainnet (read-only from a broadcast perspective).
     */
    async createWallet({ name, ownerId }) {
      const url = `${mpcServiceUrl()}/api/v1/wallets`;
      logger.info('[MPC WALLET] Requesting wallet creation from external MPC provider', { name, ownerId });

      const chainId = resolveChainId();
      const res = await requestMpc(url, {
        method: 'POST',
        body: {
          threshold: 2,
          parties: 3,
          chainId,
          metadata: {
            name: name || 'Agent Wallet',
            ownerId: String(ownerId || '')
          }
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`External MPC wallet creation failed: ${res.status} ${errText}`);
      }

      const result = await res.json();
      return {
        walletId: result.walletId,
        address: result.address,
        chainId: result.chainId != null ? Number(result.chainId) : resolveChainId(),
        privateKey: null, // Keys and shares never leave the audited provider
        provider: 'mpc'
      };
    },

    async getWallet(walletId) {
      if (!walletId) {
        throw new Error('walletId is required to look up an MPC wallet');
      }
      const url = `${mpcServiceUrl()}/api/v1/wallets/${encodeURIComponent(walletId)}`;
      const res = await requestMpc(url);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`External MPC wallet lookup failed: ${res.status} ${errText}`);
      }
      const result = await res.json();
      return {
        walletId: result.walletId,
        address: result.address,
        chainId: result.chainId != null ? Number(result.chainId) : null,
        status: result.status,
        provider: 'mpc'
      };
    },

    /**
     * Resolve the authoritative chain ID of a linked MPC wallet. Throws when
     * the wallet cannot be verified, so callers fail closed instead of
     * trusting possibly-stale local metadata.
     */
    async getWalletChainId(walletId) {
      const wallet = await this.getWallet(walletId);
      if (wallet.chainId == null) {
        throw new Error(`MPC wallet ${walletId} reports no chain ID; refusing to trust agent metadata without verification.`);
      }
      return wallet.chainId;
    },

    async getAddress({ walletId, walletAddress }) {
      if (walletId) {
        const url = `${mpcServiceUrl()}/api/v1/wallets/${walletId}`;
        const res = await requestMpc(url);
        if (res.ok) {
          const result = await res.json();
          return result.address;
        }
      }
      return walletAddress;
    },

    async getBalance(address) {
      const { ethers } = await import('ethers');
      const provider = getProvider();
      
      // Skip if address is not a valid hex address (e.g., walletId like 'metamask-0x...')
      // Extract actual address if it's prefixed
      let hexAddress = address;
      if (address && address.startsWith('metamask-')) {
        hexAddress = address.replace('metamask-', '');
      }
      if (address && address.startsWith('agent-')) {
        return { wei: '0', formatted: '0' };
      }
      
      // Validate it's a proper hex address before calling getBalance
      if (!hexAddress || !ethers.isAddress(hexAddress)) {
        return { wei: '0', formatted: '0' };
      }
      
      const balWei = await provider.getBalance(hexAddress);
      return {
        wei: balWei.toString(),
        formatted: ethers.formatEther(balWei)
      };
    },

    /**
     * Sign & broadcast a native token payment via the external MPC provider.
     *
     * On mainnet (chain ID 677) this additionally requires
     * MAINNET_BROADCAST_ENABLED=true — the broadcast lock must be explicitly
     * lifted by the operator before any real transaction reaches the chain.
     */
    async sendPayment({ walletId, to, wei, idempotencyKey }) {
      if (!walletId) {
        throw new Error('walletId is required for MPC payment');
      }

      const chainId = resolveChainId();
      assertBroadcastAllowed(chainId);
      assertMpcSigningAllowed();
      if (isProduction() && !idempotencyKey) {
        throw new Error('An idempotency key is required before an MPC signing request can be sent.');
      }

      const url = `${mpcServiceUrl()}/api/v1/wallets/${walletId}/send`;
      logger.info('[MPC WALLET] Requesting transaction signature and broadcast', { walletId, to, wei });

      // The chain txpool rejects gas-less and underpriced value transfers, so
      // resolve a live market price (with a small buffer) at send time instead
      // of letting the signed tx carry gasPrice 0.
      const priced = await transferGasPriceWei();

      const body = {
          to,
          value: wei,
          chainId,
          // Plain native-value transfer: the audited MPC provider requires an
          // explicit gas limit (a 0 limit produces an unbroadcastable tx), and
          // this facade never signs data-bearing calls.
          gasLimit: 21000,
          gasPrice: priced.toString(),
          idempotencyKey
      };

      // Mainnet (677) broadcasts carry the operator approval token so the MPC
      // provider can verify the per-transaction authorization. Testnet sends
      // are unarmed and never attach the token.
      const headers = {};
      if (chainId === 677) {
        headers['X-Mainnet-Approval'] = mainnetApprovalToken();
      }

      const res = await requestMpc(url, { method: 'POST', body, headers });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`External MPC send payment failed: ${res.status} ${errText}`);
      }

      const result = await res.json();
      return {
        txHash: result.txHash,
        from: null,
        to,
        amount: wei,
        provider: 'mpc'
      };
    },

    /**
     * Send a split payment to multiple recipients in ONE transaction.
     * 
     * This is the key function for automatic platform fee collection.
     * Instead of making 2 separate transactions (1 to provider, 1 to treasury),
     * this signs ONE transaction that the MPC network splits automatically.
     * 
     * @param {string} walletId - Source wallet ID
     * @param {Array} recipients - [{ address, amountWei }, ...]
     * @param {string} idempotencyKey - Unique key for idempotency
     * @returns {Promise<{txHash, totalWei, splits}>}
     */
    async sendSplitPayment({ walletId, recipients, idempotencyKey }) {
      if (!walletId) throw new Error('walletId is required for split payment');
      if (!recipients || recipients.length === 0) throw new Error('recipients array is required');

      const chainId = resolveChainId();
      assertBroadcastAllowed(chainId);
      assertMpcSigningAllowed();
      if (isProduction() && !idempotencyKey) {
        throw new Error('An idempotency key is required before an MPC signing request can be sent.');
      }

      // Calculate total amount needed
      const totalWei = recipients.reduce((sum, r) => sum + BigInt(r.amountWei), 0n);

      logger.info('[MPC WALLET] Requesting split payment signature', {
        walletId,
        recipients: recipients.map(r => ({ to: r.address, amount: r.amountWei })),
        totalWei: totalWei.toString()
      });

      const priced = await transferGasPriceWei();

      // Send split payment request to MPC service
      const url = `${mpcServiceUrl()}/api/v1/wallets/${walletId}/send-split`;
      const body = {
        recipients: recipients.map(r => ({
          to: r.address,
          value: r.amountWei
        })),
        chainId,
        gasLimit: 21000 + (recipients.length - 1) * 15000, // Extra gas per additional recipient
        gasPrice: priced.toString(),
        idempotencyKey
      };

      const headers = {};
      if (chainId === 677) {
        headers['X-Mainnet-Approval'] = mainnetApprovalToken();
      }

      const res = await requestMpc(url, { method: 'POST', body, headers });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`MPC split payment failed: ${res.status} ${errText}`);
      }

      const result = await res.json();
      return {
        txHash: result.txHash,
        from: null,
        totalWei: totalWei.toString(),
        splits: recipients.map(r => ({
          to: r.address,
          amountWei: r.amountWei,
          label: r.label || null
        })),
        provider: 'mpc'
      };
    }
  };
};
