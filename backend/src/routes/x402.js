/**
 * x402 Routes — premium APIs behind HTTP 402 + console overview endpoint.
 *
 *   GET /provider-insights   → 402 challenge | live Graph provider intelligence
 *   GET /trust-analysis      → 402 challenge | live Graph snapshot stats
 *   GET /market-data         → 402 challenge | live marketplace + Arc status
 *   GET /overview            → console page data (free)
 *
 * AgentKit layer: requests presenting X-AGENT-WALLET are checked against
 * AgentBook (World Chain). Human-backed agents get free-trial uses before
 * payment is demanded; unregistered bots go straight to the x402 paid path.
 */
import { Router } from 'express';
import { premiumProviderInsights, premiumTrustAnalysis, premiumMarketData, x402Overview } from '../controllers/x402Controller.js';
import { agentKitGate } from '../middleware/agentKitGate.js';

const router = Router();

const agentKit = agentKitGate({ purpose: 'Premium API' });

router.get('/provider-insights', agentKit, premiumProviderInsights);
router.get('/trust-analysis', agentKit, premiumTrustAnalysis);
router.get('/market-data', agentKit, premiumMarketData);
router.get('/overview', x402Overview);

export default router;
