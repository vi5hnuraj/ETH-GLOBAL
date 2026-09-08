import { Router } from 'express';
import { resolveOrganization, requirePermission } from '../middleware/organizationMiddleware.js';
import { requireWorldVerification } from '../middleware/worldVerificationGate.js';
import { requireScope } from '../middleware/requireScopeMiddleware.js';
import { SCOPES } from '../config/scopes.js';
import {
  devPublishableAgents,
  devPublishAgent,
  devUpdateListing,
  devDeleteListing,
  devMyListings,
  devBrowse,
  devListingDetail,
  devPublishVersion,
  devListVersions,
  devInstall,
  devListInstallations,
  devInstallationDetail,
  devUpdateInstallation,
  devCancelInstallation,
  devInvoke,
  devListSubscriptions,
  devChangeSubscription,
  devRenewSubscription,
  devSubmitReview,
  devListReviews,
  devProviderDashboard,
  devConsumerDashboard
} from '../controllers/agentMarketplaceController.js';

const router = Router();

/**
 * Combined auth guard (same semantics as parent developer router).
 */
const guard = (scope, permission) => {
  const scopes = Array.isArray(scope) ? scope : [scope];
  return [resolveOrganization, requireScope(...scopes), requirePermission(permission)];
};

// ==================== GlobalPay v2 — AI Agent Marketplace ====================
// Route order matters: literal paths before :param paths.

// ---- Publish / manage (provider side) ----
router.get('/agent-marketplace/agents-publishable', ...guard(SCOPES.AGENTS_READ, 'services.read'), devPublishableAgents);
router.get('/agent-marketplace/listings', ...guard(SCOPES.SERVICES_READ, 'services.read'), devMyListings);
router.post('/agent-marketplace/agents/:agentId/publish', ...guard(SCOPES.SERVICES_CREATE, 'services.manage'), requireWorldVerification, devPublishAgent);
router.patch('/agent-marketplace/listing/:listingId', ...guard(SCOPES.SERVICES_UPDATE, 'services.manage'), devUpdateListing);
router.delete('/agent-marketplace/listing/:listingId', ...guard(SCOPES.SERVICES_DELETE, 'services.manage'), devDeleteListing);
router.post('/agent-marketplace/listing/:listingId/versions', ...guard(SCOPES.SERVICES_UPDATE, 'services.manage'), devPublishVersion);
router.get('/agent-marketplace/listing/:listingId/versions', ...guard(SCOPES.SERVICES_READ, 'services.read'), devListVersions);

// ---- Browse (consumer side) ----
router.get('/agent-marketplace/browse', ...guard(SCOPES.SERVICES_READ, 'marketplace.read'), devBrowse);
router.get('/agent-marketplace/browse/:listingId', ...guard(SCOPES.SERVICES_READ, 'marketplace.read'), devListingDetail);
router.get('/agent-marketplace/browse/:listingId/reviews', ...guard(SCOPES.SERVICES_READ, 'marketplace.read'), devListReviews);

// ---- Install / invoke / review (consumer side) ----
router.post('/agent-marketplace/install', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devInstall);
router.get('/agent-marketplace/installations', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), devListInstallations);
router.get('/agent-marketplace/installations/:installationId', ...guard(SCOPES.SESSIONS_READ, 'sessions.read'), devInstallationDetail);
router.patch('/agent-marketplace/installations/:installationId', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devUpdateInstallation);
router.post('/agent-marketplace/installations/:installationId/cancel', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devCancelInstallation);
router.post('/agent-marketplace/installations/:installationId/invoke', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devInvoke);
router.post('/agent-marketplace/installations/:installationId/review', ...guard(SCOPES.SESSIONS_MANAGE, 'sessions.manage'), devSubmitReview);

// ---- Subscriptions ----
router.get('/agent-marketplace/subscriptions', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'billing.read'), devListSubscriptions);
router.post('/agent-marketplace/installations/:installationId/subscription', ...guard(SCOPES.BILLING_MANAGE, 'billing.manage'), devChangeSubscription);
router.post('/agent-marketplace/installations/:installationId/subscription/renew', ...guard(SCOPES.BILLING_MANAGE, 'billing.manage'), devRenewSubscription);

// ---- Dashboards ----
router.get('/agent-marketplace/store/dashboard', ...guard([SCOPES.BILLING_MANAGE, SCOPES.BILLING_READ], 'billing.manage'), devProviderDashboard);
router.get('/agent-marketplace/consumer/dashboard', ...guard(SCOPES.SERVICES_READ, 'usage.read'), devConsumerDashboard);

export default router;