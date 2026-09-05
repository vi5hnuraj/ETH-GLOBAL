import express from 'express';
import { FLHistoryRead, FLHistoryWrite } from '../controllers/flashLoanController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validate, flashLoanReadSchema, flashLoanWriteSchema } from '../middleware/validators.js';

const router = express.Router();

// ✅ SECURITY: Added authMiddleware to both endpoints (previously unauthenticated)
router.post('/historyRead', authMiddleware, validate(flashLoanReadSchema), FLHistoryRead);
router.post('/historyWrite', authMiddleware, validate(flashLoanWriteSchema), FLHistoryWrite);

export default router;