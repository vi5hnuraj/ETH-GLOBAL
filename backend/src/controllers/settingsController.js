/**
 * SettingsController — persisted developer settings + developer API keys.
 */

import { getSettings, saveSettings } from '../services/settingsService.js';
import { listApiKeys, createApiKey, updateApiKey, rotateApiKey, revokeApiKey, deleteApiKey } from '../services/developerApiKeyService.js';
import { ok, handleError } from '../utils/respond.js';

export const get = async (req, res) => {
  try {
    ok(res, { settings: await getSettings(req.developerId) });
  } catch (err) {
    handleError(res, err, 'settings');
  }
};

export const put = async (req, res) => {
  try {
    const patch = req.body || {};
    if (typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ message: 'Settings payload must be an object.' });
    }
    if ('developerId' in patch) {
      return res.status(400).json({ message: 'developerId is not a mutable setting.' });
    }
    if (JSON.stringify(patch).length > 32_000) {
      return res.status(400).json({ message: 'Settings payload too large.' });
    }
    ok(res, { settings: await saveSettings(req.developerId, patch) });
  } catch (err) {
    handleError(res, err, 'settings');
  }
};

export const apiKeys = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ message: 'Organization not found. Please create or select an organization first.' });
    ok(res, { apiKeys: await listApiKeys(req.developerId, req.organization.id) });
  } catch (err) {
    handleError(res, err, 'api-keys');
  }
};

export const createKey = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ message: 'Organization not found. Please create or select an organization first.' });
    const { name, scopes, expiresAt, ipAllowlist } = req.body || {};
    ok(res, await createApiKey({
      developerId: req.developerId,
      organizationId: req.organization.id,
      name,
      scopes,
      expiresAt,
      ipAllowlist,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }), 201);
  } catch (err) {
    handleError(res, err, 'api-keys');
  }
};

export const updateKey = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ message: 'Organization not found.' });
    const { name, scopes, expiresAt, ipAllowlist } = req.body || {};
    ok(res, await updateApiKey({
      developerId: req.developerId,
      organizationId: req.organization.id,
      id: req.params.id,
      name,
      scopes,
      expiresAt,
      ipAllowlist,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }));
  } catch (err) {
    handleError(res, err, 'api-keys');
  }
};

export const rotateKey = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ message: 'Organization not found.' });
    ok(res, await rotateApiKey({
      developerId: req.developerId,
      organizationId: req.organization.id,
      id: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }));
  } catch (err) {
    handleError(res, err, 'api-keys');
  }
};

export const revokeKey = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ message: 'Organization not found.' });
    await revokeApiKey({
      developerId: req.developerId,
      organizationId: req.organization.id,
      id: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    ok(res, { message: 'API key revoked.' });
  } catch (err) {
    handleError(res, err, 'api-keys');
  }
};

export const deleteKey = async (req, res) => {
  try {
    if (!req.organization) return res.status(403).json({ message: 'Organization not found.' });
    await deleteApiKey({
      developerId: req.developerId,
      organizationId: req.organization.id,
      id: req.params.id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    ok(res, { message: 'API key deleted.' });
  } catch (err) {
    handleError(res, err, 'api-keys');
  }
};
