import express from 'express';
import developerContextMiddleware from '../middleware/developerContextMiddleware.js';
import developerKeyAuthMiddleware from '../middleware/developerKeyAuthMiddleware.js';
import usageMiddleware from '../middleware/usageMiddleware.js';
import { resolveOrganization, requirePermission } from '../middleware/organizationMiddleware.js';
import { requireScope } from '../middleware/requireScopeMiddleware.js';
import { devCreateAgentSchema, devCreateKeySchema, devAgentPaySchema } from '../middleware/validators.js';
import { SCOPES, V3_SCOPES, SUPPORTED_SCOPES } from '../config/scopes.js';
import organizationRoutes from './organization.js';
import { setMaintenance } from '../controllers/platformController.js';
import quotaMiddleware from '../middleware/quotaMiddleware.js';
import {
  status,
  dashboard,
  analytics,
  usage,
  revenue,
  agents,
  agentCreate,
  agentDelete,
  agentSuspend,
  agentResume,
  agentDetail,
  agentBalanceHandler,
  agentPayHandler,
  agentHistoryHandler,
  agentStatsHandler,
  agentRotateHandler,
  requestLogs,
  monitoring,
  auditLogs,
  quotaStatus
} from '../controllers/developerController.js';
import { billing, subscribe, paySubscription } from '../controllers/billingController.js';
import { get, put, apiKeys, createKey, updateKey, rotateKey, revokeKey, deleteKey } from '../controllers/settingsController.js';
import {
  events,
  endpoints,
  create,
  update,
  remove,
  deliveries,
  retry,
  verify
} from '../controllers/webhookController.js';
import {
  devCreateService,
  devListServices,
  devUpdateService,
  devDeleteService,
  devMarketplaceList,
  devMarketplaceGet,
  devListUsage,
  devListInvoices,
  devGetInvoice,
  devPayInvoice,
  devReportUsage,
  devMarketplaceStats
} from '../controllers/marketplaceController.js';
import { requestLogsExport } from '../controllers/developerController.js';
import networkRoutes from './network.js';
import agentMarketplaceRoutes from './agentMarketplace.js';
import {
  devUpdateCapabilities,
  devRecommend,
  devCreateSession,
  devStartSession,
  devCancelSession,
  devListSessions,
  devGetSession,
  devCreatePrepaidIntent,
  devConfirmPrepaidPurchase,
  devOptimization,
  devCommerceDashboard,
  devGraph,
  devMonthlyReport,
  devCompliance
} from '../controllers/commerceController.js';
import {
  validate,
  createServiceSchema,
  devCreateServiceSchema,
  devUpdateServiceSchema,
  payInvoiceSchema,
  reportUsageSchema,
  devCapabilitiesSchema,
  recommendSchema,
  createSessionSchema,
  prepaidIntentSchema,
  prepaidConfirmSchema
} from '../middleware/validators.js';
import { ok } from '../utils/respond.js';

const router = express.Router();

router.use(developerKeyAuthMiddleware);
router.use(developerContextMiddleware);

// Setup detection + scope catalog — always reachable.
router.get('/status', status);
router.get('/scopes', (_req, res) => ok(res, { scopes: SUPPORTED_SCOPES, v3Scopes: V3_SCOPES }));

/**
 * Combined auth guard for tenant-aware endpoints. Enforced order:
 *   resolveOrganization (membership + tenant) -> requireScope (API key scope)
 *   -> requirePermission (organization role).
 */
const guard = (scope, permission) => {
  const scopes = Array.isArray(scope) ? scope : [scope];
  return [resolveOrganization, requireScope(...scopes), requirePermission(permission)];
};

// ==================== Multi-tenant organizations + RBAC ====================
router.use(organizationRoutes);
router.use(networkRoutes);
router.use(agentMarketplaceRoutes);

// ==================== Platform aggregates ====================
router.get('/dashboard', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, dashboard);
router.get('/analytics', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, analytics);
router.get('/usage', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, usage);
router.get('/revenue', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'billing.manage'), usageMiddleware, revenue);
router.get('/agents', ...guard(SCOPES.AGENTS_READ, 'agents.read'), usageMiddleware, agents);
router.post('/agents', ...guard(SCOPES.AGENTS_CREATE, 'agents.manage'), usageMiddleware, validate(devCreateAgentSchema), agentCreate);
router.delete('/agents/:agentId', ...guard(SCOPES.AGENTS_DELETE, 'agents.manage'), usageMiddleware, agentDelete);
router.post('/agents/:agentId/suspend', ...guard(SCOPES.AGENTS_UPDATE, 'agents.manage'), usageMiddleware, agentSuspend);
router.post('/agents/:agentId/resume', ...guard(SCOPES.AGENTS_UPDATE, 'agents.manage'), usageMiddleware, agentResume);
router.get('/agents/:agentId', ...guard(SCOPES.AGENTS_READ, 'agents.read'), usageMiddleware, agentDetail);
router.get('/agents/:agentId/balance', ...guard(SCOPES.WALLETS_READ, 'wallets.read'), usageMiddleware, agentBalanceHandler);
router.post('/agents/:agentId/pay', ...guard(SCOPES.PAYMENTS_CREATE, 'payments.create'), usageMiddleware, validate(devAgentPaySchema), agentPayHandler);
router.get('/agents/:agentId/history', ...guard([SCOPES.HISTORY_READ, SCOPES.TRANSACTIONS_READ], 'history.read'), usageMiddleware, agentHistoryHandler);
router.get('/agents/:agentId/stats', ...guard([SCOPES.HISTORY_READ, SCOPES.TRANSACTIONS_READ], 'history.read'), usageMiddleware, agentStatsHandler);
router.post('/agents/:agentId/rotate-key', ...guard(SCOPES.AGENTS_UPDATE, 'agents.manage'), usageMiddleware, agentRotateHandler);
router.get('/requests', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, requestLogs);
router.get('/requests/export', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, requestLogsExport);

// Monitoring + audit
router.get('/monitoring', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, monitoring);
router.get('/audit', ...guard([SCOPES.SETTINGS_MANAGE, SCOPES.SETTINGS_READ], 'audit.read'), usageMiddleware, auditLogs);
router.get('/audit/export', ...guard([SCOPES.SETTINGS_MANAGE, SCOPES.SETTINGS_READ], 'audit.read'), usageMiddleware, auditLogs);

// Quotas
router.get('/quota', ...guard(SCOPES.AGENTS_READ, 'usage.read'), usageMiddleware, quotaMiddleware, quotaStatus);

// Operational
router.post('/platform/maintenance', ...guard(SCOPES.SETTINGS_MANAGE, 'settings.manage'), usageMiddleware, setMaintenance);

// Billing
router.get('/billing', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'billing.read'), usageMiddleware, billing);
router.post('/billing/subscribe', ...guard(SCOPES.BILLING_MANAGE, 'billing.manage'), usageMiddleware, subscribe);
router.post('/billing/pay', ...guard(SCOPES.BILLING_MANAGE, 'billing.manage'), usageMiddleware, paySubscription);

// Settings
router.get('/settings', ...guard([SCOPES.SETTINGS_MANAGE, SCOPES.SETTINGS_READ], 'settings.read'), usageMiddleware, get);
router.put('/settings', ...guard(SCOPES.SETTINGS_MANAGE, 'settings.manage'), usageMiddleware, put);

// Developer API keys
router.get('/api-keys', ...guard(SCOPES.SETTINGS_MANAGE, 'keys.read'), usageMiddleware, apiKeys);
router.post('/api-keys', ...guard(SCOPES.SETTINGS_MANAGE, 'keys.manage'), usageMiddleware, validate(devCreateKeySchema), createKey);
router.patch('/api-keys/:id', ...guard(SCOPES.SETTINGS_MANAGE, 'keys.manage'), usageMiddleware, updateKey);
router.post('/api-keys/:id/rotate', ...guard(SCOPES.SETTINGS_MANAGE, 'keys.manage'), usageMiddleware, rotateKey);
router.post('/api-keys/:id/revoke', ...guard(SCOPES.SETTINGS_MANAGE, 'keys.manage'), usageMiddleware, revokeKey);
router.delete('/api-keys/:id', ...guard(SCOPES.SETTINGS_MANAGE, 'keys.manage'), usageMiddleware, deleteKey);

// Webhooks
router.get('/webhooks/events', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_READ], 'webhooks.read'), usageMiddleware, events);
router.get('/webhooks', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_READ], 'webhooks.read'), usageMiddleware, endpoints);
router.post('/webhooks', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_CREATE], 'webhooks.manage'), usageMiddleware, create);
router.put('/webhooks/:id', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_UPDATE], 'webhooks.manage'), usageMiddleware, update);
router.delete('/webhooks/:id', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_DELETE], 'webhooks.manage'), usageMiddleware, remove);
router.get('/webhooks/deliveries', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_READ], 'webhooks.read'), usageMiddleware, deliveries);
router.post('/webhooks/deliveries/:id/retry', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_READ], 'webhooks.manage'), usageMiddleware, retry);  router.post('/webhooks/verify', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_READ], 'webhooks.read'), usageMiddleware, verify);

  // Test endpoint: trigger a test webhook delivery
  router.post('/webhooks/test', ...guard([SCOPES.WEBHOOKS_MANAGE, SCOPES.WEBHOOKS_CREATE], 'webhooks.manage'), usageMiddleware, async (req, res) => {
    try {
      const { dispatchEvent } = await import('../services/webhookService.js');
      const event = req.body?.event || 'agent.created';
      const payload = req.body?.payload || { test: true, timestamp: new Date().toISOString(), message: 'GlobalPay webhook test event' };
      dispatchEvent(event, payload, { developerId: req.developerId, organizationId: req.organization?.id });
      ok(res, { message: `Test event '${event}' dispatched. Check Recent Deliveries.`, event, payload });
    } catch (err) {
      handleError(res, err, 'webhooks');
    }
  });

// ==================== Service Marketplace ====================
// Route order matters: literal paths (marketplace/revenue) before :param routes.
router.get('/marketplace/revenue', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'marketplace.read'), usageMiddleware, devMarketplaceStats);
router.get('/marketplace', ...guard(SCOPES.SERVICES_READ, 'marketplace.read'), usageMiddleware, devMarketplaceList);
  router.get('/marketplace/:serviceId', ...guard(SCOPES.SERVICES_READ, 'marketplace.read'), usageMiddleware, devMarketplaceGet);
  // Autonomous commerce (Phase 1-9; literal paths before :param paths)
  router.post('/marketplace/recommend', ...guard(SCOPES.SERVICES_READ, 'commerce.read'), usageMiddleware, validate(recommendSchema), devRecommend);
  router.put('/services/:serviceId/capabilities', ...guard(SCOPES.SERVICES_UPDATE, 'services.manage'), usageMiddleware, validate(devCapabilitiesSchema), devUpdateCapabilities);
  router.get('/commerce/sessions', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), usageMiddleware, devListSessions);
  router.post('/commerce/sessions', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), usageMiddleware, validate(createSessionSchema), devCreateSession);
  router.post('/commerce/prepaid', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), usageMiddleware, validate(prepaidIntentSchema), devCreatePrepaidIntent);
  router.post('/commerce/prepaid/:sessionId/confirm', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), usageMiddleware, validate(prepaidConfirmSchema), devConfirmPrepaidPurchase);
  router.get('/commerce/sessions/:sessionId', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), usageMiddleware, devGetSession);
  router.post('/commerce/sessions/:sessionId/start', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), usageMiddleware, devStartSession);
  router.post('/commerce/sessions/:sessionId/cancel', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), usageMiddleware, devCancelSession);
  router.get('/commerce/dashboard', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), usageMiddleware, devCommerceDashboard);
  router.get('/commerce/optimization', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), usageMiddleware, devOptimization);
  router.get('/commerce/graph', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), usageMiddleware, devGraph);
  router.get('/commerce/reports/monthly', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'commerce.read'), usageMiddleware, devMonthlyReport);
  router.get('/commerce/compliance', ...guard([SCOPES.SETTINGS_MANAGE, SCOPES.SETTINGS_READ], 'commerce.read'), usageMiddleware, devCompliance);

router.get('/services', ...guard(SCOPES.SERVICES_READ, 'services.read'), usageMiddleware, devListServices);
router.post('/services', ...guard(SCOPES.SERVICES_CREATE, 'services.manage'), usageMiddleware, validate(devCreateServiceSchema), devCreateService);
router.patch('/services/:serviceId', ...guard(SCOPES.SERVICES_UPDATE, 'services.manage'), usageMiddleware, validate(devUpdateServiceSchema), devUpdateService);
router.delete('/services/:serviceId', ...guard(SCOPES.SERVICES_DELETE, 'services.manage'), usageMiddleware, validate(devUpdateServiceSchema), devDeleteService);

// Markets usage lives under /usage-reports to keep the existing /usage (API usage) intact.
router.get('/usage-reports', ...guard(SCOPES.USAGE_READ, 'usage.report'), usageMiddleware, devListUsage);
router.post('/usage-reports', ...guard(SCOPES.USAGE_WRITE, 'usage.report'), usageMiddleware, validate(reportUsageSchema), devReportUsage);

router.get('/invoices', ...guard(SCOPES.INVOICES_READ, 'invoices.read'), usageMiddleware, devListInvoices);
router.get('/invoices/:invoiceId', ...guard(SCOPES.INVOICES_READ, 'invoices.read'), usageMiddleware, devGetInvoice);
router.post('/invoices/:invoiceId/pay', ...guard(SCOPES.INVOICES_WRITE, 'invoices.pay'), usageMiddleware, validate(payInvoiceSchema), devPayInvoice);

export default router;
