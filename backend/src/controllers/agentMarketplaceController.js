import {
  listPublishableAgents,
  publishAgent,
  updateListing,
  deleteListing,
  listPublisherListings,
  browseListings,
  getListingDetail,
  publishVersion,
  listVersions,
  installAgent,
  listInstallations,
  getInstallationDetail,
  updateInstallation,
  cancelInstallation,
  listSubscriptions,
  changeSubscription,
  renewSubscription,
  invokeInstalledAgent,
  submitReview,
  listReviews,
  providerStoreDashboard,
  consumerAgentDashboard
} from '../services/agentMarketplaceService.js';
import { ok, handleError } from '../utils/respond.js';

export const devPublishableAgents = async (req, res) => {
  try {
    const agents = await listPublishableAgents({ organizationId: req.organization.id, developerId: req.developerId });
    return ok(res, { agents });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devPublishAgent = async (req, res) => {
  try {
    const listing = await publishAgent({
      developerId: req.developerId,
      organizationId: req.organization.id,
      agentId: req.params.agentId,
      fields: req.body,
      createDefaultService: req.body.createDefaultService === true
    });
    return ok(res, { message: `🛒 "${listing.title}" is now published on the Agent Marketplace.`, listing }, listing.agentId ? 201 : 200);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devUpdateListing = async (req, res) => {
  try {
    const listing = await updateListing({ developerId: req.developerId, organizationId: req.organization.id, listingId: req.params.listingId, patch: req.body });
    return ok(res, { message: '✅ Agent listing updated.', listing });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devDeleteListing = async (req, res) => {
  try {
    const result = await deleteListing({ developerId: req.developerId, organizationId: req.organization.id, listingId: req.params.listingId });
    return ok(res, { message: '🗑️ Agent listing deleted.', ...result });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devMyListings = async (req, res) => {
  try {
    const listings = await listPublisherListings({ organizationId: req.organization.id });
    return ok(res, { count: listings.length, listings });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devBrowse = async (req, res) => {
  try {
    const result = await browseListings({
      organizationId: req.organization.id,
      search: req.query.search,
      category: req.query.category,
      tag: req.query.tag,
      sort: req.query.sort,
      page: req.query.page,
      perPage: req.query.perPage
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devListingDetail = async (req, res) => {
  try {
    const result = await getListingDetail({ organizationId: req.organization.id, listingId: req.params.listingId });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devPublishVersion = async (req, res) => {
  try {
    const listing = await publishVersion({
      developerId: req.developerId,
      organizationId: req.organization.id,
      listingId: req.params.listingId,
      version: req.body.version,
      changelog: req.body.changelog,
      releaseNotes: req.body.releaseNotes
    });
    return ok(res, { message: `🧪 Version ${listing.version} published. Customers will be notified of an update.`, listing }, 201);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devListVersions = async (req, res) => {
  try {
    const versions = await listVersions({ organizationId: req.organization.id, listingId: req.params.listingId });
    return ok(res, { versions });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devInstall = async (req, res) => {
  try {
    const result = await installAgent({
      developerId: req.developerId,
      organizationId: req.organization.id,
      listingId: req.body.listingId,
      actingAgentId: req.body.actingAgentId,
      configuration: req.body.configuration,
      plan: req.body.plan
    });
    const sub = result.subscription;
    const msg = result.alreadyInstalled
      ? 'ℹ️ Agent is already installed.'
      : (sub ? `🔌 Agent installed — subscription ${sub.subscriptionId} is active (${sub.priceBOT} USDC/${sub.billingCycle}).` : '🔌 Agent installed (free).');
    return ok(res, { message: msg, ...result }, result.alreadyInstalled ? 200 : 201);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devListInstallations = async (req, res) => {
  try {
    const result = await listInstallations({ organizationId: req.organization.id, status: req.query.status, page: req.query.page, perPage: req.query.perPage });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devInstallationDetail = async (req, res) => {
  try {
    const result = await getInstallationDetail({ organizationId: req.organization.id, installationId: req.params.installationId });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devUpdateInstallation = async (req, res) => {
  try {
    const installation = await updateInstallation({ developerId: req.developerId, organizationId: req.organization.id, installationId: req.params.installationId, patch: req.body });
    return ok(res, { message: '✅ Installation updated.', installation });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devCancelInstallation = async (req, res) => {
  try {
    const result = await cancelInstallation({ developerId: req.developerId, organizationId: req.organization.id, installationId: req.params.installationId });
    return ok(res, { message: '⏹️ Agent uninstalled.', ...result });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devInvoke = async (req, res) => {
  try {
    const result = await invokeInstalledAgent({
      developerId: req.developerId,
      organizationId: req.organization.id,
      installationId: req.params.installationId,
      input: req.body.input,
      consumerAgentId: req.body.consumerAgentId
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devListSubscriptions = async (req, res) => {
  try {
    const result = await listSubscriptions({ organizationId: req.organization.id, page: req.query.page, perPage: req.query.perPage });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devChangeSubscription = async (req, res) => {
  try {
    const subscription = await changeSubscription({ developerId: req.developerId, organizationId: req.organization.id, installationId: req.params.installationId, patch: req.body });
    return ok(res, { message: '💳 Subscription updated.', subscription });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devRenewSubscription = async (req, res) => {
  try {
    const result = await renewSubscription({ developerId: req.developerId, organizationId: req.organization.id, installationId: req.params.installationId, force: !!req.body.force });
    return ok(res, { message: result.invoiceId ? `🔄 Renewal billed — ${result.invoiceId} created through the invoice engine.` : '🔄 Subscription period renewed.', ...result });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devSubmitReview = async (req, res) => {
  try {
    const review = await submitReview({
      developerId: req.developerId,
      organizationId: req.organization.id,
      installationId: req.params.installationId,
      rating: req.body.rating,
      title: req.body.title,
      review: req.body.review
    });
    return ok(res, { message: `⭐ ${review.rating}/5 review saved.`, review }, 201);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devListReviews = async (req, res) => {
  try {
    const result = await listReviews({ listingId: req.params.listingId, page: req.query.page, perPage: req.query.perPage });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devProviderDashboard = async (req, res) => {
  try {
    const dashboard = await providerStoreDashboard({ developerId: req.developerId, organizationId: req.organization.id });
    return ok(res, { dashboard });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};

export const devConsumerDashboard = async (req, res) => {
  try {
    const dashboard = await consumerAgentDashboard({ developerId: req.developerId, organizationId: req.organization.id });
    return ok(res, { dashboard });
  } catch (err) {
    return handleError(res, err, 'agent-marketplace');
  }
};
