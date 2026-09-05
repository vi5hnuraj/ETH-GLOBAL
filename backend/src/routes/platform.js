import express from 'express';
import { health, flags, environment, setMaintenance } from '../controllers/platformController.js';
import { publicOrgProfile } from '../controllers/networkController.js';

const router = express.Router();

// Public operational endpoints — no auth required (harmless reads).
router.get('/health', health);
router.get('/flags', flags);
router.get('/environment', environment);

// Phase 5.1 — public AI company profile (public data only).
router.get('/orgs/:slug', publicOrgProfile);

// Maintenance toggle is an operator action; protected later via /developers.
router.post('/maintenance', (req, res) => {
  res.status(403).json({ success: false, message: 'Use /developers/platform/maintenance (authenticated).' });
});

export default router;