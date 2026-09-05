/**
 * ServiceGateway Routes — handles service invocation, access management, and health checks.
 *
 * POST /api/services/:serviceId/invoke    — invoke a service (requires service access key)
 * GET  /api/services/:serviceId/access    — list consumers (requires dev key)
 * POST /api/services/:serviceId/access    — grant access (requires dev key)
 * DELETE /api/services/:serviceId/access/:consumerId — revoke access
 * GET  /api/services/:serviceId/health    — check endpoint health
 */

import { Router } from 'express';
import { invokeService, grantServiceAccess, revokeServiceAccess, checkServiceHealth, authenticateServiceKey } from '../services/serviceGateway.js';
import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';

const router = Router();

// ─── Service Invocation ──────────────────────────────────────

/**
 * POST /api/services/:serviceId/invoke
 * 
 * Invoke a service. Authenticates with a service access key (gpay_svc_...).
 * Proxies the request to the seller's endpoint and meters usage.
 */
router.post('/:serviceId/invoke', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const auth = req.headers.authorization || '';
    const match = auth.match(/^Bearer\s+(gpay_svc_\S+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Service access key required. Use: Authorization: Bearer gpay_svc_...'
      });
    }

    const accessKey = match[1];
    const result = await invokeService({
      accessKey,
      serviceId,
      requestPayload: req.body,
      headers: req.headers
    });

    res.json({
      success: true,
      status: result.status,
      data: result.body,
      metering: result.metering
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'Service invocation failed'
    });
  }
});

// ─── Access Management (Seller-side) ─────────────────────────

/**
 * GET /api/services/:serviceId/access
 * List all consumers with access to this service.
 */
router.get('/:serviceId/access', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const pool = await getPool();

    const result = await pool.query(
      `SELECT sa.consumer_agent_id, sa.requests_used, sa.requests_limit, sa.status, sa.created_at, sa.last_used_at,
              sa.access_key_prefix
       FROM service_access sa
       WHERE sa.service_id = $1
       ORDER BY sa.created_at DESC`,
      [serviceId]
    );

    res.json({ success: true, consumers: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/services/:serviceId/access
 * Grant access to a consumer agent.
 */
router.post('/:serviceId/access', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { consumerAgentId, consumerDeveloperId } = req.body;

    if (!consumerAgentId) {
      return res.status(400).json({ success: false, message: 'consumerAgentId is required' });
    }

    const result = await grantServiceAccess({
      serviceId,
      consumerAgentId,
      consumerDeveloperId
    });

    res.json({
      success: true,
      accessKey: result.accessKey,
      prefix: result.prefix,
      message: result.message || 'Access granted. Store the access key securely — it cannot be recovered.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/services/:serviceId/access/:consumerId
 * Revoke a consumer's access.
 */
router.delete('/:serviceId/access/:consumerId', async (req, res) => {
  try {
    const { serviceId, consumerId } = req.params;
    await revokeServiceAccess({ serviceId, consumerAgentId: consumerId });
    res.json({ success: true, message: 'Access revoked.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Health Check ────────────────────────────────────────────

/**
 * GET /api/services/:serviceId/health
 * Check if the service endpoint is reachable.
 */
router.get('/:serviceId/health', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const pool = await getPool();
    const result = await pool.query('SELECT endpoint_url FROM ai_services WHERE service_id = $1', [serviceId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const health = await checkServiceHealth(result.rows[0].endpoint_url);
    res.json({ success: true, ...health });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Access Key Verification ─────────────────────────────────

/**
 * POST /api/services/auth/verify
 * Verify a service access key and return access details.
 */
router.post('/auth/verify', async (req, res) => {
  try {
    const { accessKey } = req.body;
    if (!accessKey) {
      return res.status(400).json({ success: false, message: 'accessKey is required' });
    }

    const access = await authenticateServiceKey(accessKey);
    if (!access) {
      return res.status(401).json({ success: false, message: 'Invalid or expired access key' });
    }

    res.json({
      success: true,
      serviceId: access.service_id,
      serviceTitle: access.service_title,
      category: access.category,
      endpointUrl: access.endpoint_url,
      unitPrice: access.unit_price,
      unitLabel: access.unit_label,
      requestsUsed: access.requests_used,
      requestsLimit: access.requests_limit,
      remaining: access.requests_limit - access.requests_used
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Disputes & Refunds ─────────────────────────────────────

/**
 * POST /api/services/:serviceId/dispute
 * Report a service issue (buyer side).
 */
router.post('/:serviceId/dispute', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { buyerAgentId, issueType, description } = req.body;

    if (!buyerAgentId || !issueType) {
      return res.status(400).json({ success: false, message: 'buyerAgentId and issueType are required' });
    }

    const { reportServiceIssue } = await import('../services/disputeService.js');
    const result = await reportServiceIssue({ buyerAgentId, serviceId, issueType, description });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/services/:serviceId/disputes
 * List disputes for a service.
 */
router.get('/:serviceId/disputes', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { listDisputes } = await import('../services/disputeService.js');
    const disputes = await listDisputes({ serviceId });
    res.json({ success: true, disputes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
