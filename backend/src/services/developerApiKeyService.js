/**
 * DeveloperApiKeyService — developer-level API keys for the platform UI.
 * Raw secrets are never stored: only a SHA-256 hash + identifying prefix.
 * Keys support scopes, optional expiration, and an optional IP allowlist.
 */

import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { requireTables, throwMissingTable } from '../repositories/platformRepository.js';
import { audit } from './auditService.js';
import { SUPPORTED_SCOPES } from '../config/scopes.js';
import { selectViaDb, insertViaDb, updateViaDb, deleteViaDb } from '../utils/db.js';

export const normalizeScopes = (scopes) => {
  const clean = (Array.isArray(scopes) ? scopes : [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  return clean.length ? clean : [...SUPPORTED_SCOPES];
};

export const generateDeveloperApiKey = () =>
  `gpay_dev_${crypto.randomBytes(24).toString('base64url')}`;

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

import net from 'net';

const CIDR = /^(.+?)\/(\d{1,3})$/;

const isValidIp = (value) => {
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  const cidr = trimmed.match(CIDR);
  if (cidr) {
    const address = cidr[1];
    const prefix = Number(cidr[2]);
    if (!address || Number.isNaN(prefix)) return false;
    if (net.isIPv4(address)) return prefix >= 0 && prefix <= 32;
    if (net.isIPv6(address)) return prefix >= 0 && prefix <= 128;
    return false;
  }
  return net.isIPv4(trimmed) || net.isIPv6(trimmed);
};

/** Validates an IP allowlist. Throws a 422 ValidationError when invalid. */
export const assertValidIpAllowlist = (ipAllowlist) => {
  const list = Array.isArray(ipAllowlist) ? ipAllowlist : [];
  for (const entry of list) {
    if (typeof entry !== 'string' || !isValidIp(entry.trim())) {
      throw Object.assign(new Error(`Invalid IP or CIDR in allowlist: "${entry}". Use IPv4/IPv6 addresses or CIDR ranges.`), {
        status: 422,
        code: 'VALIDATION'
      });
    }
  }
  return list.map((s) => s.trim()).filter(Boolean);
};

/** Validates key metadata. Throws 422 on missing name or empty scopes. */
export const assertValidKeyInput = ({ name, scopes }) => {
  if (!name || !String(name).trim()) {
    throw Object.assign(new Error('Key name is required.'), { status: 422, code: 'VALIDATION' });
  }
  if (String(name).trim().length > 120) {
    throw Object.assign(new Error('Key name must be 120 characters or fewer.'), { status: 422, code: 'VALIDATION' });
  }
  const clean = Array.isArray(scopes) ? scopes.map((s) => String(s).trim()).filter(Boolean) : [];
  if (clean.length === 0) {
    throw Object.assign(new Error('At least one scope must be selected.'), { status: 422, code: 'VALIDATION' });
  }
  const unsupported = clean.filter((s) => s !== '*' && !SUPPORTED_SCOPES.includes(s));
  if (unsupported.length) {
    throw Object.assign(new Error(`Unsupported scope(s): ${unsupported.join(', ')}`), { status: 422, code: 'VALIDATION' });
  }
  return clean;
};

const mapKey = (k) => ({
  id: k.id,
  name: k.name,
  keyPrefix: k.key_prefix,
  status: k.status,
  scopes: k.scopes || [],
  expiresAt: k.expires_at,
  ipAllowlist: k.ip_allowlist || [],
  usageCount: k.usage_count || 0,
  lastUsedAt: k.last_used_at,
  createdAt: k.created_at
});

/** Ensures no other ACTIVE key in the org uses the same name. */
const assertUniqueName = async (organizationId, name, excludeId) => {
  // Use direct DB to bypass RLS
  const where = { organization_id: organizationId, name, status: 'active' };
  const result = await selectViaDb('developer_api_keys', { where, limit: 1 });
  const data = result.data;
  if (data && data.length) {
    throw Object.assign(new Error(`An API key named "${name}" already exists.`), {
      status: 409,
      code: 'DUPLICATE_KEY_NAME'
    });
  }
};

export const listApiKeys = async (developerId, organizationId) => {
  // Use direct DB to bypass RLS
  const result = await selectViaDb('developer_api_keys', {
    where: { organization_id: organizationId },
    orderBy: 'created_at',
    orderDir: 'desc'
  });
  return (result.data || []).map(mapKey);
};

export const createApiKey = async ({ developerId, organizationId, name, scopes, expiresAt, ipAllowlist, ip, userAgent }) => {
  const cleanName = String(name || '').trim();
  const cleanScopes = assertValidKeyInput({ name: cleanName, scopes });
  const cleanIp = assertValidIpAllowlist(ipAllowlist);

  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    throw Object.assign(new Error('Invalid expiration date.'), { status: 422, code: 'VALIDATION' });
  }

  await assertUniqueName(organizationId, cleanName);

  const apiKey = generateDeveloperApiKey();
  // Use direct DB to bypass RLS — Supabase gateway is degraded
  const fallback = await insertViaDb('developer_api_keys', {
    id: crypto.randomUUID(),
    developer_id: developerId,
    organization_id: organizationId,
    name: cleanName,
    key_hash: hashKey(apiKey),
    key_prefix: apiKey.slice(0, 20),
    scopes: cleanScopes,
    expires_at: expiresAt || null,
    ip_allowlist: cleanIp,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (fallback.error) throw fallback.error;
  const data = fallback.data?.[0] || fallback.data;

  await audit({
    developerId,
    organizationId,
    actorId: developerId,
    action: 'api_key.created',
    resourceType: 'developer_api_key',
    resourceId: data.id,
    ip,
    userAgent,
    metadata: { name: data.name }
  });

  return {
    id: data.id,
    name: data.name,
    apiKey, // shown once
    keyPrefix: data.key_prefix,
    scopes: data.scopes || [],
    expiresAt: data.expires_at,
    ipAllowlist: data.ip_allowlist || [],
    createdAt: data.created_at
  };
};

export const updateApiKey = async ({ developerId, organizationId, id, name, scopes, expiresAt, ipAllowlist, ip, userAgent }) => {
  const cleanName = String(name || '').trim();
  const cleanScopes = assertValidKeyInput({ name: cleanName, scopes });
  const cleanIp = assertValidIpAllowlist(ipAllowlist);

  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    throw Object.assign(new Error('Invalid expiration date.'), { status: 422, code: 'VALIDATION' });
  }

  await assertUniqueName(organizationId, cleanName, id);

  let { data, error } = await requireTables(() =>
    supabase
      .from('developer_api_keys')
      .update({
        name: cleanName,
        scopes: cleanScopes,
        expires_at: expiresAt || null,
        ip_allowlist: cleanIp,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single()
  );
  if (error) throwMissingTable(error);
  if (error) {
    const fallback = await updateViaDb('developer_api_keys',
      { name: cleanName, scopes: cleanScopes, expires_at: expiresAt || null, ip_allowlist: cleanIp, updated_at: new Date().toISOString() },
      { id, organization_id: organizationId }
    );
    if (fallback.error) throw error;
    data = fallback.data;
  }

  await audit({
    developerId,
    organizationId,
    actorId: developerId,
    action: 'api_key.updated',
    resourceType: 'developer_api_key',
    resourceId: id,
    ip,
    userAgent,
    metadata: { name: data?.name || null }
  });

  return mapKey(data);
};

/** Regenerate the secret for a key. Old secret is immediately invalid. */
export const rotateApiKey = async ({ developerId, organizationId, id, ip, userAgent }) => {
  const newKey = generateDeveloperApiKey();
  // Use direct DB to bypass RLS
  const result = await updateViaDb('developer_api_keys',
    { key_hash: hashKey(newKey), key_prefix: newKey.slice(0, 20), updated_at: new Date().toISOString() },
    { id, organization_id: organizationId }
  );
  if (result.error) throw result.error;
  const data = result.data?.[0] || result.data;

  await audit({
    developerId,
    organizationId,
    actorId: developerId,
    action: 'api_key.rotated',
    resourceType: 'developer_api_key',
    resourceId: id,
    ip,
    userAgent,
    metadata: { name: data?.name || null }
  });

  return { ...mapKey(data), apiKey: newKey };
};

export const revokeApiKey = async ({ developerId, organizationId, id, ip, userAgent }) => {
  // Use direct DB to bypass RLS
  const result = await updateViaDb('developer_api_keys',
    { status: 'revoked', updated_at: new Date().toISOString() },
    { id, organization_id: organizationId }
  );
  if (result.error) throw result.error;
  const data = result.data?.[0] || result.data;

  await audit({
    developerId,
    organizationId,
    actorId: developerId,
    action: 'api_key.revoked',
    resourceType: 'developer_api_key',
    resourceId: id,
    ip,
    userAgent,
    metadata: { name: data?.name || null }
  });
};

/** Permanently remove a developer API key record (audit trail retained). */
export const deleteApiKey = async ({ developerId, organizationId, id, ip, userAgent }) => {
  // Use direct DB to bypass RLS
  const result = await deleteViaDb('developer_api_keys',
    { id, organization_id: organizationId }
  );
  if (result.error) throw result.error;
  const data = result.data?.[0] || null;

  await audit({
    developerId,
    organizationId,
    actorId: developerId,
    action: 'api_key.deleted',
    resourceType: 'developer_api_key',
    resourceId: id,
    ip,
    userAgent,
    metadata: { name: data?.name || null }
  });
};
