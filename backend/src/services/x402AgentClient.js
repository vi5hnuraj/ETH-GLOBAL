/**
 * x402 Agent Client — lets an AI agent consume x402-protected APIs autonomously.
 *
 *   fetchWithX402(url, { agentId, organizationId, developerId })
 *     → GET url
 *     ← 402 challenge { payment: { paymentId, amount, recipientAddress } }
 *     → agentPay via the agent's real MPC wallet (existing production path)
 *     → retry GET with X-PAYMENT: { paymentId, txHash, payer }
 *     ← 200 live data
 *
 * No human interaction. Reuses agentService.agentPay (balance checks, chain
 * validation, dedupe, webhook, audit) — payment logic is never duplicated.
 */
import { agentPay } from './agentService.js';
import { getOwnedAgent } from './developerService.js';
import logger from '../utils/logger.js';

const MAX_ATTEMPTS = 2; // initial + one paid retry

/**
 * @param {string} url absolute URL of the protected endpoint
 * @param {object} opts { agentId, organizationId, developerId, payload, headers }
 */
export const fetchWithX402 = async (url, { agentId, organizationId, developerId, payload, headers = {} } = {}) => {
  if (!agentId) throw Object.assign(new Error('agentId is required for x402 auto-pay.'), { status: 400 });

  const doFetch = (paymentHeader) =>
    fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Consumer-Agent': agentId,
        ...(paymentHeader ? { 'X-PAYMENT': paymentHeader } : {}),
        ...headers
      }
    });

  let res = await doFetch(null);

  // ── Not a 402 → return as-is (free endpoint or already-paid retry result) ──
  if (res.status !== 402) return res;

  // ── Read the payment challenge ──
  const challenge = await res.json().catch(() => null);
  const p = challenge?.payment;
  if (!p?.paymentId || !p?.recipientAddress || !p?.amount) {
    throw Object.assign(new Error('Malformed x402 challenge from server.'), { status: 502 });
  }

  logger.info(`[x402 agent] ${agentId} paying ${p.amount} USDC to ${p.recipientAddress} for ${url}`);

  // ── Pay from the agent's MPC wallet via the existing real path ──
  const agent = await getOwnedAgent(organizationId, agentId);
  if (!agent) throw Object.assign(new Error('Agent not found for x402 payment.'), { status: 404 });

  const payment = await agentPay(agent, {
    to: p.recipientAddress,
    amount: Number(p.amount),
    token: 'USDC',
    note: `x402 ${p.paymentId}`
  });

  logger.info(`[x402 agent] settled: ${payment.txHash} — retrying ${url}`);

  // ── Retry with proof-of-payment ──
  const proof = JSON.stringify({ paymentId: p.paymentId, txHash: payment.txHash, payer: agent.wallet_address });
  res = await doFetch(proof);

  // Surface the paid/retried metadata for callers that want it
  res.x402 = { paid: res.ok, txHash: payment.txHash, amount: p.amount, duplicate: Boolean(payment.duplicate) };
  return res;
};

export default fetchWithX402;
