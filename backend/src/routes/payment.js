import express from 'express';
import { createCheckoutSession, verifySession } from '../controllers/paymentController.js';
import { createMoneyTransfer, getMoneyTransfers, smartRouteTransfer } from '../controllers/moneyTransferController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validate, checkoutSessionSchema, verifySessionSchema, createMoneyTransferSchema, smartRouteSchema } from '../middleware/validators.js';

const router = express.Router();

router.post('/create-checkout-session', authMiddleware, validate(checkoutSessionSchema), createCheckoutSession);
router.post('/verify-session', authMiddleware, validate(verifySessionSchema), verifySession);
router.post('/money-transfer/create', authMiddleware, validate(createMoneyTransferSchema), createMoneyTransfer);
router.post('/smart-route', authMiddleware, validate(smartRouteSchema), smartRouteTransfer);

export default router;
