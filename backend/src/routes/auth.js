import express from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refreshSession, linking, update, fetchDetail, verifyWeb3KYC, updatePrimaryWallet, updateExternalWallet, updateWallet, walletChallenge, mpcCreateWallet, mpcGetWallet, mpcSign, mpcSend } from '../controllers/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { validate, registerSchema, loginSchema, refreshSessionSchema, linkingSchema, updateProfileSchema, updateExternalWalletSchema, updatePrimaryWalletSchema, updateWalletSchema, verifyWeb3KYCSchema } from '../middleware/validators.js';

const router = express.Router();

// Prevent hitting Supabase Auth rate limit
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  skipSuccessfulRequests: true,
  skip: (req) => process.env.NODE_ENV === 'development',
  message: { message: 'Too many login attempts. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/register', validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshSessionSchema), refreshSession);

// Private routes
router.post('/linking', authMiddleware, validate(linkingSchema), linking);
router.put('/update', authMiddleware, validate(updateProfileSchema), update);
router.post('/verify-web3-kyc', authMiddleware, validate(verifyWeb3KYCSchema), verifyWeb3KYC);
router.put('/update-primary-wallet', authMiddleware, validate(updatePrimaryWalletSchema), updatePrimaryWallet);
router.put('/update-external-wallet', authMiddleware, validate(updateExternalWalletSchema), updateExternalWallet);
router.post('/wallet-challenge', authMiddleware, walletChallenge);
router.post('/update-wallet', authMiddleware, validate(updateWalletSchema), updateWallet);
router.post('/mpc-create-wallet', authMiddleware, mpcCreateWallet);
router.get('/mpc-wallet', authMiddleware, mpcGetWallet);
router.post('/mpc-sign', authMiddleware, mpcSign);
router.post('/mpc-send', authMiddleware, mpcSend);

// Fetch user details
// Use GET with query params
router.get('/fetchdetail', authMiddleware, fetchDetail);

export default router;
