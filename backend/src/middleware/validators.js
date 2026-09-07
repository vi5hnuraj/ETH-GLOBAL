import Joi from 'joi';

// ==================== Validation Middleware Factory ====================
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: false });
  if (error) {
    const messages = error.details.map(d => d.message).join(', ');
    return res.status(400).json({ message: `Validation error: ${messages}` });
  }
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.query, { abortEarly: false, stripUnknown: false });
  if (error) {
    const messages = error.details.map(d => d.message).join(', ');
    return res.status(400).json({ message: `Validation error: ${messages}` });
  }
  next();
};

// ==================== Shared Patterns ====================
const payTag = Joi.string().max(100).trim();
const walletAddress = Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).message('Invalid EVM wallet address');
const txHash = Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).message('Invalid transaction hash format');
const positiveAmount = Joi.number().positive().max(1e12).prefs({ convert: true });
const email = Joi.string().email().max(254);

// ==================== Auth Schemas ====================
export const registerSchema = Joi.object({
  email: email.required(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().min(1).max(100).trim().required()
});

export const loginSchema = Joi.object({
  email: email.required(),
  password: Joi.string().min(1).max(128).required()
});

export const refreshSessionSchema = Joi.object({
  refreshToken: Joi.string().min(10).max(2048).required()
});

// ==================== Wallet / Profile Schemas ====================
export const linkingSchema = Joi.object({
  upi: payTag.allow('', null),
  metamask: walletAddress.allow('', null),
  bankDetails: Joi.object().allow(null),
  region: Joi.string().max(50).allow('', null)
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().max(100).trim().allow('', null),
  mob: Joi.string().max(20).allow('', null),
  age: Joi.number().integer().min(0).max(150).allow(null),
  dob: Joi.string().max(30).allow('', null),
  address: Joi.string().max(500).allow('', null),
  status: Joi.string().max(50).allow('', null)
});

export const updateExternalWalletSchema = Joi.object({
  walletAddress: walletAddress.allow('', null)
});

export const updatePrimaryWalletSchema = Joi.object({
  primaryReceivingWallet: Joi.string().valid('internal', 'external').required()
});

export const updateWalletSchema = Joi.object({
  internalWalletAddress: walletAddress.required(),
  signature: Joi.string().min(10).max(512).required(),
  forceMigration: Joi.boolean().allow(null)
});

export const walletChallengeSchema = Joi.object({}).unknown(true);

export const verifyWeb3KYCSchema = Joi.object({
  kycProvider: Joi.string().max(50).allow('', null),
  walletAddress: walletAddress.allow('', null)
});

// ==================== Payment Schemas ====================
export const createMoneyTransferSchema = Joi.object({
  senderUPI: payTag.required(),
  receiverUPI: payTag.required(),
  amount: positiveAmount.required(),
  savePercent: Joi.number().min(0).max(100).default(0),
  network: Joi.string().valid('fiat', 'sepolia', 'arc-testnet', 'arc').default('arc-testnet'),
  senderWalletType: Joi.string().max(50).allow('', null),
  txHash: txHash.allow('', null)
});

export const paymentsWriteSchema = Joi.object({
  date: Joi.string().allow('', null),
  to: payTag.required(),
  sender: Joi.string().max(200).allow('', null),
  keyword: Joi.string().max(200).allow('', null),
  amt: Joi.number().min(0).max(1e12).allow(null),
  coin: Joi.string().max(20).allow('', null),
  txHash: txHash.required(),
  requestedAmount: Joi.number().min(0).max(1e12).allow(null),
  requestedCurrency: Joi.string().max(10).allow('', null),
  exchangeRateSnapshot: Joi.number().min(0).allow(null),
  botPriceSnapshot: Joi.number().min(0).allow(null),
  botAmountSnapshot: Joi.number().min(0).allow(null),
  receivingWalletType: Joi.string().max(50).allow('', null),
  senderWalletType: Joi.string().max(50).allow('', null),
  destinationAddress: walletAddress.allow('', null),
  senderWalletAddress: walletAddress.allow('', null),
  reqId: Joi.string().uuid().allow('', null)
});

export const smartRouteSchema = Joi.object({
  amount: positiveAmount.required(),
  currency: Joi.string().max(10).allow('', null),
  payTag: payTag.required()
});

export const requestMoneyCreateSchema = Joi.object({
  name: Joi.string().max(200).allow('', null),
  sender: Joi.string().max(200).allow('', null),
  receiver: Joi.string().max(200).allow('', null),
  amount: positiveAmount.required(),
  currency: Joi.string().max(10).allow('', null)
});

// ==================== Bank Schemas ====================
export const addBankDetailsSchema = Joi.object({
  bankName: Joi.string().max(200).required(),
  ifscCode: Joi.string().max(50).required(),
  accountHolder: Joi.string().max(200).required(),
  accountAddress: Joi.string().max(500).allow('', null),
  accountType: Joi.string().valid('savings', 'current', 'checking').default('savings'),
  amount: Joi.number().min(0).max(1e15).required(),
  region: Joi.string().max(50).allow('', null),
  customPayTag: payTag.allow('', null)
});

export const swapSchema = Joi.object({
  amount: positiveAmount.required(),
  txHash: txHash.allow('', null)
});

export const bankLinkingSchema = Joi.object({
  upi: payTag.required(),
  metamask: walletAddress.required()
});

// ==================== Flash Loan Schemas ====================
export const flashLoanReadSchema = Joi.object({
  address: walletAddress.required()
});

export const flashLoanWriteSchema = Joi.object({
  address: walletAddress.required(),
  date: Joi.string().allow('', null),
  token: Joi.string().max(50).required(),
  amt: Joi.number().required(),
  pft: Joi.number().allow(null)
});

// ==================== Schedule Schemas ====================
export const storeContractFundingSchema = Joi.object({
  transferId: Joi.string().uuid().required(),
  txHash: txHash.required()
});

export const cancelContractFundingSchema = Joi.object({
  transferId: Joi.string().uuid().required(),
  cancelTxHash: txHash.required()
});

export const failContractFundingSchema = Joi.object({
  transferId: Joi.string().uuid().required()
});

export const releaseClaimedScheduleSchema = Joi.object({
  transferId: Joi.string().uuid().required(),
  txHash: txHash.required()
});

export const recoverStuckFundingSchema = Joi.object({
  transferId: Joi.string().uuid().required(),
  txHash: txHash.required()
});

// ==================== AI Agent Schema ====================
export const agentChatSchema = Joi.object({
  message: Joi.string().min(1).max(2000).trim().required(),
  timezoneOffset: Joi.number().integer().min(-840).max(840).optional()
});

export const createAiWalletSchema = Joi.object({
  name: Joi.string().max(120).trim().allow('', null),
  ownerEmail: Joi.string().email().max(254).allow('', null)
});

export const aiAgentSendSchema = Joi.object({
  destinationAddress: walletAddress.required(),
  amount: Joi.number().positive().max(1e12).allow(null),
  wei: Joi.string().pattern(/^\d+$/).allow('', null),
  note: Joi.string().max(500).allow('', null)
});

// ==================== AI Agent Platform (agents/*) ====================
export const createAgentSchema = Joi.object({
  name: Joi.string().min(1).max(120).trim().required(),
  description: Joi.string().max(1000).trim().allow('', null),
  developerId: Joi.string().max(200).allow('', null)
});

export const agentPaySchema = Joi.object({
  to: walletAddress.required(),
  amount: Joi.number().positive().max(1e12).allow(null),
  token: Joi.string().max(20).default('USDC').allow('', null),
  wei: Joi.string().pattern(/^\d+$/).allow('', null),
  note: Joi.string().max(500).allow('', null)
}).custom((value, helpers) => {
  if (!value.amount && !value.wei) {
    return helpers.error('any.custom', { message: 'Provide either amount (USDC) or wei.' });
  }
  return value;
}, 'agent pay requires amount or wei');

// ==================== Service Marketplace ====================
const decimalString = Joi.string().pattern(/^\d+(\.\d+)?$/).message('Value must be a non-negative decimal string');
const quantityString = Joi.string().pattern(/^\d+(\.\d+)?$/).message('Quantity must be a positive decimal string');
const serviceCategory = Joi.string().valid('gpu', 'storage', 'ai-model', 'translation', 'ocr', 'voice', 'video', 'compute', 'api', 'other');
const servicePricingModel = Joi.string().valid('per_unit', 'per_hour', 'per_request', 'per_char', 'per_mb_day', 'flat', 'subscription');

export const createServiceSchema = Joi.object({
  title: Joi.string().min(1).max(120).trim().required(),
  description: Joi.string().max(2000).trim().allow('', null),
  category: serviceCategory.default('compute'),
  pricingModel: servicePricingModel.default('per_unit'),
  unitPrice: decimalString.required(),
  unitLabel: Joi.string().max(60).trim().allow('', null),
  metadata: Joi.object().allow(null)
});

export const updateServiceSchema = Joi.object({
  title: Joi.string().min(1).max(120).trim(),
  description: Joi.string().max(2000).trim().allow('', null),
  category: serviceCategory,
  pricingModel: servicePricingModel,
  unitPrice: decimalString,
  unitLabel: Joi.string().max(60).trim().allow('', null),
  isActive: Joi.boolean(),
  metadata: Joi.object().allow(null)
}).min(1);

export const devCreateServiceSchema = createServiceSchema.keys({
  agentId: Joi.string().pattern(/^agt_/).required(),
  endpointUrl: Joi.string().uri().allow('', null),
  healthCheckUrl: Joi.string().uri().allow('', null)
});

export const devUpdateServiceSchema = updateServiceSchema.keys({
  agentId: Joi.string().pattern(/^agt_/).required(),
  endpointUrl: Joi.string().uri().allow('', null),
  healthCheckUrl: Joi.string().uri().allow('', null)
});

export const reportUsageSchema = Joi.object({
  serviceId: Joi.string().pattern(/^srv_/).required(),
  quantity: quantityString.required(),
  consumerAgentId: Joi.string().pattern(/^agt_/).allow('', null),
  sessionId: Joi.string().pattern(/^psn_/).allow('', null),
  metadata: Joi.object().allow(null)
});

export const payInvoiceSchema = Joi.object({
  consumerAgentId: Joi.string().pattern(/^agt_/).allow('', null)
});

// ==================== Autonomous Commerce ====================
const stringArray = Joi.array().items(Joi.string().trim().min(1)).default([]);
const nullableNumber = Joi.number().allow(null, '');

export const policySchema = Joi.object({
  policy: Joi.object({
    maxBudgetBOT: Joi.alternatives().try(Joi.string().pattern(/^\d+(\.\d+)?$/), Joi.number()),
    preferredRegions: stringArray,
    blockedRegions: stringArray,
    approvedProviders: stringArray,
    blockedProviders: stringArray,
    preferredGpuModels: stringArray,
    minimumVramGb: Joi.number().integer().min(0).allow(null),
    minimumAvailabilityPct: Joi.number().min(0).max(100).allow(null),
    minimumTrustScore: Joi.number().min(0).max(100).allow(null),
    maximumLatencyMs: Joi.number().integer().min(0).allow(null),
    preferredCurrencies: stringArray,
    autoPurchaseEnabled: Joi.boolean(),
    invoiceApprovalThresholdBOT: Joi.alternatives().try(Joi.string().pattern(/^\d+(\.\d+)?$/), Joi.number()).allow(null, ''),
    spendingLimits: Joi.object().allow(null),
    departments: Joi.object().allow(null),
    metadata: Joi.object().allow(null)
  }).min(1).unknown(false)
});

export const capabilitiesSchema = Joi.object({
  capabilities: Joi.object({
    supportedModels: Joi.array().items(Joi.string().trim().min(1)).default([]),
    gpuModel: Joi.string().trim().max(60).allow('', null),
    vramGb: Joi.number().integer().min(0).allow(null),
    cudaVersion: Joi.string().trim().max(30).allow('', null),
    inference: Joi.boolean(),
    training: Joi.boolean(),
    imageGeneration: Joi.boolean(),
    embeddings: Joi.boolean(),
    speech: Joi.boolean(),
    ocr: Joi.boolean(),
    translation: Joi.boolean(),
    storage: Joi.boolean(),
    supportedRegions: Joi.array().items(Joi.string().trim().min(1)).default([]),
    averageLatencyMs: Joi.number().integer().min(0).allow(null),
    averageResponseTimeMs: Joi.number().integer().min(0).allow(null),
    uptimePct: Joi.number().min(0).max(100).allow(null),
    completedJobs: Joi.number().integer().min(0),
    activeJobs: Joi.number().integer().min(0),
    averageRating: Joi.number().min(0).max(5).allow(null),
    monthlyRevenueBOT: Joi.alternatives().try(Joi.string().pattern(/^\d+(\.\d+)?$/), Joi.number()),
    metadata: Joi.object().allow(null)
  }).min(1).unknown(false)
});

export const recommendSchema = Joi.object({
  task: Joi.string().trim().min(3).max(500).required(),
  requirements: Joi.object({
    model: Joi.string().trim().max(100).allow('', null),
    gpuModel: Joi.string().trim().max(60).allow('', null),
    minVram: Joi.number().integer().min(0).allow(null),
    region: Joi.string().trim().max(60).allow('', null),
    maxBudgetBot: Joi.number().min(0).allow(null),
    maxLatencyMs: Joi.number().integer().min(0).allow(null),
    minAvailability: Joi.number().min(0).max(100).allow(null),
    minTrustScore: Joi.number().min(0).max(100).allow(null),
    capability: Joi.string().valid('inference', 'training', 'imageGeneration', 'embeddings', 'speech', 'ocr', 'translation', 'storage').allow('', null),
    quantity: Joi.alternatives().try(Joi.string().pattern(/^\d+(\.\d+)?$/), Joi.number())
  }).allow(null)
});

export const createSessionSchema = Joi.object({
  serviceId: Joi.string().pattern(/^srv_/).required(),
  quantity: Joi.alternatives().try(Joi.string().pattern(/^\d+(\.\d+)?$/), Joi.number()).required(),
  consumerAgentId: Joi.string().pattern(/^agt_/).allow('', null),
  reason: Joi.string().trim().max(500).allow('', null),
  confidenceScore: Joi.number().min(0).max(100).allow(null),
  source: Joi.string().valid('recommend', 'manual', 'policy', 'prepaid').default('manual')
});

export const prepaidIntentSchema = Joi.object({
  serviceId: Joi.string().pattern(/^srv_/).required(),
  quantity: Joi.alternatives().try(Joi.string().pattern(/^\d+(\.\d+)?$/), Joi.number()).required(),
  consumerAgentId: Joi.string().pattern(/^agt_/).required(),
  reason: Joi.string().trim().max(500).allow('', null)
});

export const prepaidConfirmSchema = Joi.object({}).min(0);

export const devCapabilitiesSchema = capabilitiesSchema.keys({
  agentId: Joi.string().pattern(/^agt_/).required()
});

// ==================== Checkout Schema ====================
export const checkoutSessionSchema = Joi.object({
  amount: positiveAmount.required()
});

export const verifySessionSchema = Joi.object({
  session_id: Joi.string().min(1).max(500).required()
});

// ==================== Developer Platform Schemas ====================

export const devCreateAgentSchema = Joi.object({
  name: Joi.string().min(1).max(100).trim().required(),
  description: Joi.string().max(500).trim().allow('', null),
  category: Joi.string().max(50).trim().allow('', null)
});

export const devCreateKeySchema = Joi.object({
  name: Joi.string().min(1).max(100).trim().required(),
  scopes: Joi.array().items(Joi.string().max(100)),
  expiresAt: Joi.string().isoDate().allow('', null),
  ipAllowlist: Joi.array().items(Joi.string().max(45)).max(20)
});

export const devAgentPaySchema = Joi.object({
  destination: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required().messages({ 'any.required': 'Destination address is required' }),
  amount: Joi.number().positive().max(1e12).required().messages({ 'any.required': 'Amount is required' }),
  token: Joi.string().max(100).allow('', null)
});
