// src/routes/moneyTransferRoutes.js
import express from 'express';
import moneyTransferController from '../controllers/moneyTransferController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validate, createMoneyTransferSchema, requestMoneyCreateSchema } from '../middleware/validators.js';

const router = express.Router();

router.post('/create', authMiddleware, validate(createMoneyTransferSchema), moneyTransferController.createMoneyTransfer);
router.get('/', authMiddleware, moneyTransferController.getMoneyTransfers);
router.get('/external', authMiddleware, moneyTransferController.getMoneyTransfersExternal);
router.post('/money-requested', authMiddleware, validate(requestMoneyCreateSchema), moneyTransferController.requestMoneyCreate);

// ✅ SECURITY: Added authMiddleware to previously unauthenticated routes
router.get('/request', authMiddleware, moneyTransferController.getAllRawDocs);
router.get('/all-request-money', authMiddleware, moneyTransferController.getAllRequestMoney);
router.get('/requests', authMiddleware, moneyTransferController.getFilteredRequests);

// ✅ SECURITY: Added authMiddleware + ownership is checked in the controller
router.delete('/request-money/:reqId', authMiddleware, moneyTransferController.resolveRequestMoney);

export default router;
