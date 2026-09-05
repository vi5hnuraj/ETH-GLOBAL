/**
 * ServiceGateway — handles service access, metering, and request proxying.
 *
 * Flow:
 *   1. Buyer purchases a service → access key generated
 *   2. Buyer calls POST /api/services/:serviceId/invoke with access key
 *   3. Gateway authenticates buyer, checks quota
 *   4. Gateway proxies request to seller's endpointUrl
 *   5. Gateway logs usage and creates invoice
 *   6. Response returned to buyer
 */

import crypto from 'crypto';
import { getPool } from '../utils/db.js';
import { supabase } from '../config/supabaseClient.js';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import logger from '../utils/logger.js';
// ─── Access Key Management ───────────────────────────────────

const generateAccessKey = () => {
  const raw = 'gpay_svc_' + crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { key: raw, hash, prefix: raw.substring(0, 16) };
};

/**
 * Grant access to a service after purchase.
 * Returns the plaintext access key (shown once to the buyer).
 */
export const grantServiceAccess = async ({ serviceId, consumerAgentId, consumerDeveloperId }) => {
  const pool = await getPool();

  // Check if access already exists
  const existing = await pool.query(
    'SELECT id, access_key_prefix, status FROM service_access WHERE service_id = $1 AND consumer_agent_id = $2',
    [serviceId, consumerAgentId]
  );

  if (existing.rows.length && existing.rows[0].status === 'active') {
    // Already has access — return existing key prefix (can't recover full key)
    return { accessKey: null, prefix: existing.rows[0].access_key_prefix, message: 'Access already granted' };
  }

  const { key, hash, prefix } = generateAccessKey();

  if (existing.rows.length) {
    // Reactivate with new key
    await pool.query(
      'UPDATE service_access SET access_key_hash = $1, access_key_prefix = $2, status = $3, requests_used = 0, last_used_at = NULL WHERE service_id = $4 AND consumer_agent_id = $5',
      [hash, prefix, 'active', serviceId, consumerAgentId]
    );
  } else {
    await pool.query(
      'INSERT INTO service_access (service_id, consumer_agent_id, consumer_developer_id, access_key_hash, access_key_prefix) VALUES ($1, $2, $3, $4, $5)',
      [serviceId, consumerAgentId, consumerDeveloperId, hash, prefix]
    );
  }

  return { accessKey: key, prefix };
};

/**
 * Revoke service access.
 */
export const revokeServiceAccess = async ({ serviceId, consumerAgentId }) => {
  const pool = await getPool();
  await pool.query(
    "UPDATE service_access SET status = 'revoked' WHERE service_id = $1 AND consumer_agent_id = $2",
    [serviceId, consumerAgentId]
  );
};

// ─── Access Key Authentication ───────────────────────────────

/**
 * Authenticate a service access key and return the access record + service details.
 */
export const authenticateServiceKey = async (accessKey) => {
  if (!accessKey || !accessKey.startsWith('gpay_svc_')) return null;

  const hash = crypto.createHash('sha256').update(accessKey).digest('hex');
  const pool = await getPool();

  const result = await pool.query(
    `SELECT sa.*, s.endpoint_url, s.title as service_title, s.unit_price, s.unit_label, s.category
     FROM service_access sa
     JOIN ai_services s ON sa.service_id = s.service_id
     WHERE sa.access_key_hash = $1 AND sa.status = 'active' AND s.is_active = true`,
    [hash]
  );

  return result.rows[0] || null;
};

// ─── Request Proxying ────────────────────────────────────────

/**
 * Forward a request to the seller's endpoint and return the response.
 */
const proxyRequest = (endpointUrl, { method = 'POST', headers = {}, body, timeout = 30000 }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpointUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GlobalPay-ServiceGateway/1.0',
        'X-GlobalPay-Service': 'true',
        ...headers
      },
      timeout
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }

    req.end();
  });
};

// ─── Service Invocation ──────────────────────────────────────

/**
 * Invoke a service: authenticate → proxy → meter → respond.
 */
export const invokeService = async ({ accessKey, serviceId, requestPayload, headers: extraHeaders }) => {
  // 1. Authenticate
  const access = await authenticateServiceKey(accessKey);
  if (!access) {
    throw { status: 401, message: 'Invalid or expired service access key.' };
  }

  if (access.service_id !== serviceId) {
    throw { status: 403, message: 'Access key is for a different service.' };
  }

  // 2. Check quota
  if (access.requests_used >= access.requests_limit) {
    throw { status: 429, message: 'Request quota exceeded. Contact the service provider.' };
  }

  // 3. Check endpoint exists
  if (!access.endpoint_url) {
    throw { status: 503, message: 'Service endpoint not configured. The provider has not set an API endpoint.' };
  }

  // 4. Proxy to seller's endpoint
  let proxyResponse;
  try {
    proxyResponse = await proxyRequest(access.endpoint_url, {
      method: 'POST',
      headers: {
        'X-Consumer-Agent': access.consumer_agent_id,
        'X-Service-Id': serviceId,
        ...extraHeaders
      },
      body: requestPayload,
      timeout: 30000
    });
  } catch (err) {
    throw { status: 502, message: `Service endpoint error: ${err.message}` };
  }

  // 5. Meter usage (increment counter)
  const pool = await getPool();
  await pool.query(
    'UPDATE service_access SET requests_used = requests_used + 1, last_used_at = NOW() WHERE id = $1',
    [access.id]
  );

  // 6. Log usage for billing
  try {
    await pool.query(
      `INSERT INTO usage_reports (service_code, consumer_agent_code, provider_agent_code, quantity, unit, metadata, developer_id, organization_id)
       SELECT $1, $2, s.agent_code, 1, $3, $4, s.developer_id, s.organization_id
       FROM ai_services s WHERE s.service_id = $1`,
      [
        serviceId,
        access.consumer_agent_id,
        access.unit_label || 'request',
        JSON.stringify({
          gateway: true,
          endpointUrl: access.endpoint_url,
          proxyStatus: proxyResponse.status,
          timestamp: new Date().toISOString()
        })
      ]
    );
  } catch (err) {
    logger.error('[SERVICE GATEWAY] Usage logging failed:', err.message);
  }

  // 7. Return response
  return {
    status: proxyResponse.status,
    headers: proxyResponse.headers,
    body: proxyResponse.body,
    metering: {
      requestsUsed: access.requests_used + 1,
      requestsLimit: access.requests_limit,
      remaining: access.requests_limit - (access.requests_used + 1)
    }
  };
};

// ─── Health Check ────────────────────────────────────────────

/**
 * Check if a service endpoint is reachable.
 */
export const checkServiceHealth = async (endpointUrl) => {
  if (!endpointUrl) return { status: 'unknown', message: 'No endpoint configured' };

  try {
    const url = new URL(endpointUrl);
    // Try health check URL first, then the endpoint itself
    const healthUrl = url.origin + '/health';
    const response = await proxyRequest(healthUrl, { method: 'GET', timeout: 5000 });
    return {
      status: response.status < 400 ? 'healthy' : 'degraded',
      statusCode: response.status,
      message: response.status < 400 ? 'Endpoint is reachable' : `Endpoint returned ${response.status}`
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      message: `Endpoint unreachable: ${err.message}`
    };
  }
};
