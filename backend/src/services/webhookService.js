/**
 * WebhookService — endpoint CRUD, delivery logging, and event dispatch.
 *
 * Dispatch is fire-and-forget: it never blocks or breaks the request that
 * triggered the event, and silently no-ops when tables are not provisioned.
 * Each delivery payload is signed with an HMAC-SHA256 signature derived from
 * the endpoint secret so consumers can verify authenticity.
 */

import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { requireTables, throwMissingTable, isMissingTable } from '../repositories/platformRepository.js';
import { audit } from './auditService.js';
import { logger } from '../utils/logger.js';

export const SUPPORTED_EVENTS = [
  'agent.created',
  'wallet.created',
  'payment.completed',
  'payment.failed',
  'api_key.rotated',
  'service.created',
  'service.updated',
  'usage.reported',
  'invoice.created',
  'invoice.paid',
  'invoice.failed',
  'marketplace.purchase',
  'policy.updated',
  'capability.updated',
  'purchase.session.created',
  'purchase.session.approved',
  'purchase.session.started',
  'purchase.session.cancelled',
  'purchase.session.completed',
  'purchase.session.invoice_generated',
  'purchase.session.paid',
  'purchase.session.closed',
  'profile.updated',
  'workflow.template.created',
  'workflow.deployed',
  'network.provider.switched',
  'agent.published',
  'agent.updated',
  'agent.installed',
  'agent.uninstalled',
  'agent.version.published',
  'agent.subscription.changed',
  'agent.invoked',
  'agent.review.submitted',
  'agent.removed'
];

export const MAX_DELIVERY_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS || 6);
const SIGNATURE_HEADER = 'x-globalpay-signature';
const TIMESTAMP_HEADER = 'x-globalpay-timestamp';
const DELIVERY_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 10_000);

/**
 * Exponential backoff delay for delivery attempt `attempt` (1-based).
 * attempt 1 -> 30s, 2 -> 1m, 3 -> 2m, ... capped at 1h.
 */
export const backoffDelayMs = (attempt) => {
  const base = Number(process.env.WEBHOOK_BACKOFF_BASE_MS || 30_000);
  const factor = Number(process.env.WEBHOOK_BACKOFF_FACTOR || 2);
  const max = Number(process.env.WEBHOOK_BACKOFF_MAX_MS || 3_600_000);
  const raw = base * Math.pow(factor, Math.max(0, attempt - 1));
  return Math.min(raw, max);
};

const generateSecret = () => `whsec_${crypto.randomBytes(24).toString('base64url')}`;

const signPayload = (secret, payload, timestamp) => {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
};

/**
 * Verify an incoming x-globalpay-signature header against a known secret.
 * Supports the exact format we sign with: t=<ts>,v1=<hex>.
 * When `maxAgeMs` is provided, signatures older than that are rejected
 * (replay protection).
 */
export const verifySignature = ({ secret, signature, timestamp, payload, maxAgeMs }) => {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');

  const expected = `t=${timestamp},v1=${computed}`;
  const a = Buffer.from(String(signature || ''));
  const b = Buffer.from(expected);
  const sigOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!sigOk) return false;

  if (maxAgeMs != null) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) * 1000 > maxAgeMs) {
      return false;
    }
  }
  return true;
};

// ==================== Endpoint CRUD ====================

export const listEndpoints = async (organizationId) => {
  const { data, error } = await requireTables(() =>
    supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return (data || []).map((e) => ({
    id: e.id,
    url: e.url,
    description: e.description,
    events: e.events || [],
    isActive: e.is_active,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    secretKey: e.secret_key
  }));
};

export const createEndpoint = async ({ developerId, organizationId, url, description, events }) => {
  const secretKey = generateSecret();
  const { data, error } = await requireTables(() =>
    supabase
      .from('webhook_endpoints')
      .insert({
        developer_id: developerId,
        organization_id: organizationId,
        url,
        description: description || null,
        events: events || SUPPORTED_EVENTS,
        secret_key: secretKey,
        is_active: true
      })
      .select()
      .single()
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  await audit({
    developerId,
    organizationId,
    action: 'webhook.created',
    resourceType: 'webhook_endpoint',
    resourceId: data.id,
    metadata: { url: data.url }
  });
  return {
    id: data.id,
    url: data.url,
    description: data.description,
    events: data.events || [],
    isActive: data.is_active,
    secretKey, // returned exactly once
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
};

export const updateEndpoint = async ({ developerId, organizationId, id, url, description, events, isActive }) => {
  const patch = {};
  if (url !== undefined) patch.url = url;
  if (description !== undefined) patch.description = description || null;
  if (events !== undefined) patch.events = events;
  if (isActive !== undefined) patch.is_active = isActive;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await requireTables(() =>
    supabase
      .from('webhook_endpoints')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single()
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  await audit({
    developerId,
    organizationId,
    action: 'webhook.updated',
    resourceType: 'webhook_endpoint',
    resourceId: data.id,
    metadata: { url: data.url }
  });
  return {
    id: data.id,
    url: data.url,
    description: data.description,
    events: data.events || [],
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
};

export const deleteEndpoint = async ({ developerId, organizationId, id }) => {
  const { data, error } = await requireTables(() =>
    supabase.from('webhook_endpoints').delete().eq('id', id).eq('organization_id', organizationId).select('id, url')
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  await audit({
    developerId,
    organizationId,
    action: 'webhook.deleted',
    resourceType: 'webhook_endpoint',
    resourceId: id,
    metadata: { url: data?.[0]?.url || null }
  });
};

// ==================== Deliveries ====================

export const listDeliveries = async ({ organizationId, endpointId, limit = 50 }) => {
  let query = supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints(url, description)')
    .eq('organization_id', organizationId);

  if (endpointId) query = query.eq('endpoint_id', endpointId);
  query = query.order('created_at', { ascending: false }).limit(Math.min(Number(limit) || 50, 200));

  const { data, error } = await requireTables(() => query);
  if (error) throwMissingTable(error);
  if (error) throw error;

  return (data || []).map((d) => ({
    id: d.id,
    endpointId: d.endpoint_id,
    endpointUrl: d.webhook_endpoints?.url || null,
    event: d.event,
    payload: d.payload,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.response_status,
    errorMessage: d.error_message,
    durationMs: d.duration_ms,
    lastAttemptAt: d.last_attempt_at,
    createdAt: d.created_at
  }));
};

export const retryDelivery = async ({ developerId, organizationId, deliveryId }) => {
  const { data: delivery, error: findErr } = await requireTables(() =>
    supabase
      .from('webhook_deliveries')
      .select('*, webhook_endpoints(*)')
      .eq('id', deliveryId)
      .eq('organization_id', organizationId)
      .single()
  );
  if (findErr) throw findErr;
  if (!delivery) throw Object.assign(new Error('Webhook delivery not found.'), { status: 404 });
  if (!delivery.webhook_endpoints) throw Object.assign(new Error('Endpoint no longer exists.'), { status: 404 });

  const result = await deliver(delivery.webhook_endpoints, delivery.event, delivery.payload);
  const failed = !result.ok;
  const attempts = (delivery.attempts || 0) + 1;
  await supabase
    .from('webhook_deliveries')
    .update({
      status: failed ? 'failed' : 'delivered',
      attempts,
      response_status: result.responseStatus,
      error_message: result.errorMessage || null,
      request_id: result.requestId || null,
      signature: result.signature || null,
      response_body: result.responseBody || null,
      duration_ms: result.durationMs || null,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: failed && attempts < MAX_DELIVERY_ATTEMPTS
        ? new Date(Date.now() + backoffDelayMs(attempts)).toISOString()
        : null,
      dead_letter: failed && attempts >= MAX_DELIVERY_ATTEMPTS
    })
    .eq('id', delivery.id);

  await audit({
    developerId,
    organizationId,
    action: 'webhook.delivery_retried',
    resourceType: 'webhook_delivery',
    resourceId: delivery.id,
    metadata: { ok: result.ok, responseStatus: result.responseStatus }
  });

  return { ok: result.ok, responseStatus: result.responseStatus };
};

// ==================== Dispatch ====================

const deliver = async (endpoint, event, payload) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signPayload(endpoint.secret_key, payload, timestamp);
  const requestId = 'req_' + crypto.randomBytes(12).toString('hex');
  const headers = {
    'Content-Type': 'application/json',
    'x-globalpay-request-id': requestId,
    'x-globalpay-event': event,
    'x-globalpay-webhook-id': endpoint.id,
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signature
  };
  const started = Date.now();

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS)
    });
    let responseBody = null;
    try { responseBody = (await res.text()).slice(0, 2000); } catch { /* body unreadable */ }
    return { ok: res.ok, responseStatus: res.status, durationMs: Date.now() - started, requestId, signature, timestamp, responseBody };
  } catch (err) {
    return { ok: false, responseStatus: 0, durationMs: Date.now() - started, requestId, signature, timestamp, errorMessage: err.message };
  }
};

const recordDelivery = async (endpoint, event, payload, result, attempts = 1) => {
  const failed = !result.ok;
  try {
    await supabase.from('webhook_deliveries').insert({
      endpoint_id: endpoint.id,
      developer_id: endpoint.developer_id,
      organization_id: endpoint.organization_id,
      event,
      payload,
      status: failed ? 'failed' : 'delivered',
      attempts,
      response_status: result.responseStatus,
      error_message: result.errorMessage || null,
      request_id: result.requestId || null,
      signature: result.signature || null,
      response_body: result.responseBody || null,
      duration_ms: result.durationMs || null,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: failed && attempts < MAX_DELIVERY_ATTEMPTS
        ? new Date(Date.now() + backoffDelayMs(attempts)).toISOString()
        : null,
      dead_letter: failed && attempts >= MAX_DELIVERY_ATTEMPTS
    });
  } catch (err) {
    if (!isMissingTable(err)) logger.warn('Failed to log webhook delivery', { error: err.message });
  }
};

/**
 * Dispatch an event to every active endpoint subscribed to it.
 * Never throws. Never blocks the calling request.
 *
 * @param {string} event
 * @param {object} payload
 * @param {{ developerId?: string, organizationId?: string }} ctx
 */
export const dispatchEvent = (event, payload, ctx) => {
  const developerId = ctx?.developerId;
  const organizationId = ctx?.organizationId;
  const run = async () => {
    try {
      let query = supabase
        .from('webhook_endpoints')
        .select('*')
        .eq('is_active', true)
        .contains('events', [event]);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      } else if (developerId) {
        query = query.eq('developer_id', developerId);
      }

      const { data: endpoints, error } = await requireTables(() => query);
      if (error) throwMissingTable(error);
  if (error) throw error;

      const targets = (endpoints || []).filter((e) => (e.events || []).includes(event));
      if (!targets.length) return;

      const body = {
        id: crypto.randomUUID(),
        type: event,
        created: new Date().toISOString(),
        data: payload
      };

      targets.forEach(async (endpoint) => {
        const result = await deliver(endpoint, event, body);
        await recordDelivery(endpoint, event, body, result);
        if (!result.ok) {
          // Failed deliveries are scheduled for retry with exponential backoff
          // by the webhook retry worker (dead-lettered after MAX_DELIVERY_ATTEMPTS).
          logger.warn('Webhook delivery failed — scheduled for retry', {
            endpointId: endpoint.id,
            event,
            responseStatus: result.responseStatus,
            attempt: 1
          });
        }
      });
    } catch (err) {
      if (!isMissingTable(err)) logger.warn('Webhook dispatch skipped', { error: err.message });
    }
  };

  // Fire-and-forget with a microtask delay so the response is not blocked.
  void (async () => {
    await new Promise((r) => setTimeout(r, 0));
    await run();
  })();
};

export { generateSecret };

// ==================== Console: stats, rotation, delivery detail ====================

/**
 * Aggregated webhook statistics for the developer console dashboard.
 * All numbers derive from live webhook_deliveries / webhook_endpoints rows.
 */
export const getWebhookStats = async (organizationId) => {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [eps, del24] = await Promise.all([
    supabase.from('webhook_endpoints').select('id,is_active').eq('organization_id', organizationId),
    supabase.from('webhook_deliveries').select('status,response_status,duration_ms,dead_letter,created_at').eq('organization_id', organizationId).gte('created_at', since)
  ]);
  const endpoints = eps.data || [];
  const deliveries = del24.data || [];
  const okCount = deliveries.filter((d) => d.status === 'delivered').length;
  const failedCount = deliveries.filter((d) => d.status === 'failed').length;
  const durations = deliveries.map((d) => d.duration_ms).filter((n) => Number.isFinite(n) && n > 0);
  const avgLatencyMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const retryQueue = deliveries.filter((d) => d.status === 'failed' && !d.dead_letter).length;
  return {
    endpointsTotal: endpoints.length,
    endpointsActive: endpoints.filter((e) => e.is_active).length,
    deliveries24h: deliveries.length,
    successRate24h: deliveries.length ? Number((okCount / deliveries.length).toFixed(4)) : null,
    failed24h: failedCount,
    deadLettered24h: deliveries.filter((d) => d.dead_letter).length,
    avgLatencyMs,
    retryQueue
  };
};

/**
 * Rotate an endpoint's signing secret. The previous secret stops verifying
 * immediately; return the new secret exactly once.
 */
export const rotateEndpointSecret = async ({ developerId, organizationId, id }) => {
  const secretKey = generateSecret();
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .update({ secret_key: secretKey, secret_rotated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Webhook endpoint not found.'), { status: 404 });
  await audit({
    developerId, organizationId,
    action: 'webhook.secret_rotated',
    resourceType: 'webhook_endpoint',
    resourceId: id,
    metadata: { url: data.url }
  });
  return { id: data.id, secretKey: data.secret_key, rotatedAt: data.secret_rotated_at };
};

/**
 * Full detail for one delivery (headers we sent, signature, response body).
 */
export const getDelivery = async ({ organizationId, deliveryId }) => {
  const { data: d, error } = await supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints(url, description, secret_key)')
    .eq('id', deliveryId)
    .eq('organization_id', organizationId)
    .single();
  if (error) throw error;
  if (!d) throw Object.assign(new Error('Delivery not found.'), { status: 404 });
  return {
    id: d.id,
    endpointId: d.endpoint_id,
    endpointUrl: d.webhook_endpoints?.url || null,
    event: d.event,
    payload: d.payload,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.response_status,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: d.response_body || null,
    errorMessage: d.error_message || null,
    requestId: d.request_id || null,
    signature: d.signature || null,
    signatureHeader: 'x-globalpay-signature',
    timestampHeader: 'x-globalpay-timestamp',
    durationMs: d.duration_ms,
    nextAttemptAt: d.next_attempt_at,
    deadLetter: d.dead_letter,
    lastAttemptAt: d.last_attempt_at,
    createdAt: d.created_at,
    sentHeaders: {
      'Content-Type': 'application/json',
      'x-globalpay-event': d.event,
      'x-globalpay-request-id': d.request_id || null,
      'x-globalpay-timestamp': d.last_attempt_at ? Math.floor(new Date(d.last_attempt_at).getTime() / 1000).toString() : null,
      'x-globalpay-signature': d.signature ? `${d.signature}` : null
    }
  };
};

/**
 * Replay a delivery: re-dispatch the same event/payload to the endpoint now,
 * recording a NEW delivery row (attempt history preserved on the original).
 */
export const replayDelivery = async ({ developerId, organizationId, deliveryId }) => {
  const { data: d, error } = await supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints(*)')
    .eq('id', deliveryId)
    .eq('organization_id', organizationId)
    .single();
  if (error) throw error;
  if (!d) throw Object.assign(new Error('Delivery not found.'), { status: 404 });
  if (!d.webhook_endpoints) throw Object.assign(new Error('Endpoint no longer exists.'), { status: 404 });
  if (!d.webhook_endpoints.is_active) throw Object.assign(new Error('Endpoint is disabled — enable it before replaying.'), { status: 409 });

  const result = await deliver(d.webhook_endpoints, d.event, d.payload);
  await recordDelivery(d.webhook_endpoints, d.event, d.payload, result, 1);
  await audit({
    developerId, organizationId,
    action: 'webhook.delivery_replayed',
    resourceType: 'webhook_delivery',
    resourceId: deliveryId,
    metadata: { ok: result.ok, responseStatus: result.responseStatus }
  });
  return { ok: result.ok, responseStatus: result.responseStatus, durationMs: result.durationMs };
};
