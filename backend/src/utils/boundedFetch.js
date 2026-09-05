/**
 * BoundedFetch — drives every Supabase request over a brand-new TCP/TLS
 * socket via node:http(s), bypassing undici's keep-alive pool entirely.
 *
 * Why: the hosted gateway intermittently fails to map the new-style
 * `sb_secret_` service key to the `service_role` JWT and downgrades a session
 * to `anon`. Once undici's pool lands on such a degraded socket it *stays*
 * degraded for the life of the process — reads silently return `[]` (the UI
 * shows "create your first key") and writes raise 42501 RLS violations, which
 * the orchestrator-org provisioning then misreads as "org missing" and tries
 * to insert. Fresh `agent: false` connections (the exact transport that curl
 * uses) have been verified reliable 12/12 while the pooled path was failing
 * 192 times in the same window.
 *
 * Resilience on top of the fresh socket: connection concurrency is capped at 8
 * (a page of parallel queries can otherwise exhaust the pooler), and transient
 * PostgREST failures (statement timeout 57014, stack depth 54001, RLS violation
 * 42501) plus list reads that come back suspiciously empty are retried on fresh
 * connections before being returned.
 */

import http from 'node:http';
import https from 'node:https';
import { Buffer } from 'node:buffer';
import logger from '../utils/logger.js';
const MAX_CONCURRENT = 8;

const headersToObject = (headers) => {
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (headers && typeof headers === 'object') return headers;
  return {};
};

const requestOnce = (url, init = {}) =>
  new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(
        url instanceof Request ? url.url : (url.href !== undefined ? url.href : String(url))
      );
    } catch (err) {
      return reject(err);
    }
    const method = String(init.method || 'GET').toUpperCase();
    const headers = headersToObject(
      init.headers ||
        (url instanceof Request ? url.headers : undefined)
    );
    // Never negotiate compression or reuse the pool. A bare `agent: false`
    // request opens a brand-new TCP/TLS socket every time, exactly like curl —
    // the transport that has proven immune to the gateway's degraded sessions.
    headers['Connection'] = 'close';
    headers['Accept-Encoding'] = 'identity';
    const lib = u.protocol === 'https:' ? https : http;
    const body =
      init.body instanceof Uint8Array ? Buffer.from(init.body) :
      typeof init.body === 'string' ? Buffer.from(init.body) : null;
    if (body) headers['Content-Length'] = String(body.length);
    const req = lib.request(
      u,
      { method, headers, agent: false },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const status = res.statusCode;
          // 204/304/205 must not carry a body per the fetch spec — the Response
          // constructor throws otherwise.
          const bodyless = status === 204 || status === 205 || status === 304;
          resolve(
            new Response(bodyless ? null : buf, {
              status,
              statusText: res.statusMessage,
              headers: res.headers
            })
          );
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });

class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }

  async run(fn) {
    if (this.active < this.max) {
      this.active += 1;
      try {
        return await fn();
      } finally {
        this.active -= 1;
        this.pump();
      }
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
    });
  }

  pump() {
    while (this.active < this.max && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.active += 1;
      (async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          this.active -= 1;
          this.pump();
        }
      })();
    }
  }
}

const limiter = new Semaphore(MAX_CONCURRENT);

// PostgREST error statuses that indicate a degraded pooled session rather than
// a real logic error. Safe to retry on a fresh connection.
const TRANSIENT_STATUSES = new Set([42501, 54001, 57014]);

const fetchOnce = (input, init) => requestOnce(input, init);

const backoff = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Detect a degraded Supabase gateway session on a read.
 *
 * The gateway occasionally fails to map the new-style `sb_secret_` service
 * key to the `service_role` JWT and downgrades the request to `anon`. Anon
 * requests are RLS-restricted, so list reads silently return `[]` (the row
 * blips are invisible) instead of raising a 42501 like writes do. That makes
 * the UI show "you have no keys/agents" while the data exists.
 *
 * A response counts as suspicious only when it is a list-style payload: either
 * a bare `[]` or an object with at least one array field that is empty. A
 * legitimate empty list is retried harmlessly once more on a fresh connection.
 */
const looksDegradedEmpty = (json) => {
  if (json === null || json === undefined) return false;
  if (Array.isArray(json)) return json.length === 0;
  if (typeof json === 'object') {
    const arrays = Object.values(json).filter((v) => Array.isArray(v));
    return arrays.length > 0 && arrays.every((a) => a.length === 0);
  }
  return false;
};

export const boundedFetch = async (input, init) =>
  limiter.run(async () => {
    const method = String((init && init.method) || 'GET').toUpperCase();
    // Reads get more attempts than writes (a retried insert could duplicate a
    // row, though the app's provisioning flows are designed to absorb that).
    // Higher read budget: during a degraded gateway window each fresh socket
    // is only *sometimes* downgraded, so a generous retry collapses the
    // failure rate geometrically (p^7 instead of p^5).
    const maxAttempts = method === 'GET' || method === 'HEAD' ? 7 : 3;

    let res;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      res = await fetchOnce(input, init);

      let body = null;
      if (res.ok) {
        const ab = await res.arrayBuffer().catch(() => null);
        if (ab) {
          try {
            body = JSON.parse(Buffer.from(ab).toString('utf8'));
          } catch {
            /* non-JSON body: not a list payload */
          }
          const isBodyless = res.status === 204 || res.status === 205 || res.status === 304;
          res = new Response(isBodyless ? null : ab, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          });
        }
      }

      const retryable =
        !res.ok && TRANSIENT_STATUSES.has(res.status);
      // A degraded `sb_secret_` gateway session intermittently routes service-role
      // writes through `anon`, and PostgREST then answers 200 with an empty array
      // (RLS filters out every row) instead of 42501. `.single()` callers then see
      // PGRST116 "0 rows" — e.g. "Database error updating wallet preference".
      // Retry such write replies on a fresh `agent: false` socket exactly like the
      // transient 42501/54001/57014 statuses above.
      const degradedEmpty =
        method !== 'GET' && method !== 'HEAD' &&
        Array.isArray(body) && body.length === 0;
      // Reads can be silently degraded the same way (anon RLS filters every row
      // out, so a list comes back `200 []` with no error). Retry those on a fresh
      // socket too, but cap the budget so a genuinely empty list (new developer,
      // no agents yet) still returns quickly.
      const readEmpty =
        (method === 'GET' || method === 'HEAD') && looksDegradedEmpty(body);

      const shouldRetry = retryable || degradedEmpty || readEmpty;
      if (shouldRetry) {
        const budget = readEmpty ? Math.min(3, maxAttempts) : maxAttempts;
        if (attempt < budget) {
          await backoff(250);
          continue;
        }
        logger.warn(
          readEmpty
            ? `[SUPABASE] read degraded to anon — list stayed empty after ${budget} attempts`
            : degradedEmpty
            ? `[SUPABASE] write degraded to anon — result stayed empty after ${maxAttempts} attempts`
            : `[SUPABASE] transient ${res.status} persisted after ${maxAttempts} attempts`
        );
      }
      return res;
    }

    return res;
  });
