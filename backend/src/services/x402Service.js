/**
 * x402 Service — HTTP 402 (Payment Required) protocol support for GlobalPay.
 *
 * Design (additive — reuses existing production rails, duplicates nothing):
 *  - Challenge:  amount + recipient (treasury, derived from TREASURY_PRIVATE_KEY)
 *                + payment id. Real money path: agent MPC wallet → native USDC
 *                transfer on Arc (USDC is native gas on Arc), the same
 *                `agentPay` path the marketplace already uses.
 *  - Verify:     on-chain receipt check via the existing Arc RPC provider —
 *                to == recipient, value == amount, status == 1, plus a DB
 *                replay guard so one tx can never unlock twice.
 *  - Ledger:     `x402_payments` table (applied migration) records every
 *                verified payment; The Graph continues to index on-chain
 *                events — this table is GlobalPay's own accounting mirror.
 */
import { getProvider } from './chainRpcService.js';
import { getTreasuryAddress } from '../config/config.js';
import logger from '../utils/logger.js';

let _pool = null;
const pool = async () => {
  if (!_pool) {
    const { getPool } = await import('../utils/db.js');
    _pool = getPool();
  }
  return _pool;
};

export const X402_DEFAULT_PRICE = process.env.X402_DEFAULT_PRICE || '0.01';
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Build a 402 challenge body for an endpoint. */
export const buildChallenge = async ({ endpoint, price }) => {
  const recipient = await getTreasuryAddress();
  const paymentId = `x402_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  return {
    status: 402,
    message: 'Payment Required',
    payment: {
      x402Version: 1,
      paymentId,
      amount: String(price ?? X402_DEFAULT_PRICE),
      currency: 'USDC',
      network: 'Arc',
      chainId: Number(process.env.ARC_CHAIN_ID || 5042002),
      recipient: recipient || 'GlobalPay Treasury',
      recipientAddress: recipient || null,
      purpose: 'Premium API',
      endpoint,
      instructions: {
        asset: 'USDC (native gas on Arc)',
        rail: 'GlobalPay MPC wallet → recipient (native transfer)',
        header: 'X-PAYMENT',
        headerFormat: 'JSON { paymentId, txHash, payer } '
      }
    }
  };
};

/**
 * Verify an x402 payment claim end-to-end:
 *  1. shape validation (paymentId, txHash)
 *  2. replay guard — txHash/paymentId must be unseen (DB unique + lookup)
 *  3. real on-chain check — receipt exists, status 1, to == recipient,
 *     value == amount (native USDC on Arc → wei), block confirmed
 * Returns { verified, txHash, payer, blockNumber, amount } or throws 4xx.
 */
export const verifyPayment = async ({ paymentId, txHash, amount, endpoint, agentCode }) => {
  if (!paymentId || typeof paymentId !== 'string' || paymentId.length > 128) {
    throw Object.assign(new Error('paymentId is required.'), { status: 400 });
  }
  if (!TX_RE.test(txHash || '')) {
    throw Object.assign(new Error('A valid 32-byte transaction hash is required.'), { status: 400 });
  }
  const recipient = await getTreasuryAddress();
  if (!recipient) {
    throw Object.assign(new Error('x402 is not configured: treasury recipient unavailable.'), { status: 503 });
  }
  const expected = amount ?? X402_DEFAULT_PRICE;
  if (!Number.isFinite(Number(expected)) || Number(expected) <= 0) {
    throw Object.assign(new Error('Invalid payment amount.'), { status: 400 });
  }

  // ── Replay guard: paymentId must be fresh, txHash must be unseen ──
  const db = await pool();
  const seen = await db.query(
    'SELECT payment_id, tx_hash FROM x402_payments WHERE payment_id = $1 OR tx_hash = $2 LIMIT 1',
    [paymentId, txHash]
  );
  if (seen.rows.length) {
    throw Object.assign(new Error('This payment has already been used. Each payment unlocks exactly one request.'), { status: 409 });
  }

  // ── Real on-chain verification against Arc RPC ──
  const provider = getProvider();
  let tx, receipt;
  try {
    [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.waitForTransaction(txHash, 1, 30000)]);
  } catch (err) {
    logger.warn('[x402] RPC verification failed:', err.message);
    throw Object.assign(new Error('Payment transaction not found on Arc. Provide the exact tx hash of your settlement.'), { status: 402 });
  }
  if (!tx || !receipt) {
    throw Object.assign(new Error('Payment transaction not found on Arc.'), { status: 402 });
  }
  if (receipt.status !== 1) {
    throw Object.assign(new Error('Payment transaction failed on-chain.'), { status: 402 });
  }
  if (!tx.to || tx.to.toLowerCase() !== recipient.toLowerCase()) {
    throw Object.assign(new Error(`Payment was not sent to the required recipient (${recipient}).`), { status: 402 });
  }
  const expectedWei = BigInt(Math.round(Number(expected) * 1e18));
  if (BigInt(tx.value.toString()) < expectedWei) {
    throw Object.assign(new Error(`Underpayment: expected at least ${expected} USDC.`), { status: 402 });
  }

  // ── Record in the ledger (unique constraints make the replay guard atomic) ──
  const blockNumber = receipt.blockNumber ?? null;
  try {
    await db.query(
      `INSERT INTO x402_payments (payment_id, agent_code, endpoint, amount, tx_hash, from_address, block_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')`,
      [paymentId, agentCode || null, endpoint || null, String(expected), txHash, tx.from || null, blockNumber]
    );
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('This payment has already been used.'), { status: 409 });
    }
    throw err;
  }

  logger.info(`[x402] payment verified: ${paymentId} tx=${txHash.slice(0, 14)}… block=${blockNumber} from=${tx.from}`);
  return { verified: true, txHash, payer: tx.from, blockNumber, amount: String(expected), currency: 'USDC', network: 'Arc' };
};

/** List recent verified x402 payments (newest first). */
export const listPayments = async ({ limit = 25 } = {}) => {
  const db = await pool();
  const r = await db.query(
    `SELECT payment_id, agent_code, endpoint, amount, tx_hash, from_address, block_number, status, created_at
     FROM x402_payments ORDER BY created_at DESC LIMIT $1`,
    [Math.min(100, Math.max(1, Number(limit) || 25))]
  );
  return r.rows;
};

/** Aggregate revenue stats for the console page. */
export const revenueStats = async () => {
  const db = await pool();
  const r = await db.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount::numeric), 0) AS total FROM x402_payments WHERE status = 'verified'`
  );
  const { count, total } = r.rows[0] || {};
  return { count: Number(count || 0), totalUsdc: Number(total || 0) };
};

/** Which published services require x402 (for the console page). */
export const listProtectedServices = async () => {
  const db = await pool();
  const r = await db.query(
    `SELECT service_id, title, require_x402, x402_price, unit_price, unit_label, is_active
     FROM ai_services WHERE require_x402 = TRUE ORDER BY updated_at DESC LIMIT 50`
  );
  return r.rows;
};
