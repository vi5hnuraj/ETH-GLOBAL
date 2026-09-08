/**
 * World AgentKit Routes — human-verification endpoints for GlobalPay agents.
 *
 * POST /verify        — verify an agent's wallet against AgentBook
 * GET  /status/:id    — get verification status for an agent
 * POST /lookup        — look up a wallet address (no persistence)
 * GET  /agents        — list all agents with verification status
 */
import { Router } from 'express';
import { verify, status, lookup, listVerifiedAgents } from '../controllers/worldController.js';

const router = Router();

router.post('/verify', verify);
router.get('/status/:agentId', status);
router.post('/lookup', lookup);
router.get('/agents', listVerifiedAgents);

export default router;
