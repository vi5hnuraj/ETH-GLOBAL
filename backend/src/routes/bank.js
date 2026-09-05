import express from 'express';
import { addBankDetails, getAllUsers, linking, swapToCrypto, swapToFiat, getExchangeRates } from '../controllers/bankcontoller.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { getLoggedUserDetails } from '../controllers/bankcontoller.js';
import { validate, addBankDetailsSchema, bankLinkingSchema, swapSchema } from '../middleware/validators.js';

const router = express.Router();

router.post('/add', authMiddleware, validate(addBankDetailsSchema), addBankDetails);
router.get('/all-users', authMiddleware, getAllUsers);
router.get('/user-details', authMiddleware, getLoggedUserDetails);
router.get('/exchange-rates', authMiddleware, getExchangeRates);
router.post('/linking', authMiddleware, validate(bankLinkingSchema), linking);
router.post('/swap-to-crypto', authMiddleware, validate(swapSchema), swapToCrypto);
router.post('/swap-to-fiat', authMiddleware, validate(swapSchema), swapToFiat);

export default router;