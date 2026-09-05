import express from 'express';
import { paymentsWrite, paymentsRead, paymentsReadExternal } from '../controllers/paymentsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { storeContractFunding, cancelContractFunding, failContractFunding, releaseClaimedSchedule, recoverStuckFunding } from '../controllers/scheduleController.js';
import { validate, paymentsWriteSchema, storeContractFundingSchema, cancelContractFundingSchema, failContractFundingSchema, releaseClaimedScheduleSchema, recoverStuckFundingSchema } from '../middleware/validators.js';

const router = express.Router();

router.post('/paymentWrite', authMiddleware, validate(paymentsWriteSchema), paymentsWrite);
router.get('/paymentRead', authMiddleware, paymentsRead);
router.get('/paymentReadExternal', authMiddleware, paymentsReadExternal);
router.post('/storeContractFunding', authMiddleware, validate(storeContractFundingSchema), storeContractFunding);
router.post('/cancelContractFunding', authMiddleware, validate(cancelContractFundingSchema), cancelContractFunding);
router.post('/failContractFunding', authMiddleware, validate(failContractFundingSchema), failContractFunding);
router.post('/releaseClaimedSchedule', authMiddleware, validate(releaseClaimedScheduleSchema), releaseClaimedSchedule);
router.post('/recoverStuckFunding', authMiddleware, validate(recoverStuckFundingSchema), recoverStuckFunding);

export default router;
