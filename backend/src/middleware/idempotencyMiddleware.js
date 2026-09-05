import crypto from 'crypto';
import logger from '../utils/logger.js';
// In-memory cache map for high-speed transaction idempotency resolution
const idempotencyCache = new Map();

// Automatically prune expired keys every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of idempotencyCache.entries()) {
    if (now - val.timestamp > 15 * 60 * 1000) {
      idempotencyCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

export const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return next(); // Proceed normally when idempotency checks are bypassed
  }

  const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');

  try {
    const existing = idempotencyCache.get(idempotencyKey);

    if (existing) {
      if (existing.requestHash === requestHash) {
        logger.info(`⚡ [IDEMPOTENCY] Replaying cached response for key: ${idempotencyKey}`);
        return res.status(existing.statusCode).json(existing.responseBody);
      } else {
        return res.status(400).json({ message: "Idempotency key reuse violation: Request payload mismatch." });
      }
    }

    // Intercept json responses to cache them
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        idempotencyCache.set(idempotencyKey, {
          statusCode: res.statusCode,
          responseBody: body,
          requestHash,
          timestamp: Date.now()
        });
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    logger.error("Idempotency cache middleware error:", err.message);
    next();
  }
};
