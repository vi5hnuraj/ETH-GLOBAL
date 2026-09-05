/**
 * NonceManager — per-wallet nonce sequencing for custodial agent wallets.
 *
 * ethers' `wallet.sendTransaction` auto-fetches `eth_getTransactionCount`
 * with 'pending' on every call, which races when the same wallet broadcasts
 * multiple transactions concurrently (two requests can observe the same
 * nonce -> one tx gets dropped/replaced). This manager:
 *
 *   1. Serializes sends per wallet address (a promise-chain mutex), so no two
 *      broadcasts from one wallet overlap.
 *   2. Caches the next nonce in memory, incrementing after each broadcast, so
 *      the pending count is not re-read mid-flight.
 *   3. On a stale/replaced error it refreshes from the chain and retries once.
 */

import { getProvider } from '../services/chainRpcService.js';

const STALE_NONCE_RE = /nonce too (low|high)|replacement transaction underpriced|already known/i;

const nextNonceByAddress = new Map();
const locks = new Map();

const lock = async (address) => {
  const prev = locks.get(address) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(address, prev.then(() => next));
  await prev.catch(() => {});
  return release;
};

export const readChainNonce = async (address) => {
  const provider = getProvider();
  return Number(await provider.getTransactionCount(address, 'pending'));
};

/**
 * Reserve the next nonce for a wallet address. Returns { nonce, release }.
 * Call release() in a finally block after the broadcast completes (or fails).
 */
export const reserveNonce = async (address) => {
  const release = await lock(address.toLowerCase());
  let nonce = nextNonceByAddress.get(address.toLowerCase());
  if (nonce === undefined) {
    nonce = await readChainNonce(address);
    nextNonceByAddress.set(address.toLowerCase(), nonce);
  } else {
    // If the chain advanced past our cache (e.g. a tx from another process),
    // re-sync so we never reuse a consumed nonce.
    const chainNonce = await readChainNonce(address);
    if (chainNonce > nonce) {
      nonce = chainNonce;
      nextNonceByAddress.set(address.toLowerCase(), nonce);
    }
  }
  return { nonce, release };
};

export const commitNonce = (address) => {
  const key = address.toLowerCase();
  const current = nextNonceByAddress.get(key);
  nextNonceByAddress.set(key, current === undefined ? undefined : current + 1);
};

/** Drop the cached nonce so the next send re-syncs from the chain. */
export const invalidateNonce = (address) => {
  nextNonceByAddress.delete(address.toLowerCase());
};

export const isStaleNonceError = (message = '') => STALE_NONCE_RE.test(message);
