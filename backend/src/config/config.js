import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

// ✅ SECURITY: No hardcoded fallback secrets — all must come from environment
export const JWT_SECRET = process.env.JWT_SECRET;
export const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
export const RPC_URL = process.env.RPC_URL || process.env.BASE_RPC_URL || 'https://sepolia.base.org';
export const EXPLORER_URL = process.env.EXPLORER_URL || process.env.BASE_EXPLORER_URL || 'https://sepolia.basescan.org/';
export const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.BASE_CHAIN_ID || 84532);
export const CHAIN_NAME = process.env.CHAIN_NAME || 'Base Sepolia';
export const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;


// Platform identity — used when the request carries no explicit developer id.
export const DEFAULT_DEVELOPER_ID = process.env.DEFAULT_DEVELOPER_ID || 'dev_local';
export const DEFAULT_WALLET_PROVIDER = process.env.WALLET_PROVIDER || 'local';

// Rate limit applied to agent API keys (per minute). Mirrors the aiLimiter.
export const AGENT_RATE_LIMIT_PER_MIN = Number(process.env.AGENT_RATE_LIMIT_PER_MIN || 30);

// Subscription plan catalog (product configuration, not mock data).
export const PLAN_CATALOG = [
  {
    name: 'free',
    priceCents: 0,
    period: 'month',
    agentLimit: 1,
    requestLimit: 100,
    historyDays: 7,
    support: 'Community',
    highlights: ['1 AI Agent', '100 API Requests/mo', '7-day History', 'Community Support'],
    trialDays: null
  },
  {
    name: 'pro',
    priceCents: 4900,
    annualPriceCents: 3900,
    period: 'month',
    agentLimit: 100,
    requestLimit: 1000000,
    historyDays: null,
    support: 'Priority',
    highlights: ['100 AI Agents', '1M API Requests/mo', 'Forever History', 'Analytics', 'Webhooks', 'API Playground', 'Priority Support'],
    trialDays: 14,
    popular: true
  },
  {
    name: 'enterprise',
    priceCents: 0,
    period: 'custom',
    agentLimit: null,
    requestLimit: null,
    historyDays: null,
    support: 'Dedicated',
    highlights: ['Unlimited AI Agents', 'Unlimited Requests', 'Forever History', 'Dedicated Infrastructure', 'SLA', 'Team Members', 'Custom Limits'],
    trialDays: null
  }
];

export const getPlan = (name) => PLAN_CATALOG.find((p) => p.name === (name || 'free').toLowerCase()) || PLAN_CATALOG[0];

// Revenue attribution split (plan price allocation across revenue lines).
export const REVENUE_ATTRIBUTION = {
  apiUsage: 0.6,
  agent: 0.25,
  walletCreation: 0.15
};

// Platform fees — commission GlobalPay keeps from every transaction.
export const PLATFORM_FEES = {
  marketplace: 5,     // 5% fee on AI service marketplace purchases
  agentStore: 7,      // 7% fee on agent store installs/purchases
  minFeeWei: '100000000000000'  // 0.0001 ETH in wei
};

// Treasury wallet address — derived lazily from TREASURY_PRIVATE_KEY.
let _treasuryAddress = null;
export const getTreasuryAddress = async () => {
  if (_treasuryAddress) return _treasuryAddress;
  try {
    const { ethers } = await import('ethers');
    if (ethers && process.env.TREASURY_PRIVATE_KEY) {
      _treasuryAddress = new ethers.Wallet(process.env.TREASURY_PRIVATE_KEY).address;
      return _treasuryAddress;
    }
  } catch {}
  return null;
};

const requiredEnvVars = ['JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  logger.error(`❌ [FATAL SECURITY ERROR] Missing required environment variables: ${missingVars.join(', ')}`);
  logger.error('The application cannot start without these variables set in .env');
  process.exit(1);
}

if (!process.env.ENCRYPTION_KEY) {
  logger.warn('⚠️ [SECURITY WARNING] ENCRYPTION_KEY is not set. Encryption features will be unavailable.');
}
