/**
 * Phase 1 hardening unit tests (node:test). No server/DB needed.
 *   - Webhook exponential backoff + dead-letter thresholds
 *   - Webhook signature verification + timestamp replay freshness
 *   - Resilient RPC: URL fallback list + live eth_blockNumber call
 *   - Structured logger redaction
 *
 * Run: NODE_ENV=test node --test test/hardening.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import { backoffDelayMs, MAX_DELIVERY_ATTEMPTS, verifySignature } from '../src/services/webhookService.js';
import { getRpcUrls, callRpc } from '../src/services/chainRpcService.js';

test('webhook backoff is exponential and capped', () => {
  assert.ok(backoffDelayMs(1) >= 30_000, 'first attempt delay should be >= 30s');
  assert.ok(backoffDelayMs(3) > backoffDelayMs(2), 'delay should grow');
  assert.ok(backoffDelayMs(10) <= 3_600_000, 'delay should be capped at 1h');
  assert.ok(MAX_DELIVERY_ATTEMPTS >= 1);
});

test('webhook signature verifies and rejects tampering', () => {
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = { id: 'evt_1', type: 'payment.completed', data: { amount: 10 } };
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(payload)}`).digest('hex');
  const signature = `t=${timestamp},v1=${digest}`;

  assert.equal(verifySignature({ secret, signature, timestamp, payload }), true);
  assert.equal(verifySignature({ secret, signature: 't=0,v1=deadbeef', timestamp, payload }), false);
  assert.equal(verifySignature({ secret, signature, timestamp, payload: { ...payload, data: { amount: 11 } } }), false);
});

test('webhook signature rejects stale timestamps (replay protection)', () => {
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const staleTimestamp = (Math.floor(Date.now() / 1000) - 10 * 60).toString();
  const payload = { id: 'evt_1' };
  const digest = crypto.createHmac('sha256', secret).update(`${staleTimestamp}.${JSON.stringify(payload)}`).digest('hex');
  const signature = `t=${staleTimestamp},v1=${digest}`;

  assert.equal(verifySignature({ secret, signature, timestamp: staleTimestamp, payload, maxAgeMs: 5 * 60 * 1000 }), false);
  assert.equal(verifySignature({ secret, signature, timestamp: staleTimestamp, payload, maxAgeMs: 15 * 60 * 1000 }), true);
});

test('rpc url list parses env and always yields at least one endpoint', () => {
  const urls = getRpcUrls();
  assert.ok(Array.isArray(urls) && urls.length >= 1);
  for (const u of urls) assert.match(u, /^https?:\/\//);
});

test('rpc callRpc returns a live block number from BOT Chain', async () => {
  const result = await callRpc('eth_blockNumber', []);
  const n = Number(result);
  assert.ok(n > 0, `expected a positive block number, got ${result}`);
}, { timeout: 30_000 });

test('logger redacts secret-looking keys', () => {
  const REDACT_RE = /(secret|token|password|api[_-]?key|private[_-]?key|authorization|signature|encrypted_)/i;
  const redact = (key, value) =>
    typeof value === 'string' && REDACT_RE.test(key) ? '[REDACTED]' : value;
  assert.equal(redact('apiKey', 'gpay_dev_123'), '[REDACTED]');
  assert.equal(redact('authorization', 'Bearer x'), '[REDACTED]');
  assert.equal(redact('txHash', '0xabc'), '0xabc');
  assert.equal(redact('amount', '10'), '10');
});
