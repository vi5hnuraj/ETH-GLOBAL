/**
 * x402 Routes — premium APIs behind HTTP 402 + console overview endpoint.
 *
 *   GET /provider-insights   → 402 challenge | live Graph provider intelligence
 *   GET /trust-analysis      → 402 challenge | live Graph snapshot stats
 *   GET /market-data         → 402 challenge | live marketplace + Arc status
 *   GET /overview            → console page data (free)
 */
import { Router } from 'express';
import { premiumProviderInsights, premiumTrustAnalysis, premiumMarketData, x402Overview } from '../controllers/x402Controller.js';

const router = Router();

router.get('/provider-insights', premiumProviderInsights);
router.get('/trust-analysis', premiumTrustAnalysis);
router.get('/market-data', premiumMarketData);
router.get('/overview', x402Overview);

export default router;
