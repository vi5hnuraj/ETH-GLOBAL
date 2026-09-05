/**
 * DisputeService — handles buyer complaints and refunds when sellers don't deliver.
 *
 * Flow:
 *   1. Buyer reports service not working
 *   2. GlobalPay checks endpoint health
 *   3. If service is down → automatic refund
 *   4. If service is up → manual review required
 */

import { getPool } from '../utils/db.js';
import { supabase } from '../config/supabaseClient.js';
import { checkServiceHealth } from './serviceGateway.js';
import logger from '../utils/logger.js';
// ─── Report Service Issue ────────────────────────────────────

/**
 * Buyer reports that a service is not working.
 */
export const reportServiceIssue = async ({ buyerAgentId, serviceId, issueType, description }) => {
  const pool = await getPool();

  // Validate the purchase exists
  const purchase = await pool.query(
    'SELECT * FROM purchase_sessions WHERE consumer_agent_code = $1 AND service_code = $2 AND status IN ($3, $4)',
    [buyerAgentId, serviceId, 'paid', 'active']
  );

  if (!purchase.rows.length) {
    throw { status: 404, message: 'No active purchase found for this service.' };
  }

  const session = purchase.rows[0];

  // Check endpoint health
  let healthStatus = 'unknown';
  let healthMessage = '';
  try {
    const service = await pool.query('SELECT endpoint_url FROM ai_services WHERE service_id = $1', [serviceId]);
    if (service.rows[0]?.endpoint_url) {
      const health = await checkServiceHealth(service.rows[0].endpoint_url);
      healthStatus = health.status;
      healthMessage = health.message;
    }
  } catch (err) {
    healthStatus = 'check_failed';
    healthMessage = err.message;
  }

  // Create dispute record
  const disputeId = 'dpt_' + require('crypto').randomBytes(12).toString('hex');
  await pool.query(
    `INSERT INTO service_disputes (dispute_id, session_id, service_id, buyer_agent_id, seller_agent_id, issue_type, description, health_status, health_message, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [disputeId, session.session_id, serviceId, buyerAgentId, session.provider_agent_code, issueType, description, healthStatus, healthMessage, 'open']
  );

  // Auto-refund if service is clearly down
  let refundIssued = false;
  if (healthStatus === 'unhealthy' || healthStatus === 'unreachable') {
    try {
      await processRefund({ disputeId, sessionId: session.session_id, reason: 'Service endpoint unreachable' });
      refundIssued = true;
    } catch (err) {
      logger.error('[DISPUTE] Auto-refund failed:', err.message);
    }
  }

  return {
    disputeId,
    status: refundIssued ? 'refunded' : 'open',
    healthStatus,
    healthMessage,
    refundIssued,
    message: refundIssued
      ? 'Service endpoint is down. Refund processed automatically.'
      : 'Dispute filed. Our team will review within 24 hours.'
  };
};

// ─── Process Refund ──────────────────────────────────────────

/**
 * Process a refund for a failed service.
 */
export const processRefund = async ({ disputeId, sessionId, reason }) => {
  const pool = await getPool();

  const session = await pool.query(
    'SELECT * FROM purchase_sessions WHERE session_id = $1',
    [sessionId]
  );

  if (!session.rows.length) {
    throw { status: 404, message: 'Session not found.' };
  }

  const s = session.rows[0];

  // Update dispute status
  if (disputeId) {
    await pool.query(
      "UPDATE service_disputes SET status = 'refunded', resolved_at = NOW(), resolution = $1 WHERE dispute_id = $2",
      [reason, disputeId]
    );
  }

  // Update session status
  await pool.query(
    "UPDATE purchase_sessions SET status = 'refunded' WHERE session_id = $1",
    [sessionId]
  );

  // Update invoice status
  if (s.invoice_code) {
    await pool.query(
      "UPDATE service_invoices SET status = 'refunded' WHERE invoice_id = $1",
      [s.invoice_code]
    );
  }

  // Log refund
  await pool.query(
    `INSERT INTO service_disputes (dispute_id, session_id, service_id, buyer_agent_id, seller_agent_id, issue_type, description, status, resolution, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (dispute_id) DO UPDATE SET status = $8, resolution = $9, resolved_at = NOW()`,
    ['dpt_refund_' + require('crypto').randomBytes(8).toString('hex'), sessionId, s.service_code, s.consumer_agent_code, s.provider_agent_code, 'auto_refund', reason, 'refunded', reason]
  );

  return { success: true, message: 'Refund processed.' };
};

// ─── Get Disputes ────────────────────────────────────────────

/**
 * List disputes for a service or buyer.
 */
export const listDisputes = async ({ serviceId, buyerAgentId, status }) => {
  const pool = await getPool();
  let query = 'SELECT * FROM service_disputes WHERE 1=1';
  const params = [];
  let idx = 1;

  if (serviceId) { query += ` AND service_id = $${idx++}`; params.push(serviceId); }
  if (buyerAgentId) { query += ` AND buyer_agent_id = $${idx++}`; params.push(buyerAgentId); }
  if (status) { query += ` AND status = $${idx++}`; params.push(status); }

  query += ' ORDER BY created_at DESC LIMIT 50';

  const result = await pool.query(query, params);
  return result.rows;
};
