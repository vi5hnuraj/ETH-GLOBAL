/**
 * World AgentKit Routes — human-verification endpoints for GlobalPay agents.
 *
 * POST /verify                — verify an agent's wallet against AgentBook
 * GET  /status/:id            — get verification status for an agent
 * POST /lookup                — look up a wallet address (no persistence)
 * GET  /agents                — list all agents with verification status
 * GET  /idkit/config          — IDKit widget config (app_id, rp_id, environment)
 * POST /idkit/sign            — RP signature for the IDKit request (server-side signing key)
 * POST /idkit/verify          — verify an IDKit proof with World + store nullifier
 */
import { Router } from 'express';
import {
  verify, status, lookup, listVerifiedAgents,
  idkitConfig, idkitSign, idkitVerify
} from '../controllers/worldController.js';

const router = Router();

router.post('/verify', verify);
router.get('/status/:agentId', status);
router.post('/lookup', lookup);
router.get('/agents', listVerifiedAgents);
router.get('/idkit/config', idkitConfig);
router.post('/idkit/sign', idkitSign);
router.post('/idkit/verify', idkitVerify);

export default router;
