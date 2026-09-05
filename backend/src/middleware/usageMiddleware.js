/**
 * UsageMiddleware — records API usage, but ONLY for real, authenticated API
 * calls (agent API key or developer API key). Frontend/dashboard calls that
 * rely on the X-Developer-Id header are internal and are NEVER counted as API
 * usage.
 *
 * Captures request telemetry (request id, user agent, sanitized headers,
 * truncated request/response bodies) so the developer dashboard can render
 * expandable, production-grade request logs.
 *
 * Fire-and-forget: a failure to persist (e.g. table not provisioned, DB hiccup)
 * must never affect the response.
 */

import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { isMissingTable } from '../repositories/platformRepository.js';
import logger from '../utils/logger.js';
const BODY_CAP = 4096; // chars kept per captured body

const truncate = (value) => {
  if (value == null) return null;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > BODY_CAP ? `${str.slice(0, BODY_CAP)}…[truncated]` : str;
};

/** Only metadata that is safe and useful for the log view. Credentials are masked. */
const sanitizeHeaders = (req) => {
  const out = {};
  const pick = ['content-type', 'accept', 'user-agent', 'x-developer-id', 'x-organization-id', 'x-organization-slug'];
  for (const name of pick) {
    const value = req.get(name);
    if (value) out[name] = value;
  }
  const auth = req.get('authorization') || '';
  const bearer = auth.match(/^(Bearer\s+)(\S+)$/i);
  if (bearer) {
    const token = bearer[2];
    out['authorization'] = token.length > 12 ? `${bearer[1]}${token.slice(0, 8)}…${token.slice(-4)}` : bearer[1] + '***';
  }
  return out;
};

const recordUsage = async (entry) => {
  try {
    await supabase.from('api_usage_logs').insert(entry);
  } catch (err) {
    if (!isMissingTable(err)) {
      logger.warn('[USAGE] Failed to record request log:', err.message);
    }
  }
};

const usageMiddleware = (req, res, next) => {
  // Only count requests authenticated with a real API key.
  const apiKeyId = req.apiKey?.id || (req.agent ? req.agent.id : null);
  if (!apiKeyId) return next();

  const started = process.hrtime.bigint();
  const requestId = crypto.randomUUID();
  const capturedBody = truncate(req.body);
  const capturedHeaders = sanitizeHeaders(req);
  const userAgent = req.get('user-agent') || null;

  let responseBody = null;
  const originalEnd = res.end;
  res.end = function (chunk, encoding, callback) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
      responseBody = truncate(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);
    }
    if (typeof encoding === 'function') callback = encoding;
    return originalEnd.call(this, chunk, encoding, callback);
  };

  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100;
    const statusCode = res.statusCode;

    recordUsage({
      developer_id: req.agent?.developer_id || req.developerId || null,
      organization_id: req.organization?.id || req.agent?.organization_id || null,
      agent_id: req.agent ? req.agent.id : null,
      api_key_id: apiKeyId,
      source: req.agent ? 'agent_key' : 'developer_key',
      ip: req.ip,
      endpoint: `${req.baseUrl || ''}${req.path}`,
      method: req.method,
      status_code: statusCode,
      duration_ms: durationMs,
      error_code: statusCode >= 400 ? String(statusCode) : null,
      error_message: statusCode >= 400 ? responseBody : null,
      request_id: requestId,
      user_agent: userAgent,
      request_headers: capturedHeaders,
      request_body: capturedBody,
      response_body: statusCode >= 400 ? responseBody : null
    });
  });

  next();
};

export default usageMiddleware;
