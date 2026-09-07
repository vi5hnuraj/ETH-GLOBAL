/**
 * BillingController — plans, subscription management and invoice history.
 * Future-ready: the plan selection endpoint is where a Stripe checkout/
 * portal flow would plug in.
 */

import { getBilling, setPlan, paySubscriptionWithBOT } from '../services/developerService.js';
import { ok, handleError } from '../utils/respond.js';

export const billing = async (req, res) => {
  try {
    ok(res, await getBilling(req.organization.id, req.developerId));
  } catch (err) {
    handleError(res, err, 'billing');
  }
};

export const subscribe = async (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!plan) return res.status(400).json({ success: false, message: 'A plan is required.' });
    ok(res, await setPlan(req.organization.id, req.developerId, { plan }), 200);
  } catch (err) {
    handleError(res, err, 'billing');
  }
};

/**
 * Pay for Pro subscription with USDC from wallet.
 * POST /api/billing/pay
 * Body: { walletId: string }
 * 
 * Takes 4.9 USDC from user's wallet → treasury.
 * Upgrades plan to 'pro' for 30 days.
 */
export const paySubscription = async (req, res) => {
  try {
    const { walletId, txHash } = req.body || {};
    if (!walletId) return res.status(400).json({ success: false, message: 'walletId is required.' });
    
    const result = await paySubscriptionWithBOT({
      organizationId: req.organization.id,
      developerId: req.developerId,
      walletId,
      txHash  // For MetaMask: txHash to verify on-chain
    });
    
    ok(res, result, 200);
  } catch (err) {
    handleError(res, err, 'billing');
  }
};
