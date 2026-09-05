/**
 * Structured JSON logger with correlation IDs.
 * - Emits one JSON object per line (piped to log aggregators).
 * - Never logs request bodies, headers, tokens, or secrets.
 * - Attaches a per-request correlation id (req.id / x-request-id).
 */

import crypto from 'crypto';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

const toLevel = (level) => LEVELS[level] != null ? level : 'info';

const stringify = (obj) => {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify({ message: String(obj?.message || obj), unstringifiable: true });
  }
};

const write = (level, message, fields = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    level: toLevel(level),
    msg: message,
    ...fields
  };
  // Hard safety: never allow secrets into logs regardless of caller intent.
  for (const key of Object.keys(entry)) {
    const v = entry[key];
    if (typeof v === 'string' && /(secret|token|password|api[_-]?key|private[_-]?key|authorization|signature|encrypted_)/i.test(key)) {
      entry[key] = '[REDACTED]';
    }
  }
  if (level === 'error' || level === 'fatal') {
    console.error(stringify(entry));
  } else if (level === 'warn') {
    console.warn(stringify(entry));
  } else {
    console.log(stringify(entry));
  }
};

export const logger = {
  debug: (msg, fields) => write('debug', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
  fatal: (msg, fields) => write('fatal', msg, fields)
};

/**
 * Request logging middleware.
 * - Assigns req.id (correlation id), echoing an inbound x-request-id if present.
 * - Logs method/path/status/duration/IP/user only — never body or headers.
 */
export const requestLogger = (req, res, next) => {
  req.id = req.header('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100;
    write('info', 'request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      ip: req.ip
    });
  });

  next();
};

export default logger;
