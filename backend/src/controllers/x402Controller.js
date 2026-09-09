/**
 * x402 Controller — premium demo endpoints + console data endpoints.
 *
 * Premium routes sit behind x402Guard: no payment → 402 challenge;
 * verified payment → live data (The Graph / marketplace / Arc — the same
 * sources the rest of the platform uses).
 */
import { ok, handleError } from '../utils/respond.js';
import { x402Guard } from '../middleware/x402Middleware.js';
import { X402_DEFAULT_PRICE, listPayments, revenueStats, listProtectedServices } from '../services/x402Service.js';
import { getGraphStatus, analyzeProviders, isGraphConfigured } from '../services/graphIntelligenceService.js';
import { getArcNetworkStatus } from '../services/arcService.js';
import { listMarketplace } from '../services/marketplaceService.js';

const guard = x402Guard({ purpose: 'Premium API', price: X402_DEFAULT_PRICE });

/** GET /api/x402/provider-insights — full provider intelligence (Graph). */
export const premiumProviderInsights = [guard, async (req, res) => {
  try {
    const providers = await analyzeProviders({});
    return ok(res, { providers, recommendation: providers[0] || null, paidBy: req.x402?.payer || null, txHash: req.x402?.txHash || null });
  } catch (err) {
    return handleError(res, err, 'x402:provider-insights');
  }
}];

/** GET /api/x402/trust-analysis — Graph status + top-provider recommendation. */
export const premiumTrustAnalysis = [guard, async (req, res) => {
  try {
    const [graph, providers] = await Promise.all([getGraphStatus(), analyzeProviders({})]);
    return ok(res, { graph, topProvider: providers[0] || null, providerCount: providers.length, paidBy: req.x402?.payer || null });
  } catch (err) {
    return handleError(res, err, 'x402:trust-analysis');
  }
}];

/** GET /api/x402/market-data — live marketplace listing + Arc network status. */
export const premiumMarketData = [guard, async (req, res) => {
  try {
    const [market, arc] = await Promise.all([
      listMarketplace({ perPage: 50 }).catch(() => ({ services: [] })),
      getArcNetworkStatus().catch(() => null)
    ]);
    return ok(res, {
      services: market?.services || [],
      total: market?.total ?? null,
      arc,
      paidBy: req.x402?.payer || null,
      txHash: req.x402?.txHash || null
    });
  } catch (err) {
    return handleError(res, err, 'x402:market-data');
  }
}];

/** GET /api/x402/overview — free console data: protected APIs, payments, revenue. */
export const x402Overview = async (req, res) => {
  try {
    const [services, payments, revenue] = await Promise.all([
      listProtectedServices().catch(() => []),
      listPayments({ limit: 25 }).catch(() => []),
      revenueStats().catch(() => ({ count: 0, totalUsdc: 0 }))
    ]);
    return ok(res, {
      price: X402_DEFAULT_PRICE,
      graphConfigured: isGraphConfigured(),
      protectedServices: services,
      payments,
      revenue
    });
  } catch (err) {
    return handleError(res, err, 'x402:overview');
  }
};
