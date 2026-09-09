/**
 * EscrowService — holds payments until service delivery is verified.
 *
 * Flow:
 *   1. Buyer pays → money goes to ESCROW (not seller)
 *   2. Buyer uses service for hold period (e.g., 7 days)
 *   3. If no dispute → money released to seller
 *   4. If dispute filed → money held until resolved
 *   5. If service confirmed bad → refund to buyer
 */

import { getPool } from '../utils/db.js';
import { supabase } from '../config/supabaseClient.js';

const ESCROW_HOLD_DAYS = 7; // Days to hold payment before releasing
const AUTO_RELEASE_HOURS = 24; // Hours after hold period to auto-release

// ─── Create Escrow ───────────────────────────────────────────

/**
 * Create an escrow hold for a purchase.
 * Money is "held" (not yet released to seller).
 */
export const createEscrow = async ({ sessionId, serviceId, buyerAgentId, sellerAgentId, amountWei, amountBOT, invoiceId }) => {
  const pool = await getPool();

  const releaseAt = new Date();
  releaseAt.setDate(releaseAt.getDate() + ESCROW_HOLD_DAYS);

  await pool.query(
    `INSERT INTO escrow_holdings (session_id, service_id, buyer_agent_id, seller_agent_id, amount_wei, amount_bot, invoice_id, status, release_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'held', $8)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, serviceId, buyerAgentId, sellerAgentId, amountWei, amountBOT, invoiceId, releaseAt]
  );

  return {
    escrowId: 'esc_' + require('crypto').randomBytes(12).toString('hex'),
    holdPeriod: ESCROW_HOLD_DAYS,
    releaseAt: releaseAt.toISOString(),
    message: `Payment held in escrow for ${ESCROW_HOLD_DAYS} days. Seller will receive funds after hold period if no dispute is filed.`
  };
};

// ─── Release Escrow ──────────────────────────────────────────

/**
 * Release escrowed funds to seller.
 * Called automatically after hold period or manually by admin.
 */
export const releaseEscrow = async ({ sessionId }) => {
  const pool = await getPool();

  const escrow = await pool.query(
    "SELECT * FROM escrow_holdings WHERE session_id = $1 AND status = 'held'",
    [sessionId]
  );

  if (!escrow.rows.length) {
    return { released: false, message: 'No held escrow found for this session.' };
  }

  const e = escrow.rows[0];

  // Check if there are open disputes
  const disputes = await pool.query(
    "SELECT COUNT(*) FROM service_disputes WHERE session_id = $1 AND status = 'open'",
    [sessionId]
  );

  if (parseInt(disputes.rows[0].count) > 0) {
    return { released: false, message: 'Cannot release — open dispute exists. Resolve dispute first.' };
  }

  // Release to seller
  await pool.query(
    "UPDATE escrow_holdings SET status = 'released', released_at = NOW() WHERE session_id = $1",
    [sessionId]
  );

  // Log the release
  await pool.query(
    `INSERT INTO escrow_releases (escrow_id, session_id, seller_agent_id, amount_wei, amount_bot, released_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [e.id, sessionId, e.seller_agent_id, e.amount_wei, e.amount_bot]
  );

  return {
    released: true,
    onChain: false,
    amountBOT: e.amount_bot,
    sellerAgentId: e.seller_agent_id,
    message: `Escrow marked released in GlobalPay ledger (off-chain bookkeeping; no on-chain transfer in this release).`
  };
};

// ─── Refund Escrow ───────────────────────────────────────────

/**
 * Refund escrowed funds to buyer.
 * Called when dispute is resolved in buyer's favor.
 */
export const refundEscrow = async ({ sessionId, reason }) => {
  const pool = await getPool();

  const escrow = await pool.query(
    "SELECT * FROM escrow_holdings WHERE session_id = $1 AND status = 'held'",
    [sessionId]
  );

  if (!escrow.rows.length) {
    return { refunded: false, message: 'No held escrow found.' };
  }

  const e = escrow.rows[0];

  // Refund to buyer
  await pool.query(
    "UPDATE escrow_holdings SET status = 'refunded', refunded_at = NOW() WHERE session_id = $1",
    [sessionId]
  );

  // Log the refund
  await pool.query(
    `INSERT INTO escrow_releases (escrow_id, session_id, buyer_agent_id, amount_wei, amount_bot, refunded, reason, released_at)
     VALUES ($1, $2, $3, $4, $5, true, $6, NOW())`,
    [e.id, sessionId, e.buyer_agent_id, e.amount_wei, e.amount_bot, reason]
  );

  return {
    refunded: true,
    onChain: false,
    amountBOT: e.amount_bot,
    buyerAgentId: e.buyer_agent_id,
    message: `Escrow marked refunded in GlobalPay ledger (off-chain bookkeeping; no on-chain transfer in this release).`
  };
};

// ─── Check Escrow Status ─────────────────────────────────────

/**
 * Get escrow status for a session.
 */
export const getEscrowStatus = async (sessionId) => {
  const pool = await getPool();
  const result = await pool.query(
    'SELECT * FROM escrow_holdings WHERE session_id = $1',
    [sessionId]
  );
  return result.rows[0] || null;
};

// ─── Auto-Release Check ──────────────────────────────────────

/**
 * Process escrows that have passed their hold period.
 * Run this periodically (e.g., every hour via cron).
 */
export const processExpiredEscrows = async () => {
  const pool = await getPool();

  // Find escrows past hold period with no open disputes
  const expired = await pool.query(`
    SELECT e.* FROM escrow_holdings e
    WHERE e.status = 'held'
    AND e.release_at <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM service_disputes d
      WHERE d.session_id = e.session_id
      AND d.status = 'open'
    )
    LIMIT 50
  `);

  const results = [];
  for (const escrow of expired.rows) {
    try {
      const release = await releaseEscrow({ sessionId: escrow.session_id });
      results.push({ sessionId: escrow.session_id, ...release });
    } catch (err) {
      results.push({ sessionId: escrow.session_id, error: err.message });
    }
  }

  return { processed: results.length, results };
};
