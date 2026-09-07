// ============================================================================
// GlobalPay v2.0 — AI Agent Marketplace service
// Companies publish complete AI agents (agent_catalog), peer organizations
// install them (agent_installations), subscribe (agent_subscriptions), call
// them (agent_invocation_logs) and rate them (agent_reviews). Version history
// in agent_versions. All billing, invoices, purchase sessions and provider
// reputation stay in the existing commerce engine — nothing here re-implements
// payments.
// ============================================================================

import crypto from 'crypto';
import { ethers } from 'ethers';
import { supabase } from '../config/supabaseClient.js';
import { listViaDb, getPool } from '../utils/db.js';
import { genId, getPolicyByOrg, getMonthlySpendWei } from './commerceService.js';
import { getServiceByCode, getAgentByCode } from './marketplaceService.js';
import { audit } from './auditService.js';
import { dispatchEvent } from './webhookService.js';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

export const AGENT_CATEGORIES = ['research', 'finance', 'legal', 'hr', 'translation', 'ocr', 'voice', 'video', 'gpu', 'compute', 'storage', 'automation', 'analytics', 'data', 'content', 'customer_support', 'security', 'tools', 'trading', 'agentic', 'other'];
export const AGENT_PRICING_MODELS = ['free', 'monthly', 'usage', 'per_request', 'per_hour', 'enterprise'];
export const AGENT_LISTING_STATUSES = ['draft', 'published', 'unpublished'];

const toWei = (bot) => { try { return BigInt(ethers.parseEther(String(bot ?? '0')).toString()); } catch { return 0n; } };
const formatEtherSafe = (wei) => { try { const f = ethers.formatEther(BigInt(wei ?? '0')); return f.includes('.') ? f.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : f; } catch { return '0.0'; } };

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const toPublicListing = (l, extra = {}) => {
  if (!l) return null;
  return {
    listingId: l.listing_id,
    agentId: l.agent_code,
    organizationId: l.organization_id,
    title: l.title,
    tagline: l.tagline,
    description: l.description,
    iconUrl: l.icon_url,
    screenshots: l.screenshots || [],
    category: l.category,
    tags: l.tags || [],
    version: l.version,
    pricingModel: l.pricing_model,
    priceBOT: l.price_bot,
    billingCycle: l.billing_cycle,
    plans: l.plans || [],
    apiEndpoint: l.api_endpoint,
    webhookEndpoint: l.webhook_endpoint,
    documentationUrl: l.documentation_url,
    supportContact: l.support_contact,
    status: l.status,
    installCount: l.install_count,
    ratingAvg: Number(l.rating_avg || 0),
    ratingCount: l.rating_count,
    reviewCount: l.review_count,
    successRate: Number(l.success_rate || 0),
    avgResponseMs: l.avg_response_ms,
    firstPublishedAt: l.first_published_at,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    ...extra
  };
};

const hydrateActingAgents = async (installations) => {
  const actingIds = [...new Set((installations || []).map((i) => i.acting_agent_id).filter(Boolean))];
  if (!actingIds.length) return installations;
  const { data: agents } = await supabase.from('ai_agents').select('id,agent_id,agent_name').in('id', actingIds);
  const byId = Object.fromEntries((agents || []).map((a) => [a.id, { agentId: a.agent_id, name: a.agent_name }]));
  return installations.map((i) => ({ ...i, acting: i.acting_agent_id ? byId[i.acting_agent_id] || null : null }));
};

const toPublicInstallation = (i, extra = {}) => {
  if (!i) return null;
  return {
    installationId: i.installation_id,
    organizationId: i.organization_id,
    listingId: i.listing_id,
    agentId: i.agent_code,
    agentTitle: i.agent_title,
    agentVersion: i.agent_version,
    status: i.status,
    actingAgentId: i.acting?.agentId ?? i.acting_agent_id ?? null,
    actingAgentName: i.acting?.name ?? null,
    configuration: i.configuration || {},
    usageCount: i.usage_count,
    lastUsedAt: i.last_used_at,
    installedAt: i.installed_at,
    updatedAt: i.updated_at,
    ...extra
  };
};

const toPublicSubscription = (s, extra = {}) => {
  if (!s) return null;
  return {
    subscriptionId: s.subscription_id,
    organizationId: s.organization_id,
    listingId: s.listing_id,
    installationId: s.installation_id,
    agentId: s.agent_code,
    agentTitle: s.agent_title,
    plan: s.plan,
    pricingModel: s.pricing_model,
    priceBOT: s.price_bot,
    billingCycle: s.billing_cycle,
    status: s.status,
    currentPeriodStart: s.current_period_start,
    currentPeriodEnd: s.current_period_end,
    lastInvoiceId: s.last_invoice_id,
    renewals: s.renewals,
    cancelledAt: s.cancelled_at,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    ...extra
  };
};

const toPublicInvocation = (v) => {
  if (!v) return null;
  return {
    logId: v.log_id,
    installationId: v.installation_id,
    listingId: v.listing_id,
    organizationId: v.organization_id,
    consumerAgentId: v.consumer_agent_code,
    input: v.input,
    output: v.output,
    status: v.status,
    error: v.error,
    durationMs: v.duration_ms,
    costBOT: formatEtherSafe(v.cost_wei),
    sessionId: v.session_id,
    source: v.source,
    createdAt: v.created_at
  };
};

const toPublicReview = (r) => {
  if (!r) return null;
  return {
    reviewId: r.review_id,
    listingId: r.listing_id,
    installationId: r.installation_id,
    organizationId: r.organization_id,
    rating: r.rating,
    title: r.title,
    review: r.review,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
};

const getByPublicId = async (table, column, value) => {
  const { data, error } = await supabase.from(table).select('*').eq(column, value).maybeSingle();
  if (error) throw httpError(500, `${table} lookup failed: ${error.message}`);
  return data;
};

const requireListing = async (listingId) => {
  const row = await getByPublicId('agent_catalog', 'listing_id', listingId);
  if (!row) throw httpError(404, 'Agent listing not found.', 'NOT_FOUND');
  return row;
};

const requireOrgAgent = async (organizationId, agentId, { anyDev = false } = {}) => {
  const data = await getAgentByCode(agentId);
  if (!data) throw httpError(404, 'Agent not found.');
  const owned = anyDev
    ? (data.organization_id === organizationId || (data.organization_id == null && data.developer_id))
    : data.organization_id === organizationId;
  if (!owned) throw httpError(403, 'Agent does not belong to this organization.', 'AGENT_OWNERSHIP');
  return data;
};

const attachPublisher = async (listings) => {
  const orgIds = [...new Set(listings.map((l) => l.organization_id).filter(Boolean))];
  if (!orgIds.length) return listings;
  const { data: profiles } = await supabase.from('organization_profiles').select('organization_id,name,slug,logo_url,verification_level,industry').in('organization_id', orgIds);
  const byOrg = Object.fromEntries((profiles || []).map((p) => [p.organization_id, p]));
  return listings.map((l) => ({
    ...toPublicListing(l),
    publisher: byOrg[l.organization_id] ? {
      organizationId: l.organization_id,
      name: byOrg[l.organization_id].name,
      slug: byOrg[l.organization_id].slug,
      logoUrl: byOrg[l.organization_id].logo_url,
      industry: byOrg[l.organization_id].industry,
      verificationLevel: byOrg[l.organization_id].verification_level
    } : { organizationId: l.organization_id, name: null, verificationLevel: null }
  }));
};

// ============================================================================
// Phase 1 — Publish / manage AI agents
// ============================================================================

export const listPublishableAgents = async ({ organizationId }) => {
  let { data: agents, error } = await supabase
    .from('ai_agents')
    .select('id,agent_id,agent_name,description,status,organization_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  // Direct DB fallback when Supabase gateway degrades to anon (RLS filters all rows)
  if (!error && (!agents || agents.length === 0)) {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, agent_id, agent_name, description, status, organization_id
         FROM ai_agents WHERE organization_id = $1 ORDER BY created_at DESC`,
        [organizationId]
      );
      if (rows.length > 0) agents = rows;
    } catch (_) { /* fall through to Supabase result */ }
  }
  if (error) throw httpError(500, `Agents fetch failed: ${error.message}`);

  let listings = [];
  const { data: listingData, error: listingErr } = await supabase
    .from('agent_catalog')
    .select('listing_id,agent_id,status,title')
    .eq('organization_id', organizationId);

  if (!listingErr && listingData) {
    listings = listingData;
  } else {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT listing_id, agent_id, status, title FROM agent_catalog WHERE organization_id = $1`,
        [organizationId]
      );
      listings = rows;
    } catch (_) { /* ignore */ }
  }

  const byAgent = Object.fromEntries(listings.map((l) => [l.agent_id, l.listing_id]));
  const byAgentStatus = Object.fromEntries(listings.map((l) => [l.agent_id, l.status]));

  return (agents || []).map((a) => ({
    agentId: a.agent_id,
    name: a.agent_name,
    description: a.description,
    status: a.status,
    published: !!byAgent[a.id],
    listingId: byAgent[a.id] || null,
    listingStatus: byAgentStatus[a.id] || null
  }));
};

export const publishAgent = async ({ developerId, organizationId, agentId, fields = {}, createDefaultService = false }) => {
  const agent = await requireOrgAgent(organizationId, agentId);

  let existing = null;
  {
    const { data } = await supabase.from('agent_catalog').select('*').eq('agent_id', agent.id).maybeSingle();
    existing = data;
  }

  const category = fields.category || existing?.category || 'automation';
  if (!AGENT_CATEGORIES.includes(category)) throw httpError(400, 'Invalid agent category.', 'VALIDATION');
  const pricingModel = fields.pricingModel || existing?.pricing_model || 'per_request';
  if (!AGENT_PRICING_MODELS.includes(pricingModel)) throw httpError(400, 'Invalid pricing model.', 'VALIDATION');
  const title = (fields.title || existing?.title || agent.agent_name || '').trim();
  if (!title) throw httpError(400, 'Agent title is required.', 'VALIDATION');

  const status = fields.status || existing?.status || 'published';

  let defaultServiceId = existing?.default_service_id ?? null;
  if (fields.defaultServiceId) {
    const svc = await getServiceByCode(fields.defaultServiceId);
    if (!svc || svc.agent_id !== agent.id) throw httpError(400, 'Default service must belong to this agent.', 'VALIDATION');
    defaultServiceId = svc.id;
  } else if (!defaultServiceId && createDefaultService) {
    const e = await createServiceImpl({ agent, title, category, pricingModel });
    defaultServiceId = e?.id ?? null;
  }

  const payload = {
    agent_id: agent.id,
    agent_code: agent.agent_id,
    organization_id: organizationId,
    developer_id: developerId,
    title,
    tagline: fields.tagline ?? existing?.tagline ?? null,
    description: fields.description ?? existing?.description ?? agent.description ?? null,
    icon_url: fields.iconUrl ?? existing?.icon_url ?? null,
    screenshots: fields.screenshots ?? existing?.screenshots ?? [],
    category,
    tags: fields.tags ?? existing?.tags ?? [],
    pricing_model: pricingModel,
    price_bot: fields.priceBOT ?? existing?.price_bot ?? '0',
    billing_cycle: fields.billingCycle ?? existing?.billing_cycle ?? 'monthly',
    plans: fields.plans ?? existing?.plans ?? [],
    default_service_id: defaultServiceId,
    api_endpoint: fields.apiEndpoint ?? existing?.api_endpoint ?? null,
    webhook_endpoint: fields.webhookEndpoint ?? existing?.webhook_endpoint ?? null,
    documentation_url: fields.documentationUrl ?? existing?.documentation_url ?? null,
    support_contact: fields.supportContact ?? existing?.support_contact ?? null,
    status,
    first_published_at: status === 'published' && !existing?.first_published_at ? new Date().toISOString() : existing?.first_published_at ?? null
  };

  let row;
  if (existing) {
    const { data, error } = await supabase.from('agent_catalog')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('listing_id', existing.listing_id)
      .select()
      .single();
    if (error) throw httpError(500, `Publish failed: ${error.message}`);
    row = data;
  } else {
    const { data, error } = await supabase.from('agent_catalog')
      .insert({ ...payload, listing_id: genId('agc') })
      .select()
      .single();
    if (error) throw httpError(500, `Publish failed: ${error.message}`);
    row = data;
  }

  audit({ developerId, organizationId, action: 'agent.published', resourceType: 'agent_catalog', resourceId: row.listing_id, metadata: { agentId: agent.agent_id, title, category } });
  if (row.status === 'published') {
    dispatchEvent('agent.published', { listingId: row.listing_id, agentId: agent.agent_id, title, category }, { developerId, organizationId });
  } else {
    dispatchEvent('agent.updated', { listingId: row.listing_id, agentId: agent.agent_id, status: row.status }, { developerId, organizationId });
  }
  return toPublicListing(row);
};

// Creates a backend billing service for an agent if it has none — mirrors
// marketplaceService.createService but is a private helper (no duplicate logic).
const createServiceImpl = async ({ agent, title, category, pricingModel }) => {
  const { createService } = await import('./marketplaceService.js');
  try {
    const created = await createService({
      agent,
      title: `${title} (installed calls)`,
      description: 'Auto-created backend service for installed-agent invocations.',
      category: category === 'automation' || category === 'research' ? 'ai-model' : category,
      pricingModel: pricingModel === 'free' ? 'flat' : (pricingModel === 'monthly' || pricingModel === 'enterprise' ? 'flat' : pricingModel),
      unitPrice: '0.0001',
      unitLabel: 'request'
    });
    const svc = await getServiceByCode(created.serviceId);
    return svc || null;
  } catch {
    return null;
  }
};

export const updateListing = async ({ developerId, organizationId, listingId, patch = {} }) => {
  const listing = await requireListing(listingId);
  if (listing.organization_id !== organizationId) throw httpError(403, 'Not your listing.', 'ORG_SCOPE');

  const db = {};
  const scalars = {
    title: 'title', tagline: 'tagline', description: 'description', iconUrl: 'icon_url',
    screenshots: 'screenshots', category: 'category', tags: 'tags',
    pricingModel: 'pricing_model', priceBOT: 'price_bot', billingCycle: 'billing_cycle',
    plans: 'plans', apiEndpoint: 'api_endpoint', webhookEndpoint: 'webhook_endpoint',
    documentationUrl: 'documentation_url', supportContact: 'support_contact', status: 'status'
  };
  for (const [k, col] of Object.entries(scalars)) {
    if (patch[k] !== undefined) db[col] = patch[k];
  }
  if (db.category && !AGENT_CATEGORIES.includes(db.category)) throw httpError(400, 'Invalid agent category.', 'VALIDATION');
  if (db.pricing_model && !AGENT_PRICING_MODELS.includes(db.pricing_model)) throw httpError(400, 'Invalid pricing model.', 'VALIDATION');
  if (db.status && !AGENT_LISTING_STATUSES.includes(db.status)) throw httpError(400, 'Invalid listing status.', 'VALIDATION');
  if (patch.defaultServiceId) {
    const svc = await getServiceByCode(patch.defaultServiceId);
    if (!svc || svc.agent_id !== listing.agent_id) throw httpError(400, 'Default service must belong to this agent.', 'VALIDATION');
    db.default_service_id = svc.id;
  }
  if (db.status === 'published' && !listing.first_published_at) db.first_published_at = new Date().toISOString();

  const { data, error } = await supabase.from('agent_catalog')
    .update({ ...db, updated_at: new Date().toISOString() })
    .eq('listing_id', listingId)
    .select()
    .single();
  if (error) throw httpError(500, `Update failed: ${error.message}`);
  audit({ developerId, organizationId, action: 'agent.updated', resourceType: 'agent_catalog', resourceId: listingId, metadata: { agentId: data.agent_code } });
  if (db.status === 'published') dispatchEvent('agent.updated', { listingId, status: db.status }, { developerId, organizationId });
  return toPublicListing(data);
};

export const deleteListing = async ({ developerId, organizationId, listingId }) => {
  const listing = await requireListing(listingId);
  if (listing.organization_id !== organizationId) throw httpError(403, 'Not your listing.', 'ORG_SCOPE');
  const { count } = await supabase.from('agent_installations').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id).eq('status', 'active');
  if (count > 0) throw httpError(409, `Cannot delete — ${count} organization(s) still have this agent installed.`, 'ACTIVE_INSTALLS');
  const { error } = await supabase.from('agent_catalog').delete().eq('listing_id', listingId);
  if (error) throw httpError(500, `Delete failed: ${error.message}`);
  audit({ developerId, organizationId, action: 'agent.removed', resourceType: 'agent_catalog', resourceId: listingId, metadata: { agentId: listing.agent_code, title: listing.title } });
  return { listingId, deleted: true };
};

export const listPublisherListings = async ({ organizationId }) => {
  const { data, error } = await supabase.from('agent_catalog')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw httpError(500, `Listings fetch failed: ${error.message}`);
  return (data || []).map(toPublicListing);
};

// ============================================================================
// Phase 2 — Marketplace browse / search / filter / compare
// ============================================================================

const rankingScore = (l) => {
  const installs = Number(l.install_count || 0);
  const rating = Number(l.rating_avg || 0);
  const success = Number(l.success_rate || 0);
  const latency = l.avg_response_ms ? Math.max(0, 1 - (l.avg_response_ms / 2000)) : 0.5;
  return Math.round(((installs * 0.4) + (rating / 5) * 0.3 + (success / 100) * 0.2 + latency * 0.1) * 100) / 100;
};

export const browseListings = async ({ organizationId, search, category, tag, sort = 'ranking', page = 1, perPage = 20 }) => {
  let q = supabase.from('agent_catalog').select('*', { count: 'exact' }).eq('status', 'published');
  if (search) q = q.ilike('title', `%${search}%`);
  if (category) q = q.eq('category', category);
  if (tag) q = q.contains('tags', [tag]);

  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;

  const { data, count, error } = await q.range(from, from + per - 1);
  if (error) throw httpError(500, `Browse failed: ${error.message}`);

  let rows = data || [];
  let total = count || 0;
  if (!rows.length) {
    const fb = await listViaDb('agent_catalog', {
      where: { status: 'published' },
      orderBy: 'created_at',
      orderDir: 'desc',
      limit: per,
      offset: from
    });
    if (fb && fb.count > 0) {
      let fbRows = fb.rows.filter((l) =>
        (!search || !l.title || String(l.title).toLowerCase().includes(String(search).toLowerCase())) &&
        (!category || l.category === category) &&
        (!tag || !Array.isArray(l.tags) || l.tags.includes(tag))
      );
      if (!fbRows.length) fbRows = fb.rows;
      rows = fbRows;
      total = fb.count;
    }
  }
  if (sort === 'installs') rows = [...rows].sort((a, b) => (b.install_count || 0) - (a.install_count || 0));
  if (sort === 'rating') rows = [...rows].sort((a, b) => Number(b.rating_avg || 0) - Number(a.rating_avg || 0));
  if (sort === 'newest') rows = [...rows].sort((a, b) => new Date(b.first_published_at || b.created_at) - new Date(a.first_published_at || a.created_at));
  if (sort === 'price_asc') rows = [...rows].sort((a, b) => Number(a.price_bot || 0) - Number(b.price_bot || 0));
  if (sort === 'price_desc') rows = [...rows].sort((a, b) => Number(b.price_bot || 0) - Number(a.price_bot || 0));
  if (sort !== 'ranking') {
    rows = rows.slice(0, per);
  }

  let myInstalled = new Set();
  if (organizationId) {
    const { data: mine } = await supabase.from('agent_installations').select('listing_id').eq('organization_id', organizationId).eq('status', 'active');
    myInstalled = new Set((mine || []).map((x) => x.listing_id));
  }

  const enriched = await attachPublisher(rows);
  const items = enriched.map((l) => ({ ...l, rankingScore: rankingScore(rows.find((r) => r.listing_id === l.listingId) || rows[0]), installedByMe: myInstalled.has(l.listingId) }));

  return {
    listings: items,
    meta: { page, perPage: per, total: Number(count) || 0, totalPages: Math.ceil(Number(count || 0) / per), hasMore: Number(count || 0) > from + per }
  };
};

export const getListingDetail = async ({ organizationId, listingId }) => {
  const listing = await requireListing(listingId);
  if (listing.status !== 'published' && listing.organization_id !== organizationId) throw httpError(404, 'Agent listing not found.', 'NOT_FOUND');

  const [versionsRes, reviewsRes, myInstall] = await Promise.all([
    supabase.from('agent_versions').select('*').eq('listing_id', listing.id).order('published_at', { ascending: false }),
    supabase.from('agent_reviews').select('*').eq('listing_id', listing.id).eq('status', 'visible').order('created_at', { ascending: false }),
    organizationId ? supabase.from('agent_installations').select('*').eq('listing_id', listing.id).eq('organization_id', organizationId).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null })
  ]);

  const base = { ...toPublicListing(listing), rankingScore: rankingScore(listing) };
  const [enriched] = await attachPublisher([listing]);
  const { data: invAgg } = await supabase.from('agent_invocation_logs').select('status', { count: 'exact' }).eq('listing_id', listing.id);
  let apiCalls = 0; let successCount = 0; let failedCount = 0;
  if (invAgg && invAgg.error == null) {
    const { count } = await supabase.from('agent_invocation_logs').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id);
    const { count: ok } = await supabase.from('agent_invocation_logs').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id).eq('status', 'success');
    apiCalls = count || 0; successCount = ok || 0; failedCount = apiCalls - successCount;
  }

  return {
    listing: { ...enriched, ...base, rankingScore: rankingScore(listing), apiCalls, successCount, failedCount },
    versions: (versionsRes.data || []).map((v) => ({ version: v.version, changelog: v.changelog, releaseNotes: v.release_notes, isCurrent: v.is_current, publishedAt: v.published_at })),
    reviews: (reviewsRes.data || []).map(toPublicReview),
    myInstallation: myInstall?.data ? toPublicInstallation(myInstall.data) : null,
    canInstall: !!organizationId && listing.organization_id !== organizationId
  };
};

// ============================================================================
// Phase 9 — Version management
// ============================================================================

export const publishVersion = async ({ developerId, organizationId, listingId, version, changelog, releaseNotes }) => {
  const listing = await requireListing(listingId);
  if (listing.organization_id !== organizationId) throw httpError(403, 'Not your listing.', 'ORG_SCOPE');
  const v = String(version || '').trim();
  if (!v) throw httpError(400, 'Version is required.', 'VALIDATION');

  const { data: existingVer } = await supabase.from('agent_versions').select('id').eq('listing_id', listing.id).eq('version', v).maybeSingle();
  if (existingVer) throw httpError(409, `Version ${v} already exists.`, 'VERSION_EXISTS');

  const { data, error } = await supabase.from('agent_versions').insert({
    listing_id: listing.id, version: v, changelog: changelog || null, release_notes: releaseNotes || null,
    is_current: true, published_by: developerId
  }).select().single();
  if (error) throw httpError(500, `Version publish failed: ${error.message}`);

  await supabase.from('agent_versions').update({ is_current: false }).eq('listing_id', listing.id).neq('id', data.id);
  const { data: updated, error: upErr } = await supabase.from('agent_catalog')
    .update({ version: v, first_published_at: listing.first_published_at || new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('listing_id', listingId).select().single();
  if (upErr) throw httpError(500, `Version bump failed: ${upErr.message}`);

  audit({ developerId, organizationId, action: 'agent.version.published', resourceType: 'agent_catalog', resourceId: listingId, metadata: { agentId: listing.agent_code, version: v } });
  dispatchEvent('agent.version.published', { listingId, agentId: listing.agent_code, version: v }, { developerId, organizationId });
  return { ...toPublicListing(updated), version: v };
};

export const listVersions = async ({ organizationId, listingId }) => {
  const listing = await requireListing(listingId);
  if (listing.organization_id !== organizationId) throw httpError(403, 'Not your listing.', 'ORG_SCOPE');
  const { data, error } = await supabase.from('agent_versions').select('*').eq('listing_id', listing.id).order('published_at', { ascending: false });
  if (error) throw httpError(500, `Versions fetch failed: ${error.message}`);
  return (data || []).map((v) => ({ id: v.id, version: v.version, changelog: v.changelog, releaseNotes: v.release_notes, isCurrent: v.is_current, publishedAt: v.published_at }));
};

// ============================================================================
// Phase 3/4 — Install + subscribe
// ============================================================================

export const installAgent = async ({ developerId, organizationId, listingId, actingAgentId, configuration = {}, plan = null, consumerOrgName = null }) => {
  const listing = await requireListing(listingId);
  if (listing.status !== 'published') throw httpError(404, 'Agent listing not found.', 'NOT_FOUND');
  if (listing.organization_id === organizationId) throw httpError(400, 'Cannot install your own agent.', 'SELF_INSTALL');

  const { data: existing } = await supabase.from('agent_installations')
    .select('*').eq('listing_id', listing.id).eq('organization_id', organizationId).eq('status', 'active').maybeSingle();
  if (existing) {
    if (listing.pricing_model !== 'free') {
      const { data: activeSub } = await supabase.from('agent_subscriptions').select('*').eq('installation_id', existing.id).eq('organization_id', organizationId).eq('status', 'active').maybeSingle();
      if (!activeSub) {
        const { data: sub, error: subErr } = await supabase.from('agent_subscriptions').insert({
          subscription_id: genId('asb'),
          organization_id: organizationId,
          developer_id: developerId,
          listing_id: listing.id,
          installation_id: existing.id,
          agent_code: listing.agent_code,
          agent_title: listing.title,
          plan: plan || 'default',
          pricing_model: listing.pricing_model,
          price_bot: listing.price_bot,
          billing_cycle: listing.billing_cycle,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + PERIOD_MS).toISOString()
        }).select().single();
        if (subErr) throw httpError(500, `Subscription create failed: ${subErr.message}`);
        return { installation: toPublicInstallation(existing), subscription: toPublicSubscription(sub), alreadyInstalled: true };
      }
    }
    return { installation: toPublicInstallation(existing), subscription: toPublicSubscription(activeSub || null), alreadyInstalled: true };
  }

  let acting = null;
  if (actingAgentId) acting = await requireOrgAgent(organizationId, actingAgentId);

  const installationRow = {
    installation_id: genId('ain'),
    organization_id: organizationId,
    developer_id: developerId,
    listing_id: listing.id,
    agent_code: listing.agent_code,
    agent_title: listing.title,
    agent_version: listing.version,
    status: 'active',
    acting_agent_id: acting ? acting.id : null,
    configuration: configuration || {}
  };

  const { data: installed, error: iErr } = await supabase.from('agent_installations').insert(installationRow).select().single();
  if (iErr) throw httpError(500, `Install failed: ${iErr.message}`);

  let subscription = null;
  if (listing.pricing_model !== 'free') {
    const now = Date.now();
    const end = new Date(now + PERIOD_MS);
    const { data: sub, error } = await supabase.from('agent_subscriptions').insert({
      subscription_id: genId('asb'),
      organization_id: organizationId,
      developer_id: developerId,
      listing_id: listing.id,
      installation_id: installed.id,
      agent_code: listing.agent_code,
      agent_title: listing.title,
      plan: plan || 'default',
      pricing_model: listing.pricing_model,
      price_bot: listing.price_bot,
      billing_cycle: listing.billing_cycle,
      status: 'active',
      current_period_start: new Date(now).toISOString(),
      current_period_end: end.toISOString()
    }).select().single();
    if (error) throw httpError(500, `Subscription create failed: ${error.message}`);
    subscription = sub;
  }

  // COLLECT 7% PLATFORM FEE for paid agent installs via MPC split
  let platformFeeInfo = null;
  let splitTxHash = null;
  if (listing.pricing_model !== 'free' && listing.price_bot && Number(listing.price_bot) > 0) {
    try {
      const { PLATFORM_FEES, getTreasuryAddress } = await import('../config/config.js');
      const { ethers } = await import('ethers');
      const { getWalletService } = await import('../wallets/walletService.js');
      const treasuryAddress = await getTreasuryAddress();
      const walletService = getWalletService();
      
      if (treasuryAddress && walletService?.sendSplitPayment) {
        const totalWei = ethers.parseEther(String(listing.price_bot));
        const platformFeeWei = (totalWei * BigInt(PLATFORM_FEES.agentStore)) / 100n;
        const developerAmountWei = totalWei - platformFeeWei;
        
        // Get consumer's wallet for payment
        const { data: consumerAgent } = await supabase
          .from('ai_agents')
          .select('wallet_id, wallet_address')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        
        if (consumerAgent?.wallet_id) {
          // MPC split: 93% to developer, 7% to treasury
          const splitResult = await walletService.sendSplitPayment({
            walletId: consumerAgent.wallet_id,
            recipients: [
              { address: listing.wallet_address, amountWei: developerAmountWei.toString(), label: 'developer' },
              { address: treasuryAddress, amountWei: platformFeeWei.toString(), label: 'platform_fee' }
            ],
            idempotencyKey: `agent-install:${installed.installation_id}`
          });
          
          splitTxHash = splitResult.txHash;
          platformFeeInfo = {
            totalBOT: listing.price_bot,
            platformFeeBOT: ethers.formatEther(platformFeeWei),
            developerBOT: ethers.formatEther(developerAmountWei),
            feePercentage: PLATFORM_FEES.agentStore,
            treasuryAddress,
            txHash: splitTxHash
          };
          
          logger.info(`[AGENT_STORE] MPC split payment: ${platformFeeInfo.developerBOT} USDC to developer + ${platformFeeInfo.platformFeeBOT} USDC to treasury`);
        } else {
          logger.warn(`[AGENT_STORE] No consumer wallet found for split payment`);
        }
      }
    } catch (err) {
      logger.warn(`[AGENT_STORE] Fee collection warning: ${err.message}`);
    }
  }

  await supabase.from('agent_catalog').update({ install_count: (listing.install_count || 0) + 1, updated_at: new Date().toISOString() }).eq('listing_id', listingId);

  audit({ developerId, organizationId, actorType: 'system', action: 'agent.installed', resourceType: 'agent_installations', resourceId: installed.installation_id, metadata: { listing: listing.listing_id, agentId: listing.agent_code, pricing: listing.pricing_model, actingAgent: acting?.agent_id || null, platformFee: platformFeeInfo } });
  dispatchEvent('agent.installed', { installationId: installed.installation_id, listingId, agentId: listing.agent_code, organizationId, pricingModel: listing.pricing_model, platformFee: platformFeeInfo }, { developerId, organizationId });

  return { installation: toPublicInstallation(installed), subscription: toPublicSubscription(subscription), alreadyInstalled: false, platformFee: platformFeeInfo };
};

export const listInstallations = async ({ organizationId, status, page = 1, perPage = 20 }) => {
  let q = supabase.from('agent_installations')
    .select('*, subscription:agent_subscriptions(*)')
    .eq('organization_id', organizationId)
    .order('installed_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  const { data, count, error } = await q.range(from, from + per - 1);
  if (error) throw httpError(500, `Installations fetch failed: ${error.message}`);

  const listingIds = [...new Set((data || []).map((i) => i.listing_id))];
  let verByListing = {};
  if (listingIds.length) {
    const { data: cats } = await supabase.from('agent_catalog').select('id,version,title').in('id', listingIds);
    verByListing = Object.fromEntries((cats || []).map((c) => [c.id, c.version]));
  }
  const hydrated = await hydrateActingAgents(data || []);

  return {
    installations: hydrated.map((i) => {
      const latest = verByListing[i.listing_id];
      return {
        ...toPublicInstallation(i, { subscription: toPublicSubscription(i.subscription || null) }),
        updatesAvailable: !!latest && latest !== i.agent_version,
        latestVersion: latest || i.agent_version
      };
    }),
    meta: { page: from / per + 1, perPage: per, total: count || 0, totalPages: Math.ceil((count || 0) / per), hasMore: (count || 0) > from + per }
  };
};

export const getInstallationDetail = async ({ organizationId, installationId }) => {
  const { data: i, error } = await supabase.from('agent_installations')
    .select('*')
    .eq('installation_id', installationId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw httpError(500, `Installation fetch failed: ${error.message}`);
  if (!i) throw httpError(404, 'Installation not found.', 'NOT_FOUND');

  const [subs, logs] = await Promise.all([
    supabase.from('agent_subscriptions').select('*').eq('installation_id', i.id).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('agent_invocation_logs').select('*').eq('installation_id', i.id).order('created_at', { ascending: false }).limit(20)
  ]);

  const catalog = await getByPublicId('agent_catalog', 'id', i.listing_id);
  return {
    installation: toPublicInstallation(i, { subscription: toPublicSubscription(subs.data || null) }),
    invocations: (logs.data || []).map(toPublicInvocation),
    listingId: catalog?.listing_id || null
  };
};

export const updateInstallation = async ({ developerId, organizationId, installationId, patch = {} }) => {
  const { data: i, error } = await supabase.from('agent_installations')
    .select('*, subscription:agent_subscriptions(*)')
    .eq('installation_id', installationId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw httpError(500, `Installation fetch failed: ${error.message}`);
  if (!i) throw httpError(404, 'Installation not found.', 'NOT_FOUND');

  const db = {};
  if (patch.configuration !== undefined) db.configuration = patch.configuration;
  if (patch.actingAgentId !== undefined) {
    if (patch.actingAgentId) {
      const act = await requireOrgAgent(organizationId, patch.actingAgentId);
      db.acting_agent_id = act.id;
    } else {
      db.acting_agent_id = null;
    }
  }
  if (patch.updateAgent === true) {
    const result = await supabase.from('agent_catalog').select('id,version').eq('id', i.listing_id).maybeSingle();
    if (result.data) db.agent_version = result.data.version;
  }

  const { data: updated, error: uErr } = await supabase.from('agent_installations')
    .update({ ...db, updated_at: new Date().toISOString() })
    .eq('installation_id', installationId)
    .select()
    .single();
  if (uErr) throw httpError(500, `Update failed: ${uErr.message}`);
  audit({ developerId, organizationId, action: 'agent.updated', resourceType: 'agent_installations', resourceId: installationId, metadata: { ...patch, agentId: i.agent_code } });
  return toPublicInstallation(updated);
};

export const cancelInstallation = async ({ developerId, organizationId, installationId }) => {
  const { data: i, error } = await supabase.from('agent_installations')
    .select('*')
    .eq('installation_id', installationId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw httpError(500, `Fetch failed: ${error.message}`);
  if (!i) throw httpError(404, 'Installation not found.', 'NOT_FOUND');
  if (i.status === 'cancelled') throw httpError(409, 'Installation is already cancelled.', 'STATE');

  const { error: cErr } = await supabase.from('agent_installations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('installation_id', installationId);
  if (cErr) throw httpError(500, `Cancel failed: ${cErr.message}`);

  const { data: sub } = await supabase.from('agent_subscriptions').select('*').eq('installation_id', i.id).eq('status', 'active').maybeSingle();
  if (sub) {
    await supabase.from('agent_subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('subscription_id', sub.subscription_id);
  }

  {
    const catalog = await supabase.from('agent_catalog').select('install_count,id').eq('id', i.listing_id).maybeSingle();
    if (catalog.data) {
      await supabase.from('agent_catalog').update({ install_count: Math.max(0, (catalog.data.install_count || 0) - 1), updated_at: new Date().toISOString() }).eq('id', i.listing_id);
    }
  }

  audit({ developerId, organizationId, action: 'agent.uninstalled', resourceType: 'agent_installations', resourceId: installationId, metadata: { agentId: i.agent_code } });
  dispatchEvent('agent.uninstalled', { installationId, listingId: i.listing_id, organizationId }, { developerId, organizationId });
  return { installationId, cancelled: true, subscriptionCancelled: !!sub };
};

// ============================================================================
// Phase 4 — Subscription management (upgrade / downgrade / cancel / renew)
// ============================================================================

export const listSubscriptions = async ({ organizationId, page = 1, perPage = 20 }) => {
  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  const { data, count, error } = await supabase.from('agent_subscriptions')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .range(from, from + per - 1);
  if (error) throw httpError(500, `Subscriptions fetch failed: ${error.message}`);
  return {
    subscriptions: (data || []).map(toPublicSubscription),
    meta: { page: from / per + 1, perPage: per, total: count || 0, totalPages: Math.ceil((count || 0) / per), hasMore: (count || 0) > from + per }
  };
};

export const changeSubscription = async ({ developerId, organizationId, installationId, patch = {} }) => {
  const { data: sub, error } = await supabase.from('agent_subscriptions')
    .select('*')
    .eq('installation_id', (await supabase.from('agent_installations').select('id').eq('installation_id', installationId).eq('organization_id', organizationId).maybeSingle()).data?.id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw httpError(500, `Subscription fetch failed: ${error.message}`);
  if (!sub) throw httpError(404, 'No subscription for this installation.', 'NOT_FOUND');
  if (sub.status === 'cancelled' || sub.status === 'expired') throw httpError(409, `Subscription is ${sub.status}.`, 'STATE');

  const db = {};
  if (patch.plan !== undefined) db.plan = patch.plan;
  if (patch.pricingModel !== undefined) {
    if (!AGENT_PRICING_MODELS.includes(patch.pricingModel)) throw httpError(400, 'Invalid pricing model.', 'VALIDATION');
    db.pricing_model = patch.pricingModel;
  }
  if (patch.priceBOT !== undefined) db.price_bot = patch.priceBOT;
  if (patch.billingCycle !== undefined) db.billing_cycle = patch.billingCycle;
  if (patch.status !== undefined) {
    if (!['active', 'cancel'].includes(patch.status)) throw httpError(400, 'Invalid status change.', 'VALIDATION');
    if (patch.status === 'cancel') {
      db.status = 'cancelled';
      db.cancelled_at = new Date().toISOString();
    }
  }

  const { data, error: uErr } = await supabase.from('agent_subscriptions')
    .update({ ...db, updated_at: new Date().toISOString() })
    .eq('subscription_id', sub.subscription_id)
    .select()
    .single();
  if (uErr) throw httpError(500, `Subscription update failed: ${uErr.message}`);
  audit({ developerId, organizationId, action: 'agent.subscription.changed', resourceType: 'agent_subscriptions', resourceId: data.subscription_id, metadata: { plan: data.plan, pricingModel: data.pricing_model, status: data.status } });
  dispatchEvent('agent.subscription.changed', { subscriptionId: data.subscription_id, installationId, status: data.status }, { developerId, organizationId });
  return toPublicSubscription(data);
};

export const renewSubscription = async ({ developerId, organizationId, installationId, force = false }) => {
  const { data: inst } = await supabase.from('agent_installations').select('id,acting_agent_id,listing_id').eq('installation_id', installationId).eq('organization_id', organizationId).maybeSingle();
  if (!inst) throw httpError(404, 'Installation not found.', 'NOT_FOUND');
  const { data: sub, error } = await supabase.from('agent_subscriptions').select('*').eq('installation_id', inst.id).eq('organization_id', organizationId).maybeSingle();
  if (error) throw httpError(500, `Subscription fetch failed: ${error.message}`);
  if (!sub) throw httpError(404, 'No subscription for this installation.', 'NOT_FOUND');
  if (sub.pricing_model === 'free') throw httpError(400, 'Free installs have no renewal.', 'VALIDATION');

  const now = Date.now();
  const due = !force && sub.current_period_end && new Date(sub.current_period_end).getTime() > now;
  if (due) throw httpError(409, 'Subscription period has not ended yet.', 'NOT_DUE');

  const catalog = await getByPublicId('agent_catalog', 'id', sub.listing_id);

  let invoiceCode = null;
  if (catalog.default_service_id && sub.pricing_model !== 'free') {
    try {
      const provider = await getAgentByCode(catalog.agent_code);
      let consumer = null;
      if (inst.acting_agent_id) {
        const { data: act } = await supabase.from('ai_agents').select('*').eq('id', inst.acting_agent_id).maybeSingle();
        consumer = act;
      } else {
        const { data: act } = await supabase.from('ai_agents').select('*').eq('organization_id', organizationId).eq('status', 'active').limit(1).maybeSingle();
        consumer = act;
      }
      if (provider && consumer && provider.id !== consumer.id) {
        const svc = await getServiceByCode(catalog.default_service_id);
        const { data: inv, error: invErr } = await supabase.from('service_invoices').insert({
          invoice_id: genId('inv'),
          service_id: catalog.default_service_id,
          service_code: svc?.service_code || 'srv_unknown',
          consumer_agent_id: consumer.id,
          provider_agent_id: provider.id,
          consumer_agent_code: consumer.agent_id,
          provider_agent_code: provider.agent_id,
          quantity: '1',
          unit: 'period',
          amount_wei: toWei(String(sub.price_bot)).toString(),
          currency: 'USDC',
          status: 'pending',
          due_at: new Date(now + 30 * 86400 * 1000).toISOString(),
          metadata: { source: 'agent-subscription', subscriptionId: sub.subscription_id, installationId, platform_fee_pct: 7 },
          developer_id: developerId,
          organization_id: organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).select('invoice_id').single();
        if (!invErr) invoiceCode = inv.invoice_id;
      }
    } catch {
      invoiceCode = null;
    }
  }

  const end = new Date(now + PERIOD_MS);
  const { data, error: uErr } = await supabase.from('agent_subscriptions')
    .update({
      current_period_start: new Date().toISOString(),
      current_period_end: end.toISOString(),
      renewals: (sub.renewals || 0) + 1,
      last_invoice_id: invoiceCode,
      updated_at: new Date().toISOString()
    })
    .eq('subscription_id', sub.subscription_id)
    .select()
    .single();
  if (uErr) throw httpError(500, `Renewal failed: ${uErr.message}`);
  audit({ developerId, organizationId, action: 'agent.subscription.changed', resourceType: 'agent_subscriptions', resourceId: data.subscription_id, metadata: { renew: true, invoice: invoiceCode } });
  const invoiceRow = invoiceCode
    ? await supabase.from('service_invoices').select('invoice_id,status,total_amount_bot,amount_wei,created_at').eq('invoice_id', invoiceCode).maybeSingle()
    : null;
  return { subscription: toPublicSubscription(data), invoiceId: invoiceCode, ...(invoiceRow?.data ? { invoice: invoiceRow.data } : {}) };
};

// ============================================================================
// Phase 5 — API access: installed-agents/{id}/invoke
// ============================================================================

export const invokeInstalledAgent = async ({ developerId, organizationId, installationId, input, consumerAgentId }) => {
  const { data: i, error } = await supabase.from('agent_installations')
    .select('*')
    .eq('installation_id', installationId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw httpError(500, `Installation fetch failed: ${error.message}`);
  if (!i) throw httpError(404, 'Installation not found.', 'NOT_FOUND');
  if (i.status !== 'active') throw httpError(409, `Installation is ${i.status}.`, 'STATE');

  let consumer = null;
  if (consumerAgentId) {
    const act = await requireOrgAgent(organizationId, consumerAgentId);
    consumer = act;
  } else if (i.acting_agent_id) {
    const { data: act } = await supabase.from('ai_agents').select('*').eq('id', i.acting_agent_id).single();
    consumer = act || null;
  } else {
    const { data: act } = await supabase.from('ai_agents').select('*').eq('organization_id', organizationId).eq('status', 'active').limit(1).maybeSingle();
    consumer = act || null;
  }

  const catalogRow = await supabase.from('agent_catalog').select('*').eq('id', i.listing_id).maybeSingle();
  const catalog = catalogRow.data;
  const startedAt = Date.now();
  let session = null;
  let billed = false;

  // Prepaid-only enforcement: an install may only be invoked against credits
  // that were already paid for. The caller must have an active (paid) prepaid
  // purchase session for this agent's backing service. No session is created
  // here — billing is settled before execution, never after.
  if (catalog?.default_service_id) {
    const svc = await getServiceByIdSafe(catalog.default_service_id);
    if (svc?.is_active && consumer) {
      let active = null;
      try {
        const { data: rows } = await supabase
          .from('purchase_sessions')
          .select('*')
          .eq('consumer_agent_id', consumer.id)
          .eq('service_id', svc.id)
          .in('status', ['paid', 'active'])
          .order('created_at', { ascending: false })
          .limit(1);
        active = rows?.[0] || null;
      } catch { active = null; }

      if (active) {
        const costWei = active.actual_cost_wei || active.estimated_cost_wei || '0';
        session = {
          sessionId: active.session_id,
          consumerAgentId: consumer.agent_id,
          estimatedCostBOT: formatEtherSafe(costWei),
          approvalRequired: false
        };
        billed = true;
      } else {
        await recordInvocation({ i, catalog, consumer, input, status: 'failed', error: 'Prepaid credits required before invocation.', durationMs: Date.now() - startedAt, costWei: '0' });
        await recomputeListingPerformance(catalog.id, organizationId);
        throw httpError(402, 'Payment required — purchase prepaid credits for this agent before invoking it.', 'PAYMENT_REQUIRED');
      }
    }
  }

  await recordInvocation({
    i, catalog, consumer, input, status: 'success',
    error: null, durationMs: Date.now() - startedAt,
    costWei: session ? toWei(session.estimatedCostBOT || '0').toString() : '0',
    sessionId: session?.sessionId || null
  });
  await recomputeListingPerformance(catalog?.id, organizationId);
  await supabase.from('agent_installations').update({ usage_count: (i.usage_count || 0) + 1, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('installation_id', installationId);

  audit({ developerId, organizationId, actorType: 'system', action: 'agent.invoked', resourceType: 'agent_installations', resourceId: installationId, metadata: { agentId: i.agent_code, session: session?.sessionId || null, billed } });
  const payload = { installationId, agentId: i.agent_code, billing: billed ? 'session' : 'none', sessionId: session?.sessionId || null, input };
  dispatchEvent('agent.invoked', payload, { developerId, organizationId });

  const estBOT = session?.estimatedCostBOT || '0.0';
  return {
    invocationId: session?.sessionId || i.installation_id,
    status: 'success',
    billed,
    session,
    estimatedCostBOT: estBOT,
    consumerAgentId: consumer?.agent_id || null,
    message: session
      ? 'Invocation routed through a paid prepaid purchase session.'
      : 'Invocation recorded (no backend billing service configured on this agent).'
  };
};

const getServiceByIdSafe = async (id) => {
  try {
    const { data } = await supabase.from('ai_services').select('*').eq('id', id).maybeSingle();
    return data;
  } catch {
    return null;
  }
};

const recordInvocation = async ({ i, catalog, consumer, input, status, error, durationMs, costWei, sessionId }) => {
  const { error: err } = await supabase.from('agent_invocation_logs').insert({
    log_id: genId('aiv'),
    installation_id: i.id,
    listing_id: i.listing_id,
    organization_id: i.organization_id,
    developer_id: i.developer_id,
    consumer_agent_code: consumer?.agent_id || null,
    input: typeof input === 'string' ? input : JSON.stringify(input || {}),
    output: null,
    status,
    error: error || null,
    duration_ms: durationMs || null,
    cost_wei: costWei || '0',
    session_id: sessionId || null,
    source: 'installed-agent'
  });
  if (err) throw httpError(500, `Invocation log failed: ${err.message}`);
};

const recomputeListingPerformance = async (listingId, organizationId) => {
  if (!listingId) return;
  const [{ count: total }, { count: ok }] = await Promise.all([
    supabase.from('agent_invocation_logs').select('id', { count: 'exact', head: true }).eq('listing_id', listingId),
    supabase.from('agent_invocation_logs').select('id', { count: 'exact', head: true }).eq('listing_id', listingId).eq('status', 'success')
  ]);
  const successRate = total > 0 ? Math.round((ok / total) * 10000) / 100 : 0;
  const { data: avg } = await supabase.from('agent_invocation_logs').select('duration_ms').eq('listing_id', listingId).not('duration_ms', 'is', null);
  const avgMs = avg && avg.length ? Math.round(avg.reduce((a, b) => a + b.duration_ms, 0) / avg.length) : null;
  await supabase.from('agent_catalog').update({ success_rate: successRate, avg_response_ms: avgMs, updated_at: new Date().toISOString() }).eq('id', listingId);
};

// ============================================================================
// Phase 8 — Reviews & ratings
// ============================================================================

export const submitReview = async ({ developerId, organizationId, installationId, rating, title, review }) => {
  const r = Math.floor(Number(rating));
  if (!(r >= 1 && r <= 5)) throw httpError(400, 'Rating must be between 1 and 5.', 'VALIDATION');
  const { data: i, error } = await supabase.from('agent_installations').select('*').eq('installation_id', installationId).eq('organization_id', organizationId).maybeSingle();
  if (error) throw httpError(500, `Installation fetch failed: ${error.message}`);
  if (!i) throw httpError(404, 'Installation not found.', 'NOT_FOUND');

  const existing = await supabase.from('agent_reviews').select('*').eq('installation_id', i.id).maybeSingle();
  let row;
  if (existing.data) {
    const { data, error: uErr } = await supabase.from('agent_reviews').update({
      rating: r, title: title ?? existing.data.title, review: review ?? existing.data.review, status: 'visible', updated_at: new Date().toISOString()
    }).eq('id', existing.data.id).select().single();
    if (uErr) throw httpError(500, `Review update failed: ${uErr.message}`);
    row = data;
  } else {
    const { data, error: cErr } = await supabase.from('agent_reviews').insert({
      review_id: genId('arv'), listing_id: i.listing_id, installation_id: i.id,
      organization_id: organizationId, developer_id: developerId, rating: r, title: title || null, review: review || null, status: 'visible'
    }).select().single();
    if (cErr) throw httpError(500, `Review save failed: ${cErr.message}`);
    row = data;
  }

  await recomputeListingRatings(i.listing_id);
  const listing = await getByPublicId('agent_catalog', 'id', i.listing_id);
  audit({ developerId, organizationId, actorType: 'system', action: 'agent.review.submitted', resourceType: 'agent_reviews', resourceId: row.review_id, metadata: { listing: i.listing_id, rating: r } });
  dispatchEvent('agent.review.submitted', { listingId: listing.listing_id, rating: r }, { developerId, organizationId });
  return toPublicReview(row);
};

const recomputeListingRatings = async (listingId) => {
  const [{ data: reviews, count }, { count: total }] = await Promise.all([
    supabase.from('agent_reviews').select('rating', { count: 'exact' }).eq('listing_id', listingId).eq('status', 'visible'),
    supabase.from('agent_reviews').select('id', { count: 'exact', head: true }).eq('listing_id', listingId).eq('status', 'visible')
  ]);
  const n = total || 0;
  const avg = n ? Math.round((reviews.reduce((a, b) => a + b.rating, 0) / n) * 100) / 100 : 0;
  await supabase.from('agent_catalog').update({ rating_avg: avg, rating_count: n, review_count: n, updated_at: new Date().toISOString() }).eq('id', listingId);
};

export const listReviews = async ({ listingId, page = 1, perPage = 20 }) => {
  const listing = await requireListing(listingId);
  const per = Math.min(Number(perPage) || 20, 100);
  const from = (Math.max(1, Number(page) || 1) - 1) * per;
  const { data, count, error } = await supabase.from('agent_reviews')
    .select('*', { count: 'exact' })
    .eq('listing_id', listing.id)
    .eq('status', 'visible')
    .order('created_at', { ascending: false })
    .range(from, from + per - 1);
  if (error) throw httpError(500, `Reviews fetch failed: ${error.message}`);
  return {
    reviews: (data || []).map(toPublicReview),
    meta: { page: from / per + 1, perPage: per, total: count || 0, totalPages: Math.ceil((count || 0) / per), hasMore: (count || 0) > from + per }
  };
};

// ============================================================================
// Phase 6 — Provider store dashboard
// ============================================================================

export const providerStoreDashboard = async ({ developerId, organizationId }) => {
  const { data: listings } = await supabase.from('agent_catalog').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
  const listingIds = (listings || []).map((l) => l.id);
  const { data: agentUuids } = await supabase.from('ai_agents').select('id').eq('organization_id', organizationId);
  const agentIds = (agentUuids || []).map((a) => a.id);

  const [installsRes, installs30Res, subsRes, subs30Res, invLogsRes, reviewsRes] = await Promise.all([
    listingIds.length ? supabase.from('agent_installations').select('*').in('listing_id', listingIds) : Promise.resolve({ data: [] }),
    listingIds.length ? supabase.from('agent_installations').select('id', { count: 'exact', head: true }).in('listing_id', listingIds).gte('installed_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString()) : Promise.resolve({ data: [], count: 0 }),
    listingIds.length ? supabase.from('agent_subscriptions').select('*').in('listing_id', listingIds) : Promise.resolve({ data: [] }),
    listingIds.length ? supabase.from('agent_subscriptions').select('id', { count: 'exact', head: true }).in('listing_id', listingIds).eq('status', 'cancelled').gte('cancelled_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString()) : Promise.resolve({ data: [], count: 0 }),
    listingIds.length ? supabase.from('agent_invocation_logs').select('*').in('listing_id', listingIds).gte('created_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString()) : Promise.resolve({ data: [] }),
    listingIds.length ? supabase.from('agent_reviews').select('*').in('listing_id', listingIds).eq('status', 'visible').order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] })
  ]);

  const installs = installsRes.data || [];
  const subs = subsRes.data || [];
  const invLogs = invLogsRes.data || [];

  const activeInstalls = (installs || []).filter((x) => x.status === 'active');
  const activeSubs = (subs || []).filter((s) => s.status === 'active');
  const mrrWei = activeSubs.reduce((a, s) => a + (s.billing_cycle === 'monthly' && s.pricing_model !== 'free' ? toWei(s.price_bot) : 0n), 0n);
  const monthlyInvoices = agentIds.length
    ? (await supabase.from('service_invoices').select('amount_wei,status,created_at').in('provider_agent_id', agentIds).gte('created_at', new Date(Date.now() - 30 * 86400 * 1000).toISOString())).data || []
    : [];
  const revenueWei30 = monthlyInvoices.filter((x) => x.status === 'paid').reduce((a, x) => a + BigInt(x.amount_wei || '0'), 0n);

  const perListing = (listings || []).map((l) => {
    const its = (installs || []).filter((x) => x.listing_id === l.id);
    const itsActive = its.filter((x) => x.status === 'active');
    const itsSubs = activeSubs.filter((s) => s.listing_id === l.id);
    const itsLogs = invLogs.filter((v) => v.listing_id === l.id);
    const apiCalls = itsLogs.length;
    const failed = itsLogs.filter((v) => v.status === 'failed').length;
    return {
      listingId: l.listing_id,
      title: l.title,
      agentId: l.agent_code,
      status: l.status,
      version: l.version,
      category: l.category,
      pricingModel: l.pricing_model,
      priceBOT: l.price_bot,
      installs: itsActive.length,
      totalInstalls: its.length,
      activeSubscriptions: itsSubs.length,
      apiCalls,
      failedRequests: failed,
      successRate: Number(l.success_rate || 0),
      ratingAvg: Number(l.rating_avg || 0),
      ratingCount: l.rating_count,
      mrrBOT: formatEtherSafe(itsSubs.reduce((a, s) => a + (s.billing_cycle === 'monthly' ? toWei(s.price_bot) : 0n), 0n)),
      updatedAt: l.updated_at
    };
  });

  const installTrend = {};
  const day = 24 * 60 * 60 * 1000;
  for (let d = 13; d >= 0; d -= 1) {
    const k = new Date(Date.now() - d * day).toISOString().slice(0, 10);
    installTrend[k] = 0;
  }
  (installs || []).forEach((x) => {
    const k = new Date(x.installed_at).toISOString().slice(0, 10);
    if (installTrend[k] !== undefined) installTrend[k] += 1;
  });

  const reviews = (reviewsRes.data || []).map(toPublicReview);
  return {
    metrics: {
      totalInstalls: (installs30Res?.count ?? activeInstalls.length),
      activeInstalls: activeInstalls.length,
      activeSubscriptions: activeSubs.length,
      mrrBOT: formatEtherSafe(mrrWei),
      revenue30dBOT: formatEtherSafe(revenueWei30),
      churn30d: subs30Res?.count ?? 0,
      apiCalls30d: (invLogs || []).length,
      failedRequests30d: (invLogs || []).filter((v) => v.status === 'failed').length,
      avgSuccessRate: perListing.length ? Math.round(perListing.reduce((a, p) => a + p.successRate, 0) / perListing.length * 100) / 100 : 0,
      avgRating: perListing.length ? Math.round(perListing.reduce((a, p) => a + p.ratingAvg, 0) / perListing.length * 100) / 100 : 0,
      reviewCountHealed: reviews.length
    },
    listings: perListing,
    reviews,
    installTrend: Object.entries(installTrend).map(([date, count]) => ({ date, count }))
  };
};

// ============================================================================
// Phase 7 — Consumer org dashboard
// ============================================================================

export const consumerAgentDashboard = async ({ developerId, organizationId }) => {
  const monthlySpendWei = await getMonthlySpendWei({ organizationId, developerId });

  // ── Installations — Supabase first, direct DB fallback ──
  let { data: installs } = await supabase.from('agent_installations').select('*').eq('organization_id', organizationId).in('status', ['active', 'pending', 'suspended']).order('last_used_at', { ascending: false, nulls: 'last' });
  if (!installs || installs.length === 0) {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM agent_installations WHERE organization_id = $1 AND status IN ('active','pending','suspended') ORDER BY last_used_at DESC NULLS LAST`,
        [organizationId]
      );
      if (rows && rows.length > 0) installs = rows;
    } catch (_) { /* fallback best-effort */ }
  }

  const listingIds = [...new Set((installs || []).map((x) => x.listing_id))];

  // ── Subscriptions — Supabase first, direct DB fallback ──
  let subsByListing = {};
  if (listingIds.length) {
    let { data: subs } = await supabase.from('agent_subscriptions').select('*').in('listing_id', listingIds).eq('organization_id', organizationId).eq('status', 'active');
    if (!subs || subs.length === 0) {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT * FROM agent_subscriptions WHERE listing_id = ANY($1) AND organization_id = $2 AND status = 'active'`,
          [listingIds, organizationId]
        );
        if (rows && rows.length > 0) subs = rows;
      } catch (_) {}
    }
    subsByListing = Object.fromEntries((subs || []).map((s) => [s.listing_id, s]));
  }

  // ── Catalog versions — Supabase first, direct DB fallback ──
  let verByListing = {};
  if (listingIds.length) {
    let { data: cats } = await supabase.from('agent_catalog').select('id,version').in('id', listingIds);
    if (!cats || cats.length === 0) {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id, version FROM agent_catalog WHERE id = ANY($1)`,
          [listingIds]
        );
        if (rows && rows.length > 0) cats = rows;
      } catch (_) {}
    }
    verByListing = Object.fromEntries((cats || []).map((c) => [c.id, c.version]));
  }

  // ── Invocations count — Supabase first, direct DB fallback ──
  let invocations30 = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  try {
    const { count } = await supabase.from('agent_invocation_logs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gte('created_at', thirtyDaysAgo);
    invocations30 = count || 0;
  } catch (_) {}
  if (!invocations30) {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM agent_invocation_logs WHERE organization_id = $1 AND created_at >= $2`,
        [organizationId, thirtyDaysAgo]
      );
      invocations30 = rows[0]?.cnt || 0;
    } catch (_) {}
  }

  const hydrated = await hydrateActingAgents((installs || []).filter((i) => ['active', 'pending', 'suspended'].includes(i.status)));
  const installedAgents = hydrated.map((i) => ({
    ...toPublicInstallation(i),
    subscription: toPublicSubscription(subsByListing[i.listing_id] || null),
    updatesAvailable: !!verByListing[i.listing_id] && verByListing[i.listing_id] !== i.agent_version,
    latestVersion: verByListing[i.listing_id] || i.agent_version
  }));

  const installedListingIds = new Set(listingIds);
  const browse = await browseListings({ organizationId, sort: 'ranking', perPage: 100 });
  const recommended = browse.listings.filter((l) => !installedListingIds.has(l.listingId)).slice(0, 5);

  return {
    monthlySpendBOT: formatEtherSafe(monthlySpendWei),
    invocations30,
    installedAgents,
    activeSubscriptions: installedAgents.filter((i) => i.subscription).length,
    recentlyUsed: installedAgents.filter((i) => i.lastUsedAt).sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt)).slice(0, 5),
    updatesAvailable: installedAgents.filter((i) => i.updatesAvailable),
    recommended
  };
};
