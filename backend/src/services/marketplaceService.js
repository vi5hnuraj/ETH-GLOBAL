/**
 * MarketplaceService — AI Service Marketplace & Autonomous Billing.
 *
 * Commerce layer on top of the existing AI agent platform. Agents already own
 * MPC wallets + gpay_sk_ keys; this service adds:
 *   - publishing services (per agent) into a discoverable catalog
 *   - metering usage (providers or consumers report quantities)
 *   - an automatic invoice engine (usage -> invoice)
 *   - settlement: the consumer agent pays the provider's wallet from its own
 *     MPC wallet (existing WalletService), on Arc Chain.
 *
 * All reads/writes go through Supabase (same as agentService); the marketplace
 * reuses the existing org/scopes/auth + audit + webhook dispatch machinery.
 */

import crypto from 'crypto';
import { ethers } from 'ethers';
import { supabase } from '../config/supabaseClient.js';
import { listViaDb, getPool } from '../utils/db.js';
import { getWalletService } from '../wallets/walletService.js';
import { dispatchEvent } from './webhookService.js';
import { audit } from './auditService.js';
import { enrichServices } from './commerceService.js';
import logger from '../utils/logger.js';
const EXPLORER_URL = process.env.ARC_EXPLORER_URL || process.env.EXPLORER_URL || 'https://testnet.arcscan.app/';

export const generateServiceId = () => `srv_${crypto.randomBytes(8).toString('hex')}`;
export const generateUsageId = () => `use_${crypto.randomBytes(8).toString('hex')}`;
export const generateInvoiceId = () => `inv_${crypto.randomBytes(8).toString('hex')}`;

export const CATEGORIES = ['gpu', 'storage', 'ai-model', 'translation', 'ocr', 'voice', 'video', 'compute', 'api', 'other'];
export const PRICING_MODELS = ['per_unit', 'per_hour', 'per_request', 'per_char', 'per_mb_day', 'flat', 'subscription'];

const httpError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

// Simple in-memory cache for marketplace data
const marketplaceCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getCached = (key) => {
  const entry = marketplaceCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  marketplaceCache.delete(key);
  return null;
};

const setCache = (key, data) => {
  marketplaceCache.set(key, { data, ts: Date.now() });
  // Evict old entries
  if (marketplaceCache.size > 100) {
    const oldest = marketplaceCache.keys().next().value;
    marketplaceCache.delete(oldest);
  }
};

// Retry wrapper for Supabase queries
const withRetry = async (fn, retries = 2, delay = 500) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
};

// ==================== Weights & formatting ====================

/** Compute charge for a quantity against a USDC unit price (both decimal strings). */
export const computeChargeWei = async (unitPriceBot, quantity) => {
  const unitWei = ethers.parseEther(String(unitPriceBot || '0'));
  const q = String(quantity || '0');
  if (!/^\d+(\.\d+)?$/.test(q)) throw httpError(400, 'Quantity must be a positive decimal number.');
  const qScaled = ethers.parseUnits(q, 6); // 6 decimals is plenty for units like hours/GB/requests
  return (unitWei * qScaled) / 1_000_000n;
};

const validateQuantity = (quantity) => {
  if (typeof quantity !== 'string' || !/^\d+(\.\d+)?$/.test(quantity)) {
    throw httpError(400, 'Quantity must be a positive decimal string (e.g. "3.5").');
  }
  if (Number(quantity) <= 0) throw httpError(400, 'Quantity must be greater than zero.');
};

const validatePrice = (unitPrice) => {
  if (typeof unitPrice !== 'string' || !/^\d+(\.\d+)?$/.test(unitPrice) || Number(unitPrice) < 0) {
    throw httpError(400, 'Unit price must be a non-negative USDC decimal string (e.g. "0.05").');
  }
};

// ==================== Services ====================

const toPublicService = (s) => ({
  serviceId: s.service_id,
  agentId: s.agent_code,
  developerId: s.developer_id,
  title: s.title,
  description: s.description,
  category: s.category,
  pricingModel: s.pricing_model,
  unitPrice: s.unit_price,
  unitPriceBOT: Number(s.unit_price || 0),
  unitLabel: s.unit_label,
  endpointUrl: s.endpoint_url || null,
  healthCheckUrl: s.health_check_url || null,
  supportedCurrencies: s.supported_currencies || ['USDC'],
  isActive: s.is_active,
  metadata: s.metadata || {},
  createdAt: s.created_at,
  updatedAt: s.updated_at
});

export const getServiceByCode = async (serviceId, { includeInactive = false } = {}) => {
  let q = supabase.from('ai_services').select('*').eq('service_id', serviceId);
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.maybeSingle();
  // If Supabase gateway degraded (no error but null data), retry via direct DB
  if (!data && !error) {
    try {
      const cond = includeInactive
        ? 'WHERE service_id = $1'
        : 'WHERE service_id = $1 AND is_active = true';
      const { rows } = await getPool().query(`SELECT * FROM ai_services ${cond} LIMIT 1`, [serviceId]);
      if (rows[0]) return rows[0];
    } catch { /* fall through */ }
  }
  if (error) throw new Error(`Service lookup failed: ${error.message}`);
  return data || null;
};

export const getServiceById = async (id) => {
  const { data, error } = await supabase.from('ai_services').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Service lookup failed: ${error.message}`);
  return data || null;
};

export const createService = async ({ agent, title, description, category, pricingModel, unitPrice, unitLabel, metadata, endpointUrl, healthCheckUrl }) => {
  validatePrice(unitPrice);
  if (!title || !String(title).trim()) throw httpError(400, 'Service title is required.');
  if (!CATEGORIES.includes(category)) throw httpError(400, `Invalid category. Allowed: ${CATEGORIES.join(', ')}.`);
  if (!PRICING_MODELS.includes(pricingModel)) throw httpError(400, `Invalid pricing model. Allowed: ${PRICING_MODELS.join(', ')}.`);
  if (!endpointUrl || !String(endpointUrl).trim()) throw httpError(400, 'API endpoint URL is required. Buyers need this to access your service.');

  const serviceId = generateServiceId();
  const { data, error } = await supabase
    .from('ai_services')
    .insert({
      service_id: serviceId,
      agent_id: agent.id,
      agent_code: agent.agent_id,
      developer_id: agent.developer_id || null,
      organization_id: agent.organization_id || null,
      title: String(title).trim(),
      description: description || null,
      category,
      pricing_model: pricingModel,
      unit_price: unitPrice,
      unit_label: unitLabel || null,
      endpoint_url: endpointUrl || null,
      health_check_url: healthCheckUrl || null,
      is_active: true,
      metadata: metadata || {}
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to publish service: ${error.message}`);

  // Invalidate marketplace cache
  marketplaceCache.clear();

  audit({
    developerId: agent.developer_id,
    organizationId: agent.organization_id,
    actorType: 'agent',
    actorId: agent.agent_id,
    action: 'service.created',
    resourceType: 'ai_service',
    resourceId: serviceId,
    metadata: { title, category, pricingModel, unitPrice }
  });

  dispatchEvent('service.created', {
    serviceId,
    agentId: agent.agent_id,
    title: String(title).trim(),
    category,
    pricingModel,
    unitPrice
  }, { developerId: agent.developer_id, organizationId: agent.organization_id });

  return toPublicService(data);
};

export const updateService = async ({ agent, serviceId, patch }) => {
  const existing = await getServiceByCode(serviceId, { includeInactive: true });
  if (!existing) throw httpError(404, 'Service not found.');
  if (existing.agent_id !== agent.id) throw httpError(403, 'Only the owning agent can modify this service.');

  const update = {};
  if (patch.title !== undefined) update.title = String(patch.title).trim();
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.category !== undefined) {
    if (!CATEGORIES.includes(patch.category)) throw httpError(400, `Invalid category. Allowed: ${CATEGORIES.join(', ')}.`);
    update.category = patch.category;
  }
  if (patch.pricingModel !== undefined) {
    if (!PRICING_MODELS.includes(patch.pricingModel)) throw httpError(400, `Invalid pricing model. Allowed: ${PRICING_MODELS.join(', ')}.`);
    update.pricing_model = patch.pricingModel;
  }
  if (patch.unitPrice !== undefined) {
    validatePrice(patch.unitPrice);
    update.unit_price = patch.unitPrice;
  }
  if (patch.unitLabel !== undefined) update.unit_label = patch.unitLabel;
  if (patch.endpointUrl !== undefined) update.endpoint_url = patch.endpointUrl || null;
  if (patch.healthCheckUrl !== undefined) update.health_check_url = patch.healthCheckUrl || null;
  if (patch.isActive !== undefined) update.is_active = !!patch.isActive;
  if (patch.metadata !== undefined) update.metadata = patch.metadata;
  if (Object.keys(update).length === 0) throw httpError(400, 'Nothing to update.');
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('ai_services')
    .update(update)
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update service: ${error.message}`);

  // Invalidate marketplace cache
  marketplaceCache.clear();

  audit({
    developerId: agent.developer_id,
    organizationId: agent.organization_id,
    actorType: 'agent',
    actorId: agent.agent_id,
    action: 'service.updated',
    resourceType: 'ai_service',
    resourceId: existing.service_id,
    metadata: { patch: Object.keys(update) }
  });

  dispatchEvent('service.updated', {
    serviceId: existing.service_id,
    agentId: agent.agent_id,
    title: data.title,
    isActive: data.is_active
  }, { developerId: agent.developer_id, organizationId: agent.organization_id });

  return toPublicService(data);
};

export const deleteService = async ({ agent, serviceId }) => {
  const existing = await getServiceByCode(serviceId, { includeInactive: true });
  if (!existing) throw httpError(404, 'Service not found.');
  if (existing.agent_id !== agent.id) throw httpError(403, 'Only the owning agent can delete this service.');

  const { error } = await supabase.from('ai_services').delete().eq('id', existing.id);
  if (error) throw new Error(`Failed to delete service: ${error.message}`);

  // Invalidate marketplace cache
  marketplaceCache.clear();

  audit({
    developerId: agent.developer_id,
    organizationId: agent.organization_id,
    actorType: 'agent',
    actorId: agent.agent_id,
    action: 'service.deleted',
    resourceType: 'ai_service',
    resourceId: existing.service_id,
    metadata: { title: existing.title }
  });

  return { serviceId: existing.service_id, deleted: true };
};

export const listServicesByAgent = async (agent) => {
  const { data, error } = await supabase
    .from('ai_services')
    .select('*')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Service list failed: ${error.message}`);
  let rows = data || [];
  if (!rows.length) {
    const fb = await listViaDb('ai_services', {
      where: { agent_id: agent.id },
      orderBy: 'created_at',
      orderDir: 'desc'
    });
    if (fb && fb.count > 0) rows = fb.rows;
  }
  return rows.map(toPublicService);
};

export const listServicesByDeveloper = async (developerId, organizationId) => {
  let q = supabase.from('ai_services').select('*').order('created_at', { ascending: false });
  if (organizationId) q = q.eq('organization_id', organizationId);
  else if (developerId) q = q.eq('developer_id', developerId);
  const { data, error } = await q;
  if (error) throw new Error(`Service list failed: ${error.message}`);
  let rows = data || [];
  if (!rows.length) {
    const fb = await listViaDb('ai_services', {
      where: organizationId ? { organization_id: organizationId } : { developer_id: developerId },
      orderBy: 'created_at',
      orderDir: 'desc'
    });
    if (fb && fb.count > 0) rows = fb.rows;
  }

  const enriched = await enrichServices(rows);

  const [usageCounts, revenueWei] = await Promise.all([
    fetchServiceUsageCounts(developerId, organizationId),
    fetchServiceRevenueWei(developerId, organizationId)
  ]);

  return enriched.map((s) => {
    const count = usageCounts[s.service_id] || 0;
    return {
      ...toPublicService(s),
      capabilities: s.capabilities,
      reputation: s.reputation,
      requestCount: count,
      revenueBOT: Number(revenueWei[s.service_id] || 0),
      lifecycleStatus: !s.is_active ? (count > 0 ? 'paused' : 'draft') : 'live'
    };
  });
};

const fetchServiceUsageCounts = async (developerId, organizationId) => {
  try {
    let q = supabase.from('usage_reports').select('service_code');
    if (organizationId) q = q.eq('organization_id', organizationId);
    else q = q.eq('developer_id', developerId);
    const { data } = await q;
    const map = {};
    (data || []).forEach((r) => { map[r.service_code] = (map[r.service_code] || 0) + 1; });
    return map;
  } catch {
    return {};
  }
};

const fetchServiceRevenueWei = async (developerId, organizationId) => {
  try {
    let q = supabase.from('service_invoices').select('service_code, amount_wei').eq('status', 'paid');
    if (organizationId) q = q.eq('organization_id', organizationId);
    else q = q.eq('developer_id', developerId);
    const { data } = await q;
    const map = {};
    (data || []).forEach((r) => {
      map[r.service_code] = (map[r.service_code] || 0n) + BigInt(r.amount_wei || '0');
    });
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Number(v) / 1e18]));
  } catch {
    return {};
  }
};

// ==================== Marketplace browse ====================

export const listMarketplace = async ({ search, category, sort, order, page = 1, perPage = 20, excludeAgentId } = {}) => {
  // Check cache first (only for simple queries)
  const cacheKey = `marketplace:${category || 'all'}:${sort || 'default'}:${order || 'desc'}:${page}:${perPage}:${search || ''}`;
  if (!excludeAgentId) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  let rows = [];
  let total = 0;

  // Try Supabase with retry
  try {
    const result = await withRetry(async () => {
      let q = supabase
        .from('ai_services')
        .select('*, ai_agents(agent_id, agent_name, wallet_address)', { count: 'exact' })
        .eq('is_active', true)
        .order(sort === 'price' ? 'unit_price' : 'created_at', { ascending: (order || 'desc') === 'asc' });

      if (category && category !== 'all') q = q.eq('category', category);
      if (excludeAgentId) q = q.neq('agent_id', excludeAgentId);
      if (search) q = q.ilike('title', `%${search}%`);

      const per = Math.min(Number(perPage) || 20, 100);
      const from = (Math.max(1, Number(page) || 1) - 1) * per;
      q = q.range(from, from + per - 1);

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      return { data: data || [], count: count || 0 };
    });
    rows = result.data;
    total = result.count;
  } catch (err) {
    logger.warn('[MARKETPLACE] Supabase failed, using direct DB:', err.message);
  }

  // Fallback to direct DB if Supabase returned empty
  if (!rows.length) {
    try {
      const per = Math.min(Number(perPage) || 20, 100);
      const from = (Math.max(1, Number(page) || 1) - 1) * per;
      const fb = await listViaDb('ai_services', {
        where: { is_active: true, ...(category && category !== 'all' ? { category } : {}) },
        orderBy: sort === 'price' ? 'unit_price' : 'created_at',
        orderDir: (order || 'desc') === 'asc' ? 'asc' : 'desc',
        limit: per,
        offset: from
      });
      if (fb && fb.count > 0) {
        let fbRows = fb.rows.filter((s) =>
          (!search || !s.title || String(s.title).toLowerCase().includes(String(search).toLowerCase())) &&
          (!excludeAgentId || s.agent_id !== excludeAgentId)
        );
        if (!fbRows.length) fbRows = fb.rows;
        rows = fbRows;
        total = fb.count;
      }
    } catch (fbErr) {
      logger.warn('[MARKETPLACE] Direct DB fallback also failed:', fbErr.message);
    }
  }

  // When the Supabase gateway degraded to anon the direct-DB fallback returned
  // raw rows without the ai_agents join. Enrich them so provider.wallet is
  // always available for the Trust Engine / autonomous commerce decision.
  if (rows.length && !rows[0].ai_agents) {
    const agentIds = [...new Set(rows.map((s) => s.agent_code).filter(Boolean))];
    if (agentIds.length) {
      try {
        const { rows: agents } = await getPool().query(
          'SELECT agent_id, agent_name, wallet_address, organization_id FROM ai_agents WHERE agent_id = ANY($1)',
          [agentIds]
        );
        const agentMap = Object.fromEntries(agents.map((a) => [a.agent_id, a]));
        rows = rows.map((s) => ({ ...s, ai_agents: agentMap[s.agent_code] || null }));
      } catch (err) {
        logger.warn('[MARKETPLACE] Agent enrichment fallback failed:', err.message);
      }
    }
  }

  // Resolve org names for provider display
  const orgIds = [...new Set(rows.filter((s) => s.ai_agents?.organization_id).map((s) => s.ai_agents.organization_id))];
  let orgMap = {};
  if (orgIds.length) {
    try {
      const { data: orgs } = await supabase.from('organizations').select('id, name').in('id', orgIds);
      if (orgs) orgMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
    } catch { /* org lookup failed, fall back to agent name */ }
  }

  const per = Math.min(Number(perPage) || 20, 100);
  const mapped = rows.map((s) => ({
    ...toPublicService(s),
    provider: s.ai_agents ? {
      agentId: s.ai_agents.agent_id,
      name: orgMap[s.ai_agents.organization_id] || s.ai_agents.agent_name,
      wallet: s.ai_agents.wallet_address
    } : null
  }));

  const result = {
    services: mapped,
    meta: {
      page: Number(page),
      perPage: per,
      total,
      totalPages: Math.ceil(total / per),
      hasMore: total > Number(page) * per
    }
  };

  // Cache the result (only for non-search queries)
  if (!excludeAgentId && !search) {
    setCache(cacheKey, result);
  }

  return result;
};

export const getMarketplaceService = async (serviceId) => {
  const { data, error } = await supabase
    .from('ai_services')
    .select('*, ai_agents(agent_id, agent_name, wallet_address)')
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Service lookup failed: ${error.message}`);
  if (!data) {
    const fb = await listViaDb('ai_services', { where: { service_id: serviceId, is_active: true } });
    if (fb && fb.rows[0]) {
      return {
        ...toPublicService(fb.rows[0]),
        provider: null
      };
    }
    throw httpError(404, 'Service not found or inactive.');
  }
  // Resolve org name
  let orgName = null;
  if (data.ai_agents?.organization_id) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', data.ai_agents.organization_id).maybeSingle();
    orgName = org?.name || null;
  }

  return {
    ...toPublicService(data),
    provider: data.ai_agents ? {
      agentId: data.ai_agents.agent_id,
      name: orgName || data.ai_agents.agent_name,
      wallet: data.ai_agents.wallet_address
    } : null
  };
};

// ==================== Usage metering ====================

export const reportUsage = async ({ agent, serviceId, quantity, consumerAgentId, metadata, sessionId }) => {
  validateQuantity(quantity);

  // Resolve the service. If the caller is the provider they must own it; if the
  // caller is a consumer they must not be the provider (self-billing is invalid).
  const service = await getServiceByCode(serviceId);
  if (!service) throw httpError(404, 'Service not found or inactive.');
  const providerAgentId = service.agent_id;

  let consumer;
  if (consumerAgentId) {
    const { data } = await supabase.from('ai_agents').select('*').eq('agent_id', consumerAgentId).maybeSingle();
    if (!data) throw httpError(404, 'Consumer agent not found.');
    if (data.id === providerAgentId) throw httpError(400, 'An agent cannot be its own consumer.');
    consumer = data;
  } else {
    // No explicit consumer: the caller is the consumer, provider is the service owner.
    if (agent.id === providerAgentId) {
      throw httpError(400, 'Provide a consumerAgentId — an agent cannot bill itself for its own service.');
    }
    consumer = agent;
  }

  const amountWei = await computeChargeWei(service.unit_price, quantity);

  // Prepaid-only enforcement: usage may only be recorded against a purchase
  // session whose payment was already confirmed (paid/active/completed). No
  // invoice is ever created from usage — pricing is settled at purchase time.
  if (sessionId) {
    const commerce = await import('./commerceService.js');
    const session = await commerce.getSessionByCode(sessionId);
    if (!session) throw httpError(404, 'Purchase session not found.');
    if (session.consumer_agent_id !== consumer.id) throw httpError(403, 'This usage session does not belong to the consumer agent.');
    if (!['paid', 'active', 'completed'].includes(session.status)) {
      throw httpError(402, `Session ${sessionId} is unpaid (${session.status}). Payments are required before usage can be recorded.`, 'PAYMENT_REQUIRED');
    }
  }

  const usageId = generateUsageId();
  const { data, error } = await supabase
    .from('usage_reports')
    .insert({
      usage_id: usageId,
      service_id: service.id,
      service_code: service.service_id,
      consumer_agent_id: consumer.id,
      provider_agent_id: providerAgentId,
      consumer_agent_code: consumer.agent_id,
      provider_agent_code: service.agent_code,
      quantity: String(quantity),
      unit: service.unit_label || null,
      amount_wei: amountWei.toString(),
      status: 'reported',
      metadata: { prepaid: true, ...(sessionId ? { session_id: sessionId } : {}), ...(metadata || {}) },
      organization_id: service.organization_id || consumer.organization_id || null
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to record usage: ${error.message}`);

  audit({
    developerId: consumer.developer_id,
    organizationId: service.organization_id || consumer.organization_id,
    actorType: 'agent',
    actorId: agent.agent_id,
    action: 'usage.reported',
    resourceType: 'usage_report',
    resourceId: usageId,
    metadata: { serviceId: service.service_id, quantity, amountWei: amountWei.toString(), prepaid: true, sessionId: sessionId || null }
  });

  dispatchEvent('usage.reported', {
    usageId,
    serviceId: service.service_id,
    consumerAgentId: consumer.agent_id,
    providerAgentId: service.agent_code,
    quantity: String(quantity),
    amountBOT: formatEtherSafe(amountWei),
    prepaid: true
  }, { developerId: service.developer_id, organizationId: service.organization_id });

  // Autonomous commerce: close the paid purchase session once its credits are
  // consumed, and keep provider reputation fresh.
  if (sessionId) {
    const commerce = await import('./commerceService.js');
    try {
      await commerce.completeSessionFromUsage({ sessionId, usage: data });
    } catch (err) {
      logger.warn('[MARKETPLACE] session completion hook failed:', err.message);
    }
  }
  const { data: providerAgent } = await supabase.from('ai_agents').select('*').eq('id', providerAgentId).maybeSingle();
  if (providerAgent) {
    const commerce = await import('./commerceService.js');
    try { await commerce.ensureFreshReputation(providerAgent, { force: true }); } catch (err) { logger.warn('[MARKETPLACE] reputation refresh failed:', err.message); }
  }

  return {
    usageId,
    serviceId: service.service_id,
    quantity: String(quantity),
    amountBOT: formatEtherSafe(amountWei),
    amountWei: amountWei.toString(),
    status: 'reported',
    prepaid: true
  };
};

export const listUsage = async ({ agent, role = 'all', page = 1, perPage = 20 }) => {
  let q = supabase
    .from('usage_reports')
    .select('*, ai_services(service_id, title, category)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (role === 'consumer') q = q.eq('consumer_agent_id', agent.id);
  else if (role === 'provider') q = q.eq('provider_agent_id', agent.id);
  else q = q.or(`consumer_agent_id.eq.${agent.id},provider_agent_id.eq.${agent.id}`);

  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  q = q.range(from, from + per - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`Usage list failed: ${error.message}`);

  const rows = (data || []).map((u) => ({
    usageId: u.usage_id,
    serviceId: u.service_code,
    serviceTitle: u.ai_services?.title || null,
    serviceCategory: u.ai_services?.category || null,
    consumerAgentId: u.consumer_agent_code,
    providerAgentId: u.provider_agent_code,
    quantity: u.quantity,
    unit: u.unit,
    amountBOT: formatEtherSafe(u.amount_wei),
    status: u.status,
    createdAt: u.created_at
  }));

  return {
    usage: rows,
    meta: {
      page: Number(page),
      perPage: per,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / per),
      hasMore: (count || 0) > Number(page) * per
    }
  };
};

// ==================== Invoice engine ====================

const formatEtherSafe = (wei) => {
  try {
    return ethers.formatEther(String(wei));
  } catch {
    return String(Number(wei) / 1e18);
  }
};

// The postpaid "usage -> auto-issued payable invoice" engine
// (createInvoiceFromUsage) was removed in the prepaid-only migration. Usage is
// now a reconciliation record; invoices are created strictly after confirmed
// payment (see commerceService.confirmPrepaidPurchase).
const toPublicInvoice = (inv) => ({
  invoiceId: inv.invoice_id,
  serviceId: inv.service_code,
  consumerAgentId: inv.consumer_agent_code,
  providerAgentId: inv.provider_agent_code,
  quantity: inv.quantity,
  unit: inv.unit,
  amountBOT: formatEtherSafe(inv.amount_wei),
  currency: inv.currency,
  status: inv.status,
  txHash: inv.tx_hash,
  explorerUrl: inv.tx_hash ? `${EXPLORER_URL}/tx/${inv.tx_hash}` : null,
  paidAt: inv.paid_at,
  dueAt: inv.due_at,
  createdAt: inv.created_at
});

export const getInvoiceByCode = async (invoiceId) => {
  const { data, error } = await supabase.from('service_invoices').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw new Error(`Invoice lookup failed: ${error.message}`);
  return data || null;
};

const expireInvoice = async (invoice) => {
  if (invoice.status !== 'pending') return invoice;
  if (invoice.due_at && new Date(invoice.due_at) <= new Date()) {
    await supabase.from('service_invoices').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', invoice.id);
    return { ...invoice, status: 'expired' };
  }
  return invoice;
};

export const listInvoices = async ({ agent, role = 'all', status, page = 1, perPage = 20 }) => {
  await expireStaleInvoices();

  let q = supabase.from('service_invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (role === 'consumer') q = q.eq('consumer_agent_id', agent.id);
  else if (role === 'provider') q = q.eq('provider_agent_id', agent.id);
  else q = q.or(`consumer_agent_id.eq.${agent.id},provider_agent_id.eq.${agent.id}`);
  if (status && status !== 'all') q = q.eq('status', status);

  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  q = q.range(from, from + per - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`Invoice list failed: ${error.message}`);

  const rows = (data || []).map(toPublicInvoice);
  return {
    invoices: rows,
    meta: {
      page: Number(page),
      perPage: per,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / per),
      hasMore: (count || 0) > Number(page) * per
    }
  };
};

export const listInvoicesByDeveloper = async ({ developerId, organizationId, role, status, page = 1, perPage = 20, callerDefaulted, orgExplicit }) => {
  await expireStaleInvoices();

  // Fail closed when the caller supplied no identity: an anonymous request must
  // never silently bind to the default developer's personal organization and
  // pick up its invoices. Only an explicitly-named organization unlocks reads.
  if (callerDefaulted && !orgExplicit) {
    return emptyInvoiceMeta(page, perPage);
  }

  // Developer-scoped: join through agents owned by this developer/org.
  const agentsQ = supabase.from('ai_agents').select('id');
  if (organizationId) agentsQ.eq('organization_id', organizationId);
  else if (developerId) agentsQ.eq('developer_id', developerId);
  const { data: agentRows } = await agentsQ;
  const agentIds = (agentRows || []).map((a) => a.id);
  if (agentIds.length === 0) {
    return emptyInvoiceMeta(page, perPage);
  }

  let q = supabase.from('service_invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  // Tenant rule: an invoice lives with the account that purchased it (the
  // consumer side). The default/`all` view shows exactly that. The provider only
  // ever sees the invoice by explicitly selecting the `provider` role, so one
  // account's purchases can never leak into another account's default list.
  if (role === 'provider') q = q.in('provider_agent_id', agentIds);
  else q = q.in('consumer_agent_id', agentIds);
  if (status && status !== 'all') q = q.eq('status', status);

  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  q = q.range(from, from + per - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(`Invoice list failed: ${error.message}`);

  return {
    invoices: (data || []).map(toPublicInvoice),
    meta: {
      page: Number(page),
      perPage: per,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / per),
      hasMore: (count || 0) > Number(page) * per
    }
  };
};

const emptyInvoiceMeta = (page, perPage) => ({
  invoices: [],
  meta: {
    page: Number(page) || 1,
    perPage: Math.min(Number(perPage) || 20, 100),
    total: 0,
    totalPages: 0,
    hasMore: false
  }
});

export const expireStaleInvoices = async () => {
  try {
    const cutoff = new Date(Date.now()).toISOString();
    await supabase
      .from('service_invoices')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lte('due_at', cutoff);
  } catch (err) {
    logger.warn('[MARKETPLACE] stale invoice expiry failed:', err.message);
  }
};

// ==================== Settlement ====================

export const payInvoice = async ({ agent, invoiceId }) => {
  const invoice = await getInvoiceByCode(invoiceId);
  if (!invoice) throw httpError(404, 'Invoice not found.');
  const live = await expireInvoice(invoice);

  if (live.status === 'paid') {
    return { ...toPublicInvoice(live), alreadyPaid: true };
  }
  if (live.status === 'expired') throw httpError(410, 'Invoice has expired. Ask the provider to re-issue the service usage.', 'INVOICE_EXPIRED');
  if (live.status === 'cancelled') throw httpError(400, 'Invoice was cancelled.', 'INVOICE_CANCELLED');
  if (live.status !== 'pending') throw httpError(409, `Invoice cannot be paid (status ${live.status}).`);

  if (agent.id !== live.consumer_agent_id) {
    throw httpError(403, 'Only the consumer agent can pay this invoice.', 'NOT_CONSUMER');
  }

  const { data: provider, error: providerErr } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', live.provider_agent_id)
    .single();
  if (providerErr || !provider) throw httpError(404, 'Provider agent not found.');

  return settleInvoice({ consumerAgent: agent, provider, invoice: live });
};

export const devPayInvoice = async ({ developerId, organizationId, consumerAgentId, invoiceId }) => {
  const invoice = await getInvoiceByCode(invoiceId);
  if (!invoice) throw httpError(404, 'Invoice not found.');
  const live = await expireInvoice(invoice);

  if (live.status === 'paid') return { ...toPublicInvoice(live), alreadyPaid: true };
  if (live.status === 'expired') throw httpError(410, 'Invoice has expired.', 'INVOICE_EXPIRED');
  if (live.status === 'cancelled') throw httpError(400, 'Invoice was cancelled.', 'INVOICE_CANCELLED');
  if (live.status !== 'pending') throw httpError(409, `Invoice cannot be paid (status ${live.status}).`);

  // The developer must own the consumer agent.
  const consumerQ = supabase.from('ai_agents').select('*').eq('id', live.consumer_agent_id);
  if (organizationId) consumerQ.eq('organization_id', organizationId);
  else consumerQ.eq('developer_id', developerId);
  const { data: consumer, error: consumerErr } = await consumerQ.single();
  if (consumerErr || !consumer) throw httpError(403, 'You do not own the consumer agent for this invoice.');

  const { data: provider, error: providerErr } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', live.provider_agent_id)
    .single();
  if (providerErr || !provider) throw httpError(404, 'Provider agent not found.');

  return settleInvoice({ consumerAgent: consumer, provider, invoice: live });
};

const settleInvoice = async ({ consumerAgent, provider, invoice }) => {
  const walletService = getWalletService();
  const amountWei = invoice.amount_wei;

  // Balance gate: the consumer wallet must cover the invoice (gas is relayer/MPC-side).
  try {
    const bal = await walletService.getBalance(consumerAgent.wallet_address);
    if (BigInt(bal.wei) < BigInt(amountWei)) {
      throw httpError(400, `Insufficient wallet balance. Invoice requires ${formatEtherSafe(amountWei)} USDC but ${consumerAgent.agent_name || consumerAgent.agent_id} holds ${Number(bal.formatted).toFixed(6)} USDC.`, 'INSUFFICIENT_BALANCE');
    }
  } catch (err) {
    if (err.status === 400) throw err;
    // Balance read failure is fail-open only if we can still broadcast; otherwise
    // surface it so the caller can retry.
    throw httpError(502, `Could not verify consumer balance: ${err.message}`);
  }

  const idempotencyKey = `invoice:${invoice.invoice_id}`;
  let result;
  try {
    result = await walletService.sendPayment({
      walletId: consumerAgent.wallet_id,
      to: provider.wallet_address,
      wei: amountWei,
      idempotencyKey
    });
  } catch (err) {
    dispatchEvent('invoice.failed', {
      invoiceId: invoice.invoice_id,
      serviceId: invoice.service_code,
      consumerAgentId: invoice.consumer_agent_code,
      providerAgentId: invoice.provider_agent_code,
      amountBOT: formatEtherSafe(amountWei),
      reason: err.message
    }, { developerId: consumerAgent.developer_id, organizationId: consumerAgent.organization_id });
    throw err;
  }

  const txHash = result.txHash;
  await supabase
    .from('service_invoices')
    .update({
      status: 'paid',
      tx_hash: txHash,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', invoice.id);

  // Mirror the payout into the consumer agent's transaction ledger so the agent
  // history shows the settlement (reconciled by the existing recovery worker).
  await supabase.from('ai_agent_transactions').insert({
    agent_id: consumerAgent.id,
    destination_address: provider.wallet_address,
    amount: amountWei,
    token: 'USDC',
    note: `invoice:${invoice.invoice_id} (${invoice.service_code})`,
    tx_hash: txHash,
    status: result.confirmed ? 'confirmed' : 'pending'
  }).then(undefined, (err) => logger.warn('[MARKETPLACE] ledger insert warning:', err.message));

  audit({
    developerId: consumerAgent.developer_id,
    organizationId: consumerAgent.organization_id,
    actorType: 'agent',
    actorId: consumerAgent.agent_id,
    action: 'invoice.paid',
    resourceType: 'service_invoice',
    resourceId: invoice.invoice_id,
    metadata: { providerAgentId: invoice.provider_agent_code, amountBOT: formatEtherSafe(amountWei), txHash }
  });

  const evt = {
    invoiceId: invoice.invoice_id,
    serviceId: invoice.service_code,
    consumerAgentId: invoice.consumer_agent_code,
    providerAgentId: invoice.provider_agent_code,
    amountBOT: formatEtherSafe(amountWei),
    txHash,
    explorerUrl: `${EXPLORER_URL}/tx/${txHash}`
  };
  dispatchEvent('invoice.paid', evt, { developerId: consumerAgent.developer_id, organizationId: consumerAgent.organization_id });
  dispatchEvent('payment.completed', {
    agentId: consumerAgent.agent_id,
    to: provider.wallet_address,
    amount: formatEtherSafe(amountWei),
    token: 'USDC',
    txHash,
    network: 'Arc Chain'
  }, { developerId: consumerAgent.developer_id, organizationId: consumerAgent.organization_id });

  // Autonomous commerce: close any linked purchase sessions + refresh reputation.
  const commerce = await import('./commerceService.js');
  try {
    await commerce.closeSessionFromPayment({ invoice, txHash, provider });
  } catch (err) {
    logger.warn('[MARKETPLACE] session close hook failed:', err.message);
  }

  return {
    invoiceId: invoice.invoice_id,
    amountBOT: formatEtherSafe(amountWei),
    to: provider.wallet_address,
    from: consumerAgent.wallet_address,
    txHash,
    explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
    status: 'paid'
  };
};

// ==================== Revenue & analytics ====================

export const getAgentRevenue = async (agent) => {
  const { data, error } = await supabase
    .from('service_invoices')
    .select('amount_wei, status, paid_at, created_at, consumer_agent_code, service_code')
    .eq('provider_agent_id', agent.id);
  if (error) throw new Error(`Revenue fetch failed: ${error.message}`);

  return buildRevenueStats(data || []);
};

export const getDeveloperMarketplaceStats = async ({ developerId, organizationId }) => {
  const agentsQ = supabase.from('ai_agents').select('id');
  if (organizationId) agentsQ.eq('organization_id', organizationId);
  else if (developerId) agentsQ.eq('developer_id', developerId);
  const { data: agentRows } = await agentsQ;
  const agentIds = (agentRows || []).map((a) => a.id);

  if (agentIds.length === 0) {
    return buildRevenueStats([]);
  }

  const { data, error } = await supabase
    .from('service_invoices')
    .select('amount_wei, status, paid_at, created_at, consumer_agent_code, provider_agent_code, service_code')
    .or(`consumer_agent_id.in.(${agentIds.join(',')}),provider_agent_id.in.(${agentIds.join(',')})`);
  if (error) throw new Error(`Marketplace stats failed: ${error.message}`);
  return buildRevenueStats(data || []);
};

const buildRevenueStats = (invoices) => {
  const paid = invoices.filter((i) => i.status === 'paid');
  const pending = invoices.filter((i) => i.status === 'pending');
  const totalPaidWei = paid.reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
  const totalPendingWei = pending.reduce((s, i) => s + BigInt(i.amount_wei || '0'), 0n);
  const attempts = paid.length + invoices.filter((i) => ['paid', 'failed', 'expired'].includes(i.status)).length;

  const revenueByMonth = {};
  const revenueByService = {};
  const revenueByCustomer = {};
  paid.forEach((i) => {
    const month = (i.paid_at || i.created_at || '').slice(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] || 0n) + BigInt(i.amount_wei || '0');
    revenueByService[i.service_code] = (revenueByService[i.service_code] || 0n) + BigInt(i.amount_wei || '0');
    revenueByCustomer[i.consumer_agent_code] = (revenueByCustomer[i.consumer_agent_code] || 0n) + BigInt(i.amount_wei || '0');
  });

  return {
    revenue: {
      totalPaidBOT: formatEtherSafe(totalPaidWei),
      totalPendingBOT: formatEtherSafe(totalPendingWei),
      monthlyRevenue: Object.entries(revenueByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, wei]) => ({ month, revenueBOT: formatEtherSafe(wei) }))
    },
    analytics: {
      invoiceCount: invoices.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      activeCustomers: new Set(paid.map((i) => i.consumer_agent_code)).size,
      activeServices: new Set(paid.map((i) => i.service_code)).size,
      averageInvoiceBOT: paid.length ? formatEtherSafe(totalPaidWei / BigInt(paid.length)) : '0',
      paymentSuccessRate: attempts ? Math.round((paid.length / attempts) * 1000) / 10 : 0,
      topServices: Object.entries(revenueByService)
        .sort(([, a], [, b]) => (a < b ? 1 : -1))
        .slice(0, 5)
        .map(([serviceId, wei]) => ({ serviceId, revenueBOT: formatEtherSafe(wei) })),
      topCustomers: Object.entries(revenueByCustomer)
        .sort(([, a], [, b]) => (a < b ? 1 : -1))
        .slice(0, 5)
        .map(([agentId, wei]) => ({ agentId, revenueBOT: formatEtherSafe(wei) }))
    }
  };
};

// ==================== Developer-scoped helpers ====================

export const getAgentByCode = async (agentId) => {
  const { data, error } = await supabase.from('ai_agents').select('*').eq('agent_id', agentId).maybeSingle();
  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  if (data) return data;
  // Gateway may have degraded to anon (RLS filters all rows). Confirm via direct DB.
  try {
    const { rows } = await getPool().query('SELECT * FROM ai_agents WHERE agent_id = $1 LIMIT 1', [agentId]);
    return rows[0] || null;
  } catch {
    return null;
  }
};
