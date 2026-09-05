/**
 * WebhookRetryWorker — redelivers failed webhook deliveries with exponential
 * backoff and dead-letters deliveries that exhaust their attempts.
 *
 * Picks up deliveries where:
 *   status = 'failed' AND dead_letter = false AND next_attempt_at <= now
 *   AND attempts < MAX_DELIVERY_ATTEMPTS
 *
 * On success: status -> 'delivered'. On failure: attempts++, next_attempt_at
 * advances by backoff, and after MAX_DELIVERY_ATTEMPTS the delivery is marked
 * dead_letter = true (dead-letter queue) for manual inspection/replay.
 */

import { supabase } from '../config/supabaseClient.js';
import { MAX_DELIVERY_ATTEMPTS, backoffDelayMs } from '../services/webhookService.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const POLL_INTERVAL_MS = Number(process.env.WEBHOOK_RETRY_POLL_MS || 30_000);
const BATCH_SIZE = 25;

const deliver = async (endpoint, payload) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers = {
    'Content-Type': 'application/json',
    'x-globalpay-timestamp': timestamp
  };
  const signature = crypto
    .createHmac('sha256', endpoint.secret_key)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');
  headers['x-globalpay-signature'] = `t=${timestamp},v1=${signature}`;

  const started = Date.now();
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS || 10_000))
    });
    return { ok: res.ok, responseStatus: res.status, durationMs: Date.now() - started };
  } catch (err) {
    return { ok: false, responseStatus: 0, durationMs: Date.now() - started, errorMessage: err.message };
  }
};

const runCycle = async () => {
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('webhook_deliveries')
    .select('*, webhook_endpoints(*)')
    .eq('status', 'failed')
    .eq('dead_letter', false)
    .lt('next_attempt_at', now)
    .limit(BATCH_SIZE);

  if (error) {
    logger.warn('Webhook retry worker scan failed', { error: error.message });
    return;
  }
  if (!due || due.length === 0) return;

  for (const delivery of due) {
    try {
      const endpoint = delivery.webhook_endpoints;
      if (!endpoint || !endpoint.is_active) {
        // Endpoint deleted or disabled — dead-letter without further attempts.
        await supabase
          .from('webhook_deliveries')
          .update({ dead_letter: true })
          .eq('id', delivery.id);
        continue;
      }

      const result = await deliver(endpoint, delivery.payload);
      const attempts = (delivery.attempts || 0) + 1;
      const failed = !result.ok;

      const patch = {
        status: failed ? 'failed' : 'delivered',
        attempts,
        response_status: result.responseStatus,
        error_message: result.errorMessage || null,
        duration_ms: result.durationMs || null,
        last_attempt_at: new Date().toISOString()
      };
      if (failed) {
        if (attempts >= MAX_DELIVERY_ATTEMPTS) {
          patch.dead_letter = true;
          patch.next_attempt_at = null;
          logger.warn('Webhook delivery dead-lettered after max attempts', {
            deliveryId: delivery.id,
            attempts
          });
        } else {
          patch.next_attempt_at = new Date(Date.now() + backoffDelayMs(attempts)).toISOString();
        }
      } else {
        patch.dead_letter = false;
        patch.next_attempt_at = null;
      }

      await supabase.from('webhook_deliveries').update(patch).eq('id', delivery.id);
    } catch (err) {
      logger.error('Webhook retry cycle error for delivery', {
        deliveryId: delivery.id,
        error: err.message
      });
    }
  }
};

export const startWebhookRetryWorker = () => {
  logger.info('Webhook retry worker started');
  global.__workerStatus = global.__workerStatus || {};
  global.__workerStatus.webhookRetry = { status: 'running', startedAt: new Date().toISOString() };
  setInterval(() => {
    runCycle().catch((err) => logger.error('Webhook retry worker error', { error: err.message }));
  }, POLL_INTERVAL_MS);
};
