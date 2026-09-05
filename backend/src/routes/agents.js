import express from 'express';
import {
  create, list, balance, pay, history, stats, rotateKey
} from '../controllers/agentsController.js';
import {
  agentCreateService,
  agentListServices,
  agentUpdateService,
  agentDeleteService,
  agentMarketplaceList,
  agentMarketplaceGet,
  agentReportUsage,
  agentListUsage,
  agentListInvoices,
  agentPayInvoice,
  agentRevenue
} from '../controllers/marketplaceController.js';
import {
  agentGetPolicy,
  agentUpsertPolicy,
  agentUpsertCapabilities,
  agentRecommend,
  agentCreateSession,
  agentStartSession,
  agentCancelSession,
  agentListSessions,
  agentGetSession,
  agentGetReputation
} from '../controllers/commerceController.js';
import agentApiKeyMiddleware from '../middleware/agentApiKeyMiddleware.js';
import agentRateLimitMiddleware from '../middleware/agentRateLimitMiddleware.js';
import {
  validate,
  createAgentSchema,
  agentPaySchema,
  createServiceSchema,
  updateServiceSchema,
  reportUsageSchema,
  policySchema,
  capabilitiesSchema,
  recommendSchema,
  createSessionSchema
} from '../middleware/validators.js';
import developerKeyAuthMiddleware from '../middleware/developerKeyAuthMiddleware.js';

const router = express.Router();

router.use(developerKeyAuthMiddleware);

// Public / developer endpoints
router.post('/create', validate(createAgentSchema), create);
router.get('/', list);

// ==================== Service Marketplace (agent-scoped) ====================
router.get('/services', agentApiKeyMiddleware, agentRateLimitMiddleware, agentListServices);
router.post('/services', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(createServiceSchema), agentCreateService);
router.patch('/services/:serviceId', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(updateServiceSchema), agentUpdateService);
router.delete('/services/:serviceId', agentApiKeyMiddleware, agentRateLimitMiddleware, agentDeleteService);

router.get('/marketplace', agentApiKeyMiddleware, agentRateLimitMiddleware, agentMarketplaceList);
  // Autonomous commerce (route order matters: literal paths before :param paths)
  router.post('/marketplace/recommend', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(recommendSchema), agentRecommend);
  router.post('/marketplace/sessions', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(createSessionSchema), agentCreateSession);
  router.get('/marketplace/sessions', agentApiKeyMiddleware, agentRateLimitMiddleware, agentListSessions);
  router.get('/marketplace/sessions/:sessionId', agentApiKeyMiddleware, agentRateLimitMiddleware, agentGetSession);
  router.post('/marketplace/sessions/:sessionId/start', agentApiKeyMiddleware, agentRateLimitMiddleware, agentStartSession);
  router.post('/marketplace/sessions/:sessionId/cancel', agentApiKeyMiddleware, agentRateLimitMiddleware, agentCancelSession);
  router.get('/commerce/policy', agentApiKeyMiddleware, agentRateLimitMiddleware, agentGetPolicy);
  router.put('/commerce/policy', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(policySchema), agentUpsertPolicy);
  router.put('/services/:serviceId/capabilities', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(capabilitiesSchema), agentUpsertCapabilities);
  router.get('/reputation', agentApiKeyMiddleware, agentRateLimitMiddleware, agentGetReputation);
  router.get('/marketplace/:serviceId', agentApiKeyMiddleware, agentRateLimitMiddleware, agentMarketplaceGet);

router.post('/usage', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(reportUsageSchema), agentReportUsage);
router.get('/usage', agentApiKeyMiddleware, agentRateLimitMiddleware, agentListUsage);

router.get('/invoices', agentApiKeyMiddleware, agentRateLimitMiddleware, agentListInvoices);
router.post('/invoices/:invoiceId/pay', agentApiKeyMiddleware, agentRateLimitMiddleware, agentPayInvoice);

router.get('/revenue', agentApiKeyMiddleware, agentRateLimitMiddleware, agentRevenue);

// Agent-scoped endpoints (authenticated with the agent's API key)
router.get('/balance', agentApiKeyMiddleware, agentRateLimitMiddleware, balance);
router.post('/pay', agentApiKeyMiddleware, agentRateLimitMiddleware, validate(agentPaySchema), pay);
router.get('/history', agentApiKeyMiddleware, agentRateLimitMiddleware, history);
router.get('/stats', agentApiKeyMiddleware, agentRateLimitMiddleware, stats);
router.post('/rotate-key', agentApiKeyMiddleware, agentRateLimitMiddleware, rotateKey);

export default router;