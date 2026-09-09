/**
 * x402 Middleware — HTTP 402 (Payment Required) gate for premium API routes.
 *
 * Flow:
 *   No X-PAYMENT header  → 402 JSON challenge (amount, recipient, paymentId)
 *   X-PAYMENT present    → verify on-chain via x402Service.verifyPayment()
 *                        → attach req.x402 = verification result
 *                        → continue to the real handler (live data)
 */
import { buildChallenge, verifyPayment } from '../services/x402Service.js';
import logger from '../utils/logger.js';

/**
 * @param {object} opts
 * @param {string} opts.purpose   Human-readable purpose shown in the challenge
 * @param {string} opts.price     Price in USDC (decimal string). Falls back to X402_DEFAULT_PRICE.
 */
export const x402Guard = ({ purpose = 'Premium API', price } = {}) =>
  async (req, res, next) => {
    const header = req.headers['x-payment'] || req.headers['X-PAYMENT'];

    // ── 1. No payment → issue the 402 challenge ──
    if (!header) {
      const challenge = await buildChallenge({ endpoint: req.originalUrl, price });
      if (challenge.payment.recipientAddress === null) {
        return res.status(503).json({ status: 503, message: 'x402 not configured on this server (no treasury).' });
      }
      res.set('WWW-Authenticate', `x402 challenge="${challenge.payment.paymentId}"`);
      return res.status(402).json(challenge);
    }

    // ── 2. Payment presented → verify on-chain ──
    let claim;
    try {
      claim = typeof header === 'string' ? JSON.parse(header) : header;
    } catch {
      return res.status(400).json({ status: 400, message: 'X-PAYMENT header must be JSON: { paymentId, txHash, payer }' });
    }

    try {
      const verified = await verifyPayment({
        paymentId: claim.paymentId,
        txHash: claim.txHash,
        amount: price,
        endpoint: req.originalUrl,
        agentCode: claim.payer || claim.agentId || null
      });
      req.x402 = verified;
      return next();
    } catch (err) {
      const status = err.status || 402;
      if (status >= 500) logger.error('[x402] verification error:', err.message);
      return res.status(status).json({ status, message: err.message || 'Payment verification failed.' });
    }
  };

export default x402Guard;
