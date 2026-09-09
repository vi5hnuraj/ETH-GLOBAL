/**
 * WebhookController — CRUD for webhook endpoints, deliveries and retry.
 */

import {
  listEndpoints,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  listDeliveries,
  retryDelivery,
  verifySignature,
  getWebhookStats,
  rotateEndpointSecret,
  getDelivery,
  replayDelivery,
  SUPPORTED_EVENTS
} from '../services/webhookService.js';
import { ok, handleError } from '../utils/respond.js';

export const events = (_req, res) => ok(res, { events: SUPPORTED_EVENTS });

export const verify = (req, res) => {
  const { secret, timestamp, signature, payload } = req.body || {};
  if (!secret || !timestamp || !signature || payload === undefined) {
    return res
      .status(400)
      .json({ success: false, message: 'secret, timestamp, signature, and payload are required.' });
  }
  const valid = verifySignature({
    secret,
    timestamp,
    payload,
    signature,
    maxAgeMs: 5 * 60 * 1000 // reject replayed signatures older than 5 minutes
  });
  ok(res, { valid });
};

export const endpoints = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved. Please select an organization.' });
    ok(res, { endpoints: await listEndpoints(req.organization.id) });
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const create = async (req, res) => {
  try {
    const { url, description, events } = req.body || {};
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ success: false, message: 'A valid http(s) URL is required.' });
    }
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, await createEndpoint({ developerId: req.developerId, organizationId: req.organization.id, url, description, events }), 201);
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const update = async (req, res) => {
  try {
    const { url, events, ...rest } = req.body || {};
    if (url !== undefined && !/^https?:\/\//.test(String(url))) {
      return res.status(400).json({ success: false, message: 'A valid http(s) URL is required.' });
    }
    if (events !== undefined) {
      const invalid = (Array.isArray(events) ? events : []).filter((e) => !SUPPORTED_EVENTS.includes(e));
      if (invalid.length) {
        return res.status(400).json({ success: false, message: `Unsupported webhook events: ${invalid.join(', ')}` });
      }
    }
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, await updateEndpoint({ developerId: req.developerId, organizationId: req.organization.id, id: req.params.id, url, events, ...rest }));
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const remove = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    await deleteEndpoint({ developerId: req.developerId, organizationId: req.organization.id, id: req.params.id });
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const deliveries = async (req, res) => {
  try {
    const { endpointId, limit } = req.query;
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, { deliveries: await listDeliveries({ organizationId: req.organization.id, endpointId, limit }) });
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const retry = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, await retryDelivery({ developerId: req.developerId, organizationId: req.organization.id, deliveryId: req.params.id }));
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const stats = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, { stats: await getWebhookStats(req.organization.id) });
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const rotate = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, await rotateEndpointSecret({ developerId: req.developerId, organizationId: req.organization.id, id: req.params.id }));
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const delivery = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, { delivery: await getDelivery({ organizationId: req.organization.id, deliveryId: req.params.id }) });
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};

export const replay = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ success: false, message: 'Organization not resolved.' });
    ok(res, await replayDelivery({ developerId: req.developerId, organizationId: req.organization.id, deliveryId: req.params.id }));
  } catch (err) {
    handleError(res, err, 'webhooks');
  }
};
