/**
 * BusinessNetworkService — GlobalPay V3 AI Business Network
 *
 * Implements Phases 1–10 on top of the existing production infrastructure.
 * NEVER re-implements: payments, wallets, billing, marketplace, invoices,
 * sessions, RBAC, organizations, audit logs, webhooks.
 *
 * Imports from:
 *   organizationService   — org resolution, audit helper
 *   commerceService       — createSession, getMonthlySpendWei, getPolicyByOrg
 *   marketplaceService    — service lookups
 *   agentMarketplaceService — agent catalog
 *   auditService          — audit trail
 *   webhookService        — webhook dispatch
 *
 * Phases:
 *   1. Extended company directory + public profiles
 *   2. Business relationships (auto-detected from commerce)
 *   3. Partnerships (commerce-proven recommendations)
 *   4. Collaboration projects
 *   5. Workflow marketplace (extends existing workflow_templates)
 *   6. Trust Score (objective, commerce-derived)
 *   7. Business insights dashboard
 *   8. Network dashboard (global)
 *   9. Activity feed (business events only)
 *  10. Enterprise workspaces
 */

import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { listViaDb } from '../utils/db.js';
import { audit } from './auditService.js';
import { dispatchEvent } from './webhookService.js';
import { createSession, getPolicyByOrg } from './commerceService.js';

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, code });

const genId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

// Canonical pair ordering — always smaller UUID first so UNIQUE(org_a, org_b) works.
const orgPair = (a, b) => (a < b ? [a, b] : [b, a]);

// ============================================================================
// PHASE 1 — Extended Company Directory
// ============================================================================

const PROFILE_FIELD_MAP = {
  coverImageUrl: 'cover_image_url',
  headquarters: 'headquarters',
  companySize: 'company_size',
  foundedYear: 'founded_year',
  aiCapabilities: 'ai_capabilities',
  fieldVisibility: 'field_visibility',
  // existing fields already handled by networkService:
  name: 'name',
  slug: 'slug',
  description: 'description',
  logoUrl: 'logo_url',
  industry: 'industry',
  country: 'country',
  website: 'website',
  certifications: 'certifications',
  supportedRegions: 'supported_regions',
  verificationLevel: 'verification_level',
  isPublic: 'is_public',
};

const applyVisibility = (profile, forPublic) => {
  if (!forPublic) return profile;
  const vis = profile.field_visibility || {};
  const out = { ...profile };
  for (const [field, setting] of Object.entries(vis)) {
    if (setting === 'private') delete out[field];
  }
  return out;
};

const toPublicDirectoryEntry = (p, extra = {}) => {
  const visible = applyVisibility(p, true);
  return {
    organizationId: p.organization_id,
    name: visible.name,
    slug: visible.slug,
    description: visible.description || null,
    logoUrl: visible.logo_url || null,
    coverImageUrl: visible.cover_image_url || null,
    headquarters: visible.headquarters || null,
    companySize: visible.company_size || null,
    foundedYear: visible.founded_year || null,
    country: visible.country || null,
    industry: visible.industry || null,
    website: visible.website || null,
    certifications: visible.certifications || [],
    aiCapabilities: visible.ai_capabilities || [],
    supportedRegions: visible.supported_regions || [],
    verificationLevel: p.verification_level,
    verifiedAt: p.verified_at,
    trustScoreV3: p.trust_score_v3,
    trustScoreBreakdown: p.trust_score_breakdown || {},
    ...extra,
  };
};

export const listDirectory = async ({
  country,
  industry,
  verificationLevel,
  minTrustScore,
  aiCapability,
  marketplaceCategory,
  search,
  page = 1,
  perPage = 30,
} = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(perPage) || 30));
  const from = (pageNum - 1) * size;

  let q = supabase
    .from('organization_profiles')
    .select('*', { count: 'exact' })
    .eq('is_public', true)
    .order('trust_score_v3', { ascending: false, nullsFirst: false })
    .range(from, from + size - 1);

  if (country) q = q.eq('country', country);
  if (industry) q = q.eq('industry', industry);
  if (verificationLevel) q = q.eq('verification_level', verificationLevel);
  if (minTrustScore) q = q.gte('trust_score_v3', Number(minTrustScore));
  if (aiCapability) q = q.contains('ai_capabilities', [aiCapability]);
  if (search) q = q.ilike('name', `%${search}%`);

  const { data, error, count } = await q;
  if (error) throw httpError(500, `Directory fetch failed: ${error.message}`);

  let profiles = (data || []).map((p) => toPublicDirectoryEntry(p));

  // Filter by marketplace category if requested (requires agent catalog join)
  if (marketplaceCategory && profiles.length) {
    const orgIds = profiles.map((p) => p.organizationId);
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('organization_id')
      .in('organization_id', orgIds);
    const { data: services } = await supabase
      .from('ai_services')
      .select('organization_id, category')
      .in('organization_id', orgIds)
      .eq('category', marketplaceCategory)
      .eq('is_active', true);
    const qualifyingOrgs = new Set((services || []).map((s) => s.organization_id));
    profiles = profiles.filter((p) => qualifyingOrgs.has(p.organizationId));
  }

  return {
    profiles,
    pagination: { page: pageNum, perPage: size, total: count || 0, pages: Math.ceil((count || 0) / size) },
  };
};

export const getPublicCompanyProfile = async (slug) => {
  const { data: profile, error } = await supabase
    .from('organization_profiles')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();
  if (error) throw httpError(500, error.message);
  if (!profile) throw httpError(404, 'Company profile not found.', 'NOT_FOUND');

  const orgId = profile.organization_id;

  // Public AI Agents
  const { data: agents } = await supabase
    .from('ai_agents')
    .select('agent_id, agent_name, status, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(20);

  // Public AI Services
  const { data: services } = await supabase
    .from('ai_services')
    .select('service_code, name, category, description, unit_price_bot, is_active')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(20);

  // Public Partnerships
  const [orgA, orgB] = orgPair(orgId, orgId); // just to get canonical form
  const { data: partnerships } = await supabase
    .from('org_partnerships')
    .select('*, org_a, org_b, type, accepted_at')
    .or(`org_a.eq.${orgId},org_b.eq.${orgId}`)
    .eq('status', 'accepted')
    .limit(10);

  return {
    ...toPublicDirectoryEntry(profile),
    publicAgents: (agents || []).map((a) => ({ agentId: a.agent_id, name: a.agent_name, status: a.status })),
    publicServices: (services || []).map((s) => ({
      serviceCode: s.service_code,
      name: s.name,
      category: s.category,
      description: s.description,
      unitPriceBOT: s.unit_price_bot,
    })),
    acceptedPartnerships: (partnerships || []).length,
  };
};

export const updateExtendedProfileFields = async ({ orgId, actorId, developerId, patch }) => {
  const updates = {};
  for (const [key, val] of Object.entries(patch)) {
    const col = PROFILE_FIELD_MAP[key];
    if (col) updates[col] = val;
  }
  if (!Object.keys(updates).length) return { updated: false };

  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('organization_profiles')
    .update(updates)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error) throw httpError(500, `Profile update failed: ${error.message}`);

  void audit({
    developerId,
    organizationId: orgId,
    actorType: 'developer',
    actorId,
    action: 'profile.extended_fields_updated',
    resourceType: 'organization_profile',
    resourceId: data.id,
    metadata: { fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
  });

  return { updated: true, profile: toPublicDirectoryEntry(data) };
};

// ============================================================================
// PHASE 2 — Business Relationships (auto-detected from commerce)
// ============================================================================

/**
 * Refresh relationships for an org pair from actual commerce data.
 * Called by the trust-score worker and by commerce event hooks.
 */
export const refreshRelationship = async (orgIdA, orgIdB) => {
  if (!orgIdA || !orgIdB || orgIdA === orgIdB) return null;
  const [a, b] = orgPair(orgIdA, orgIdB);

  // Shared sessions: buyer = a, provider org has agent with organization_id = b (or vice versa)
  // We look at the organization_id on sessions + joining ai_agents
  const { data: sessionRows } = await supabase
    .from('commerce_sessions')
    .select('id, total_cost_wei, created_at')
    .eq('status', 'completed')
    .or(
      `and(buyer_organization_id.eq.${a},provider_organization_id.eq.${b}),` +
      `and(buyer_organization_id.eq.${b},provider_organization_id.eq.${a})`
    )
    .limit(500);

  const sessions = sessionRows || [];

  // Shared invoices
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, amount_bot, created_at')
    .eq('status', 'paid')
    .or(
      `and(buyer_organization_id.eq.${a},provider_organization_id.eq.${b}),` +
      `and(buyer_organization_id.eq.${b},provider_organization_id.eq.${a})`
    )
    .limit(500);
  const invoices = invoiceRows || [];

  // Shared workflow runs: both orgs appear in collaboration_project_participants
  const { data: projectRows } = await supabase
    .from('collaboration_project_participants')
    .select('project_id')
    .in('participant_org_id', [a, b]);

  const projectIds = [...new Set((projectRows || []).map((r) => r.project_id))];
  // Count projects where both orgs appear
  const sharedProjects = projectIds.length;

  // Shared workflow runs (workflow_runs with consumer from one org, steps involving other org's services)
  const { count: sharedWorkflows } = await supabase
    .from('workflow_runs')
    .select('*', { count: 'exact', head: true })
    .in('organization_id', [a, b]);

  const totalVolumeWei = [
    ...sessions.map((s) => BigInt(s.total_cost_wei || '0')),
    ...invoices.map((i) => BigInt(i.amount_bot || '0')),
  ].reduce((acc, v) => acc + v, 0n);

  const allDates = [
    ...sessions.map((s) => s.created_at),
    ...invoices.map((i) => i.created_at),
  ].filter(Boolean).sort();

  // Compute strength 0-100
  const sessionScore = Math.min(40, sessions.length * 4);
  const invoiceScore = Math.min(30, invoices.length * 3);
  const projectScore = Math.min(20, sharedProjects * 5);
  const workflowScore = Math.min(10, (sharedWorkflows || 0) * 2);
  const strength = sessionScore + invoiceScore + projectScore + workflowScore;

  const payload = {
    org_a: a,
    org_b: b,
    relationship_strength: strength,
    shared_sessions: sessions.length,
    shared_invoices: invoices.length,
    shared_workflows: sharedWorkflows || 0,
    shared_projects: sharedProjects,
    total_volume_wei: totalVolumeWei.toString(),
    first_interaction_at: allDates[0] || null,
    last_interaction_at: allDates[allDates.length - 1] || null,
    computed_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('business_relationships')
    .upsert(payload, { onConflict: 'org_a,org_b' })
    .select()
    .single();
  if (error) throw httpError(500, `Relationship refresh failed: ${error.message}`);

  // Check if partnership should be recommended (threshold: strength >= 40)
  if (strength >= 40) {
    await maybeRecommendPartnership({ orgA: a, orgB: b, basis: payload });
  }

  return data;
};

export const listRelationships = async ({ orgId, minStrength = 0, page = 1, perPage = 20 }) => {
  const size = Math.min(50, Number(perPage) || 20);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;

  const { data, error, count } = await supabase
    .from('business_relationships')
    .select('*', { count: 'exact' })
    .or(`org_a.eq.${orgId},org_b.eq.${orgId}`)
    .gte('relationship_strength', Number(minStrength))
    .order('relationship_strength', { ascending: false })
    .range(from, from + size - 1);
  if (error) throw httpError(500, error.message);

  // Enrich with partner org names
  const partnerIds = (data || []).map((r) => (r.org_a === orgId ? r.org_b : r.org_a));
  const { data: orgs } = await supabase
    .from('organization_profiles')
    .select('organization_id, name, slug, logo_url, verification_level, trust_score_v3')
    .in('organization_id', partnerIds);
  const orgMap = Object.fromEntries((orgs || []).map((o) => [o.organization_id, o]));

  const relationships = (data || []).map((r) => {
    const partnerId = r.org_a === orgId ? r.org_b : r.org_a;
    const partner = orgMap[partnerId] || {};
    return {
      partnerOrgId: partnerId,
      partnerName: partner.name || null,
      partnerSlug: partner.slug || null,
      partnerLogoUrl: partner.logo_url || null,
      partnerVerificationLevel: partner.verification_level || null,
      partnerTrustScore: partner.trust_score_v3 || null,
      strength: Number(r.relationship_strength),
      sharedSessions: r.shared_sessions,
      sharedInvoices: r.shared_invoices,
      sharedWorkflows: r.shared_workflows,
      sharedProjects: r.shared_projects,
      totalVolumeWei: r.total_volume_wei,
      firstInteractionAt: r.first_interaction_at,
      lastInteractionAt: r.last_interaction_at,
      computedAt: r.computed_at,
    };
  });

  return { relationships, total: count || 0, page: Number(page), perPage: size };
};

// ============================================================================
// PHASE 3 — Partnerships (Commerce-proven recommendations)
// ============================================================================

const PARTNERSHIP_THRESHOLD = 40; // relationship_strength required to recommend

const maybeRecommendPartnership = async ({ orgA, orgB, basis }) => {
  try {
    const [a, b] = orgPair(orgA, orgB);
    // Check if partnership already exists for any type
    const { data: existing } = await supabase
      .from('org_partnerships')
      .select('id, status')
      .eq('org_a', a)
      .eq('org_b', b)
      .limit(1)
      .maybeSingle();

    if (existing) return; // already has a partnership record

    // Infer type from collaboration basis
    const type = basis.shared_projects > 0 ? 'research' :
                 basis.shared_workflows > 0 ? 'integration' :
                 basis.shared_sessions > 5 ? 'marketplace' : 'technology';

    const { error } = await supabase.from('org_partnerships').insert({
      partnership_id: genId('ptn'),
      org_a: a,
      org_b: b,
      type,
      status: 'recommended',
      recommended_at: new Date().toISOString(),
      collaboration_basis: {
        sharedSessions: basis.shared_sessions,
        sharedInvoices: basis.shared_invoices,
        sharedWorkflows: basis.shared_workflows,
        sharedProjects: basis.shared_projects,
        totalVolumeWei: basis.total_volume_wei,
        strengthScore: basis.relationship_strength,
      },
    });
    if (!error) {
      // Post activity event for both orgs
      await postActivityEvent({ orgId: a, type: 'partnership_recommended', title: 'Partnership Recommended', metadata: { partnerOrgId: b } });
      await postActivityEvent({ orgId: b, type: 'partnership_recommended', title: 'Partnership Recommended', metadata: { partnerOrgId: a } });
    }
  } catch {
    // Non-fatal: partnership recommendation is best-effort
  }
};

export const listPartnerships = async ({ orgId, status }) => {
  let q = supabase
    .from('org_partnerships')
    .select('*')
    .or(`org_a.eq.${orgId},org_b.eq.${orgId}`)
    .order('recommended_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw httpError(500, error.message);

  // Enrich with partner profile names
  const partnerIds = (data || []).map((p) => (p.org_a === orgId ? p.org_b : p.org_a));
  const { data: profiles } = await supabase
    .from('organization_profiles')
    .select('organization_id, name, slug, logo_url, verification_level')
    .in('organization_id', partnerIds);
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.organization_id, p]));

  return (data || []).map((p) => {
    const partnerId = p.org_a === orgId ? p.org_b : p.org_a;
    const partner = profileMap[partnerId] || {};
    return {
      partnershipId: p.partnership_id,
      partnerOrgId: partnerId,
      partnerName: partner.name || null,
      partnerSlug: partner.slug || null,
      partnerLogoUrl: partner.logo_url || null,
      type: p.type,
      status: p.status,
      collaborationBasis: p.collaboration_basis || {},
      recommendedAt: p.recommended_at,
      proposedAt: p.proposed_at,
      acceptedAt: p.accepted_at,
      expiresAt: p.expires_at,
    };
  });
};

export const respondToPartnership = async ({ partnershipId, orgId, actorId, developerId, action }) => {
  const { data: partnership, error } = await supabase
    .from('org_partnerships')
    .select('*')
    .eq('partnership_id', partnershipId)
    .maybeSingle();
  if (error || !partnership) throw httpError(404, 'Partnership not found.', 'NOT_FOUND');

  const isParty = partnership.org_a === orgId || partnership.org_b === orgId;
  if (!isParty) throw httpError(403, 'You are not a party to this partnership.', 'FORBIDDEN');

  // Rejected/ignored partnerships are silent — no score or reputation impact
  const validActions = ['accept', 'reject', 'propose'];
  if (!validActions.includes(action)) throw httpError(400, 'Invalid action.', 'VALIDATION');

  let newStatus = partnership.status;
  const now = new Date().toISOString();
  const updates = { updated_at: now };

  if (action === 'reject') {
    // Silent rejection — status moves to rejected, no audit broadcast, no reputation change
    updates.status = 'rejected';
    newStatus = 'rejected';
  } else if (action === 'accept') {
    if (partnership.status === 'recommended') {
      // First party accepts recommendation → pending (awaiting other party)
      updates.status = 'pending';
      updates.proposed_by_org = orgId;
      updates.proposed_at = now;
      newStatus = 'pending';
    } else if (partnership.status === 'pending' && partnership.proposed_by_org !== orgId) {
      // Second party accepts → fully accepted
      updates.status = 'accepted';
      updates.accepted_at = now;
      newStatus = 'accepted';
    } else {
      throw httpError(409, 'Partnership is not in a state that can be accepted.', 'INVALID_STATE');
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from('org_partnerships')
    .update(updates)
    .eq('id', partnership.id)
    .select()
    .single();
  if (updErr) throw httpError(500, updErr.message);

  if (newStatus === 'accepted') {
    const partnerId = partnership.org_a === orgId ? partnership.org_b : partnership.org_a;
    await postActivityEvent({ orgId, type: 'partnership_formed', title: 'Partnership Accepted', metadata: { partnerId, type: partnership.type } });
    await postActivityEvent({ orgId: partnerId, type: 'partnership_formed', title: 'Partnership Accepted', metadata: { partnerId: orgId, type: partnership.type } });
    dispatchEvent('partnership.accepted', { orgA: partnership.org_a, orgB: partnership.org_b, type: partnership.type }, { developerId, organizationId: orgId });
  }

  if (action !== 'reject') {
    void audit({
      developerId,
      organizationId: orgId,
      actorType: 'developer',
      actorId,
      action: `partnership.${action}`,
      resourceType: 'org_partnership',
      resourceId: partnership.id,
      metadata: { partnershipId, newStatus },
    });
  }

  return { partnershipId, status: newStatus };
};

// ============================================================================
// PHASE 4 — Collaboration Projects
// ============================================================================

export const createProject = async ({ orgId, actorId, developerId, name, description, isPublic = false }) => {
  if (!name?.trim()) throw httpError(400, 'Project name is required.', 'VALIDATION');

  const { data, error } = await supabase
    .from('collaboration_projects')
    .insert({
      project_id: genId('cpj'),
      organization_id: orgId,
      name: name.trim(),
      description: description || null,
      is_public: !!isPublic,
      created_by: developerId,
    })
    .select()
    .single();
  if (error) throw httpError(500, `Project creation failed: ${error.message}`);

  // Owner org is also a participant (owner role)
  await supabase.from('collaboration_project_participants').insert({
    project_id: data.id,
    participant_org_id: orgId,
    role: 'owner',
    invited_by: developerId,
  });

  void audit({ developerId, organizationId: orgId, actorType: 'developer', actorId, action: 'project.created', resourceType: 'collaboration_project', resourceId: data.id, metadata: { name } });
  await postActivityEvent({ orgId, type: 'project_started', title: `New project: ${name}`, metadata: { projectId: data.project_id } });

  return toPublicProject(data);
};

export const addProjectParticipant = async ({ projectId, orgId, actorId, developerId, targetOrgId, role = 'contributor' }) => {
  const project = await getProjectRow(projectId, orgId);

  // Check if target org already participates
  const { data: existing } = await supabase
    .from('collaboration_project_participants')
    .select('id')
    .eq('project_id', project.id)
    .eq('participant_org_id', targetOrgId)
    .maybeSingle();
  if (existing) throw httpError(409, 'Organization is already a participant.', 'ALREADY_PARTICIPANT');

  const { data, error } = await supabase
    .from('collaboration_project_participants')
    .insert({ project_id: project.id, participant_org_id: targetOrgId, role, invited_by: developerId })
    .select()
    .single();
  if (error) throw httpError(500, error.message);

  void audit({ developerId, organizationId: orgId, actorType: 'developer', actorId, action: 'project.participant_added', resourceType: 'collaboration_project', resourceId: project.id, metadata: { targetOrgId, role } });

  return { added: true, participantOrgId: targetOrgId, role };
};

export const listProjects = async ({ orgId, page = 1, perPage = 20 }) => {
  const size = Math.min(50, Number(perPage) || 20);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;

  // Get projects where this org is either owner or participant
  const { data: participations } = await supabase
    .from('collaboration_project_participants')
    .select('project_id')
    .eq('participant_org_id', orgId);

  const projectIds = (participations || []).map((p) => p.project_id);

  // Owner org's own projects are always included. When the org has no
  // participations, omit the id.in(...) clause entirely — passing a literal
  // `null` to a uuid IN-list makes PostgREST fail with
  // "invalid input syntax for type uuid: 'null'".
  let q = supabase.from('collaboration_projects').select('*', { count: 'exact' });
  if (projectIds.length) {
    q = q.or(`organization_id.eq.${orgId},id.in.(${projectIds.join(',')})`);
  } else {
    q = q.eq('organization_id', orgId);
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, from + size - 1);
  if (error) throw httpError(500, error.message);

  return {
    projects: (data || []).map(toPublicProject),
    total: count || 0,
    page: Number(page),
    perPage: size,
  };
};

export const getProjectDetail = async ({ projectId, orgId }) => {
  const project = await getProjectRow(projectId, orgId);

  // Participants
  const { data: participants } = await supabase
    .from('collaboration_project_participants')
    .select('*')
    .eq('project_id', project.id);

  const orgIds = (participants || []).map((p) => p.participant_org_id);

  // Enrich with org profiles
  const { data: profiles } = orgIds.length
    ? await supabase.from('organization_profiles').select('organization_id, name, slug, logo_url, trust_score_v3').in('organization_id', orgIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.organization_id, p]));

  // Shared activity feed
  const { data: activity } = await supabase
    .from('org_activity_feed')
    .select('*')
    .in('org_id', orgIds)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    ...toPublicProject(project),
    participants: (participants || []).map((p) => ({
      orgId: p.participant_org_id,
      orgName: profileMap[p.participant_org_id]?.name || null,
      orgSlug: profileMap[p.participant_org_id]?.slug || null,
      logoUrl: profileMap[p.participant_org_id]?.logo_url || null,
      trustScore: profileMap[p.participant_org_id]?.trust_score_v3 || null,
      role: p.role,
      joinedAt: p.joined_at,
    })),
    recentActivity: (activity || []).map((a) => ({
      orgId: a.org_id,
      type: a.event_type,
      title: a.title,
      body: a.body,
      createdAt: a.created_at,
    })),
  };
};

const getProjectRow = async (projectId, orgId) => {
  // Accept either UUID or project_id code
  const isCode = typeof projectId === 'string' && projectId.startsWith('cpj_');
  const q = supabase.from('collaboration_projects').select('*');
  const { data, error } = isCode ? await q.eq('project_id', projectId).maybeSingle() : await q.eq('id', projectId).maybeSingle();
  if (error) throw httpError(500, error.message);
  if (!data) throw httpError(404, 'Project not found.', 'NOT_FOUND');

  // Verify caller's org is a participant
  const { data: membership } = await supabase
    .from('collaboration_project_participants')
    .select('id')
    .eq('project_id', data.id)
    .eq('participant_org_id', orgId)
    .maybeSingle();
  if (!membership && data.organization_id !== orgId) {
    throw httpError(403, 'You are not a participant in this project.', 'FORBIDDEN');
  }
  return data;
};

const toPublicProject = (p) => ({
  projectId: p.project_id,
  ownerOrgId: p.organization_id,
  name: p.name,
  description: p.description,
  status: p.status,
  isPublic: p.is_public,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

// ============================================================================
// PHASE 5 — Workflow Marketplace
// ============================================================================

export const publishWorkflow = async ({ orgId, actorId, developerId, templateId, price = '0', isPublic = true, marketplaceCategory }) => {
  // Fetch the existing template (must be org-owned)
  const { data: template, error } = await supabase
    .from('workflow_templates')
    .select('*')
    .eq('template_id', templateId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error || !template) throw httpError(404, 'Workflow template not found.', 'NOT_FOUND');

  const { data: updated, error: updErr } = await supabase
    .from('workflow_templates')
    .update({
      is_published: !!isPublic,
      price_bot: String(price),
      marketplace_category: marketplaceCategory || template.category,
      updated_at: new Date().toISOString(),
    })
    .eq('id', template.id)
    .select()
    .single();
  if (updErr) throw httpError(500, updErr.message);

  void audit({ developerId, organizationId: orgId, actorType: 'developer', actorId, action: 'workflow.published', resourceType: 'workflow_template', resourceId: template.id, metadata: { templateId, price } });
  await postActivityEvent({ orgId, type: 'published_workflow', title: `Published workflow: ${template.name}`, metadata: { templateId } });
  dispatchEvent('workflow.published', { orgId, templateId, name: template.name }, { developerId, organizationId: orgId });

  return toPublicWorkflowListing(updated);
};

export const listWorkflowMarketplace = async ({ category, search, minRating, page = 1, perPage = 20 } = {}) => {
  const size = Math.min(50, Number(perPage) || 20);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;

  let q = supabase
    .from('workflow_templates')
    .select('*', { count: 'exact' })
    .eq('is_published', true)
    .eq('is_active', true)
    .order('install_count', { ascending: false })
    .range(from, from + size - 1);

  if (category) q = q.eq('marketplace_category', category);
  if (minRating) q = q.gte('rating_avg', Number(minRating));
  if (search) q = q.ilike('name', `%${search}%`);

  const { data, error, count } = await q;
  if (error) throw httpError(500, error.message);

  let rows = data || [];
  let total = count || 0;
  if (!rows.length) {
    const fb = await listViaDb('workflow_templates', {
      where: { is_published: true, is_active: true },
      orderBy: 'install_count',
      orderDir: 'desc',
      limit: size,
      offset: from
    });
    if (fb && fb.count > 0) {
      let fbRows = fb.rows;
      const filtered = fbRows.filter((t) =>
        (!minRating || (t.rating_avg ?? 0) >= Number(minRating)) &&
        (!search || !t.name || String(t.name).toLowerCase().includes(String(search).toLowerCase()))
      );
      if (filtered.length) fbRows = filtered;
      rows = fbRows;
      total = fb.count;
    }
  }

  const orgIds = [...new Set(rows.map((t) => t.organization_id))];
  const { data: profiles } = orgIds.length
    ? await supabase.from('organization_profiles').select('organization_id, name, slug, logo_url, verification_level, trust_score_v3').in('organization_id', orgIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.organization_id, p]));

  return {
    workflows: rows.map((t) => ({
      ...toPublicWorkflowListing(t),
      publisher: profileMap[t.organization_id] ? {
        orgId: t.organization_id,
        name: profileMap[t.organization_id].name,
        slug: profileMap[t.organization_id].slug,
        logoUrl: profileMap[t.organization_id].logo_url,
        verificationLevel: profileMap[t.organization_id].verification_level,
        trustScore: profileMap[t.organization_id].trust_score_v3,
      } : null,
    })),
    pagination: { page: Number(page), perPage: size, total },
  };
};

export const installWorkflow = async ({ buyerOrgId, actorId, developerId, templateId, agentId }) => {
  // Fetch published template
  const { data: template, error } = await supabase
    .from('workflow_templates')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_published', true)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !template) throw httpError(404, 'Workflow not found in marketplace.', 'NOT_FOUND');
  if (template.organization_id === buyerOrgId) {
    throw httpError(409, 'You cannot install your own workflow.', 'SELF_INSTALL');
  }

  // Check already installed
  const { data: existing } = await supabase
    .from('workflow_marketplace_installations')
    .select('id, status')
    .eq('template_id', template.id)
    .eq('buyer_org_id', buyerOrgId)
    .maybeSingle();
  if (existing && existing.status === 'active') {
    throw httpError(409, 'Workflow is already installed.', 'ALREADY_INSTALLED');
  }

  // Create purchase session via existing commerce engine if there's a price
  let sessionId = null;
  let invoiceId = null;
  const priceBot = template.price_bot || '0';
  if (BigInt(priceBot === '0' ? '0' : '1') > 0n || priceBot !== '0') {
    try {
      // The commerce session creation is delegated to existing createSession
      // We pass it as a commerce event — non-blocking if price is 0
      if (priceBot !== '0') {
        const policy = await getPolicyByOrg(buyerOrgId).catch(() => null);
        const session = await createSession({
          organizationId: buyerOrgId,
          developerId,
          serviceCode: template.template_id,
          quantity: 1,
          metadata: { workflowInstall: true, templateId: template.template_id },
        }).catch(() => null);
        if (session) {
          sessionId = session.sessionId || session.session_id;
          invoiceId = session.invoiceId || session.invoice_id;
        }
      }
    } catch {
      // Non-fatal: installation proceeds even if session creation fails for free workflows
    }
  }

  const { data: install, error: instErr } = await supabase
    .from('workflow_marketplace_installations')
    .upsert({
      installation_id: existing?.installation_id || genId('wmi'),
      template_id: template.id,
      template_code: template.template_id,
      buyer_org_id: buyerOrgId,
      developer_id: developerId,
      session_id: sessionId,
      invoice_id: invoiceId,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'template_id,buyer_org_id' })
    .select()
    .single();
  if (instErr) throw httpError(500, instErr.message);

  // Increment install count
  await supabase.from('workflow_templates').update({
    install_count: (template.install_count || 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', template.id);

  // Refresh relationship between buyer and publisher org
  void refreshRelationship(buyerOrgId, template.organization_id);

  void audit({ developerId, organizationId: buyerOrgId, actorType: 'developer', actorId, action: 'workflow.installed', resourceType: 'workflow_marketplace_installation', resourceId: install.id, metadata: { templateId, publisherOrgId: template.organization_id } });
  await postActivityEvent({ orgId: buyerOrgId, type: 'workflow_installed', title: `Installed workflow: ${template.name}`, metadata: { templateId } });

  return {
    installationId: install.installation_id,
    templateId: template.template_id,
    name: template.name,
    status: install.status,
    sessionId,
    invoiceId,
    installedAt: install.installed_at,
  };
};

export const listWorkflowInstallations = async ({ orgId }) => {
  const { data, error } = await supabase
    .from('workflow_marketplace_installations')
    .select('*, workflow_templates(name, description, steps, marketplace_category, price_bot, organization_id)')
    .eq('buyer_org_id', orgId)
    .eq('status', 'active')
    .order('installed_at', { ascending: false });
  if (error) throw httpError(500, error.message);

  return (data || []).map((i) => ({
    installationId: i.installation_id,
    templateCode: i.template_code,
    name: i.workflow_templates?.name || null,
    description: i.workflow_templates?.description || null,
    category: i.workflow_templates?.marketplace_category || null,
    steps: i.workflow_templates?.steps || [],
    status: i.status,
    installedAt: i.installed_at,
  }));
};

const toPublicWorkflowListing = (t) => ({
  templateId: t.template_id,
  organizationId: t.organization_id,
  name: t.name,
  description: t.description,
  category: t.marketplace_category || t.category,
  steps: t.steps || [],
  priceBOT: t.price_bot,
  installCount: t.install_count || 0,
  ratingAvg: Number(t.rating_avg || 0),
  ratingCount: t.rating_count || 0,
  isPublished: t.is_published,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

// ============================================================================
// PHASE 6 — Trust Score (Objective, Commerce-derived)
// ============================================================================

export const computeTrustScore = async (orgId) => {
  const breakdown = {};

  // 1. Payment success rate (from invoices)
  const { data: invoiceSummary } = await supabase
    .from('invoices')
    .select('status')
    .eq('organization_id', orgId)
    .in('status', ['paid', 'failed', 'overdue'])
    .limit(500);
  const totalInvoices = (invoiceSummary || []).length;
  const paidInvoices = (invoiceSummary || []).filter((i) => i.status === 'paid').length;
  breakdown.invoiceCompletion = totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : null;

  // 2. Commerce session completion rate
  const { data: sessionSummary } = await supabase
    .from('commerce_sessions')
    .select('status')
    .eq('organization_id', orgId)
    .in('status', ['completed', 'failed', 'cancelled'])
    .limit(500);
  const totalSessions = (sessionSummary || []).length;
  const completedSessions = (sessionSummary || []).filter((s) => s.status === 'completed').length;
  breakdown.sessionCompletion = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : null;

  // 3. Provider reputation (existing trust_score from provider_reputation table)
  const { data: agents } = await supabase.from('ai_agents').select('id').eq('organization_id', orgId);
  const agentIds = (agents || []).map((a) => a.id);
  let providerRepScore = null;
  if (agentIds.length) {
    const { data: reps } = await supabase.from('provider_reputation').select('trust_score').in('provider_agent_id', agentIds);
    const scores = (reps || []).map((r) => Number(r.trust_score)).filter((n) => !isNaN(n));
    if (scores.length) providerRepScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  breakdown.providerReputation = providerRepScore;

  // 4. Agent marketplace ratings
  const { data: listings } = agentIds.length
    ? await supabase.from('agent_catalog').select('rating_avg, rating_count').in('agent_id', agentIds).gt('rating_count', 0)
    : { data: [] };
  let avgRating = null;
  if ((listings || []).length) {
    const totalRated = listings.reduce((acc, l) => acc + l.rating_count, 0);
    const weightedSum = listings.reduce((acc, l) => acc + Number(l.rating_avg) * l.rating_count, 0);
    avgRating = totalRated > 0 ? Math.round((weightedSum / totalRated) * 20) : null; // scale 0-5 → 0-100
  }
  breakdown.avgRating = avgRating;

  // 5. Service uptime & latency (from agent_catalog stats)
  const { data: catalogStats } = agentIds.length
    ? await supabase.from('agent_catalog').select('success_rate, avg_response_ms').in('agent_id', agentIds).gt('install_count', 0)
    : { data: [] };
  let uptimeScore = null;
  let latencyScore = null;
  if ((catalogStats || []).length) {
    const rates = catalogStats.map((c) => Number(c.success_rate)).filter((n) => !isNaN(n) && n > 0);
    if (rates.length) uptimeScore = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
    const latencies = catalogStats.map((c) => c.avg_response_ms).filter((n) => n != null && n > 0);
    if (latencies.length) {
      const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      latencyScore = avgMs < 200 ? 100 : avgMs < 500 ? 85 : avgMs < 1000 ? 70 : avgMs < 3000 ? 50 : 30;
    }
  }
  breakdown.uptimeScore = uptimeScore;
  breakdown.latencyScore = latencyScore;

  // 6. Verification level bonus
  const { data: profile } = await supabase
    .from('organization_profiles')
    .select('verification_level, marketplace_category')
    .eq('organization_id', orgId)
    .maybeSingle();
  const verificationBonus = {
    unverified: 0, community: 5, startup: 10, enterprise: 15, verified_company: 20, government_partner: 25,
  }[profile?.verification_level || 'unverified'] || 0;
  breakdown.verificationBonus = verificationBonus;

  // 7. Marketplace history (number of successful transactions)
  const { count: txCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'paid');
  const marketplaceHistoryScore = Math.min(100, Math.round((txCount || 0) / 10) * 5);
  breakdown.marketplaceHistory = marketplaceHistoryScore;

  // Composite score: weighted average of available signals
  const signals = [
    { val: breakdown.invoiceCompletion, weight: 20 },
    { val: breakdown.sessionCompletion, weight: 20 },
    { val: breakdown.providerReputation, weight: 15 },
    { val: breakdown.avgRating, weight: 15 },
    { val: breakdown.uptimeScore, weight: 10 },
    { val: breakdown.latencyScore, weight: 5 },
    { val: breakdown.marketplaceHistory, weight: 10 },
    { val: verificationBonus, weight: 5 },
  ];

  const available = signals.filter((s) => s.val != null);
  let composite = null;
  if (available.length > 0) {
    const totalWeight = available.reduce((acc, s) => acc + s.weight, 0);
    const weightedSum = available.reduce((acc, s) => acc + s.val * s.weight, 0);
    composite = Math.min(100, Math.round((weightedSum / totalWeight) * 100) / 100);
  }

  // Persist to profile
  await supabase.from('organization_profiles').update({
    trust_score_v3: composite,
    trust_score_breakdown: breakdown,
    trust_score_updated_at: new Date().toISOString(),
  }).eq('organization_id', orgId);

  return { trustScore: composite, breakdown };
};

export const refreshTrustScores = async () => {
  const { data: orgs } = await supabase.from('organizations').select('id').eq('is_personal', false);
  const results = [];
  for (const org of orgs || []) {
    try {
      const result = await computeTrustScore(org.id);
      results.push({ orgId: org.id, trustScore: result.trustScore });
    } catch {
      results.push({ orgId: org.id, error: 'failed' });
    }
  }
  return results;
};

export const getTrustScoreDetail = async ({ orgId }) => {
  const { data: profile } = await supabase
    .from('organization_profiles')
    .select('trust_score_v3, trust_score_breakdown, trust_score_updated_at, verification_level')
    .eq('organization_id', orgId)
    .maybeSingle();

  // If stale or missing, recompute
  const staleMs = 6 * 60 * 60 * 1000; // 6 hours
  const isStale = !profile?.trust_score_updated_at ||
    (Date.now() - new Date(profile.trust_score_updated_at).getTime()) > staleMs;

  if (isStale) {
    return computeTrustScore(orgId);
  }

  return {
    trustScore: profile.trust_score_v3,
    breakdown: profile.trust_score_breakdown || {},
    updatedAt: profile.trust_score_updated_at,
  };
};

// ============================================================================
// PHASE 7 — Business Insights Dashboard
// ============================================================================

export const getBusinessInsights = async ({ orgId }) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { count: totalAgents },
    { count: totalServices },
    { count: totalInvoicesPaid },
    { data: revData },
    { data: prevRevData },
    { count: projectCount },
    { data: partnerData },
    { data: trustData },
  ] = await Promise.all([
    supabase.from('ai_agents').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('ai_services').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'paid'),
    supabase.from('invoices').select('amount_bot').eq('organization_id', orgId).eq('status', 'paid').gte('created_at', monthStart),
    supabase.from('invoices').select('amount_bot').eq('organization_id', orgId).eq('status', 'paid').gte('created_at', prevMonthStart).lt('created_at', monthStart),
    supabase.from('collaboration_project_participants').select('*', { count: 'exact', head: true }).eq('participant_org_id', orgId),
    supabase.from('org_partnerships').select('org_a, org_b').or(`org_a.eq.${orgId},org_b.eq.${orgId}`).eq('status', 'accepted'),
    supabase.from('organization_profiles').select('trust_score_v3, verification_level').eq('organization_id', orgId).maybeSingle(),
  ]);

  const sumBot = (rows) => (rows || []).reduce((acc, r) => acc + Number(r.amount_bot || 0), 0);
  const thisMonthRev = sumBot(revData);
  const prevMonthRev = sumBot(prevRevData);
  const monthlyGrowthPct = prevMonthRev > 0 ? Math.round(((thisMonthRev - prevMonthRev) / prevMonthRev) * 100) : null;

  // Countries served (from invoices — buyer countries via organizations join)
  const { data: buyerOrgs } = await supabase
    .from('invoices')
    .select('buyer_organization_id')
    .eq('organization_id', orgId)
    .eq('status', 'paid')
    .limit(500);
  const uniqueBuyerOrgIds = [...new Set((buyerOrgs || []).map((r) => r.buyer_organization_id).filter(Boolean))];
  let countriesServed = 0;
  if (uniqueBuyerOrgIds.length) {
    const { data: buyerProfiles } = await supabase
      .from('organization_profiles')
      .select('country')
      .in('organization_id', uniqueBuyerOrgIds)
      .not('country', 'is', null);
    countriesServed = new Set((buyerProfiles || []).map((p) => p.country)).size;
  }

  // Marketplace ranking (position by trust score)
  const { count: higherScoreOrgs } = await supabase
    .from('organization_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_public', true)
    .gt('trust_score_v3', trustData?.trust_score_v3 || 0);

  return {
    revenue: { thisMonth: thisMonthRev, prevMonth: prevMonthRev, monthlyGrowthPct },
    totalInvoices: totalInvoicesPaid || 0,
    totalAgents: totalAgents || 0,
    totalServices: totalServices || 0,
    collaborationProjects: projectCount || 0,
    acceptedPartnerships: (partnerData || []).length,
    countriesServed,
    trustScore: trustData?.trust_score_v3 || null,
    verificationLevel: trustData?.verification_level || 'unverified',
    marketplaceRanking: (higherScoreOrgs || 0) + 1,
  };
};

// ============================================================================
// PHASE 8 — Network Dashboard (global)
// ============================================================================

export const getNetworkDashboard = async () => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { count: totalCompanies },
    { count: verifiedCompanies },
    { count: totalAgents },
    { count: totalServices },
    { count: totalWorkflows },
    { count: totalProjects },
    { count: monthlyInvoices },
    { data: monthlyRevData },
    { count: monthlyTx },
    { data: topIndustries },
    { data: topCompanies },
  ] = await Promise.all([
    supabase.from('organization_profiles').select('*', { count: 'exact', head: true }).eq('is_public', true),
    supabase.from('organization_profiles').select('*', { count: 'exact', head: true }).eq('is_public', true).in('verification_level', ['enterprise', 'verified_company', 'government_partner']),
    supabase.from('ai_agents').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('ai_services').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('workflow_templates').select('*', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('collaboration_projects').select('*', { count: 'exact', head: true }),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'paid').gte('created_at', monthStart),
    supabase.from('invoices').select('amount_bot').eq('status', 'paid').gte('created_at', monthStart).limit(1000),
    supabase.from('commerce_sessions').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', monthStart),
    supabase.from('organization_profiles').select('industry').eq('is_public', true).not('industry', 'is', null).limit(500),
    supabase.from('organization_profiles').select('organization_id, name, slug, logo_url, trust_score_v3, verification_level').eq('is_public', true).order('trust_score_v3', { ascending: false, nullsFirst: false }).limit(10),
  ]);

  const monthlyRevenueBOT = (monthlyRevData || []).reduce((acc, r) => acc + Number(r.amount_bot || 0), 0);

  // Industry distribution
  const industryMap = {};
  (topIndustries || []).forEach((p) => {
    if (p.industry) industryMap[p.industry] = (industryMap[p.industry] || 0) + 1;
  });
  const topIndustriesList = Object.entries(industryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([industry, count]) => ({ industry, count }));

  // Countries
  const { data: countryData } = await supabase.from('organization_profiles').select('country').eq('is_public', true).not('country', 'is', null);
  const countries = new Set((countryData || []).map((p) => p.country)).size;

  return {
    totalCompanies: totalCompanies || 0,
    verifiedCompanies: verifiedCompanies || 0,
    totalAgents: totalAgents || 0,
    totalServices: totalServices || 0,
    publishedWorkflows: totalWorkflows || 0,
    activeProjects: totalProjects || 0,
    monthlyInvoices: monthlyInvoices || 0,
    monthlyRevenueBOT,
    monthlyTransactions: monthlyTx || 0,
    countries,
    topIndustries: topIndustriesList,
    topCompanies: (topCompanies || []).map((c) => ({
      orgId: c.organization_id,
      name: c.name,
      slug: c.slug,
      logoUrl: c.logo_url,
      trustScore: c.trust_score_v3,
      verificationLevel: c.verification_level,
    })),
  };
};

// ============================================================================
// PHASE 9 — Activity Feed
// ============================================================================

export const postActivityEvent = async ({ orgId, type, title, body = null, metadata = {}, isPublic = true }) => {
  try {
    await supabase.from('org_activity_feed').insert({
      org_id: orgId,
      event_type: type,
      title,
      body,
      metadata,
      is_public: isPublic,
    });
  } catch {
    // Non-fatal
  }
};

export const getActivityFeed = async ({ orgId, page = 1, perPage = 30, publicOnly = false }) => {
  const size = Math.min(50, Number(perPage) || 30);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;

  let q = supabase
    .from('org_activity_feed')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, from + size - 1);

  if (publicOnly) q = q.eq('is_public', true);

  const { data, error, count } = await q;
  if (error) throw httpError(500, error.message);

  return {
    events: (data || []).map((e) => ({
      id: e.id,
      type: e.event_type,
      title: e.title,
      body: e.body,
      metadata: e.metadata,
      isPublic: e.is_public,
      createdAt: e.created_at,
    })),
    total: count || 0,
    page: Number(page),
    perPage: size,
  };
};

export const getGlobalActivityFeed = async ({ page = 1, perPage = 30 } = {}) => {
  const size = Math.min(50, Number(perPage) || 30);
  const from = (Math.max(1, Number(page) || 1) - 1) * size;

  const { data, error, count } = await supabase
    .from('org_activity_feed')
    .select('*, organization_profiles!inner(name, slug, logo_url)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(from, from + size - 1);
  if (error) throw httpError(500, error.message);

  return {
    events: (data || []).map((e) => ({
      id: e.id,
      orgId: e.org_id,
      orgName: e.organization_profiles?.name,
      orgSlug: e.organization_profiles?.slug,
      orgLogoUrl: e.organization_profiles?.logo_url,
      type: e.event_type,
      title: e.title,
      body: e.body,
      metadata: e.metadata,
      createdAt: e.created_at,
    })),
    total: count || 0,
    page: Number(page),
    perPage: size,
  };
};

// ============================================================================
// PHASE 10 — Enterprise Workspaces
// ============================================================================

export const createWorkspace = async ({ orgId, actorId, developerId, name, description }) => {
  if (!name?.trim()) throw httpError(400, 'Workspace name is required.', 'VALIDATION');

  const { data, error } = await supabase
    .from('enterprise_workspaces')
    .insert({
      workspace_id: genId('ews'),
      owner_org_id: orgId,
      name: name.trim(),
      description: description || null,
      created_by: developerId,
    })
    .select()
    .single();
  if (error) throw httpError(500, error.message);

  // Auto-add owner org as admin member
  await supabase.from('enterprise_workspace_members').insert({
    workspace_id: data.id,
    member_org_id: orgId,
    role: 'admin',
    invited_by: developerId,
  });

  void audit({ developerId, organizationId: orgId, actorType: 'developer', actorId, action: 'workspace.created', resourceType: 'enterprise_workspace', resourceId: data.id, metadata: { name } });

  return toPublicWorkspace(data);
};

export const inviteOrgToWorkspace = async ({ workspaceId, orgId, actorId, developerId, targetOrgId, role = 'viewer' }) => {
  const workspace = await getWorkspaceRow(workspaceId, orgId);

  const { data: existing } = await supabase
    .from('enterprise_workspace_members')
    .select('id')
    .eq('workspace_id', workspace.id)
    .eq('member_org_id', targetOrgId)
    .maybeSingle();
  if (existing) throw httpError(409, 'Organization is already a member of this workspace.', 'ALREADY_MEMBER');

  const validRoles = ['admin', 'contributor', 'viewer'];
  if (!validRoles.includes(role)) throw httpError(400, 'Invalid role.', 'VALIDATION');

  const { data, error } = await supabase
    .from('enterprise_workspace_members')
    .insert({ workspace_id: workspace.id, member_org_id: targetOrgId, role, invited_by: developerId })
    .select()
    .single();
  if (error) throw httpError(500, error.message);

  void audit({ developerId, organizationId: orgId, actorType: 'developer', actorId, action: 'workspace.org_invited', resourceType: 'enterprise_workspace', resourceId: workspace.id, metadata: { targetOrgId, role } });

  return { workspaceId: workspace.workspace_id, memberOrgId: targetOrgId, role };
};

export const listWorkspaces = async ({ orgId }) => {
  const { data: memberships } = await supabase
    .from('enterprise_workspace_members')
    .select('workspace_id, role')
    .eq('member_org_id', orgId);
  const wsIds = (memberships || []).map((m) => m.workspace_id);

  if (!wsIds.length) return { workspaces: [] };

  const { data, error } = await supabase
    .from('enterprise_workspaces')
    .select('*')
    .in('id', wsIds)
    .order('created_at', { ascending: false });
  if (error) throw httpError(500, error.message);

  const roleMap = Object.fromEntries((memberships || []).map((m) => [m.workspace_id, m.role]));

  return {
    workspaces: (data || []).map((w) => ({
      ...toPublicWorkspace(w),
      myRole: roleMap[w.id] || 'viewer',
    })),
  };
};

export const getWorkspaceDetail = async ({ workspaceId, orgId }) => {
  const workspace = await getWorkspaceRow(workspaceId, orgId);

  const { data: members } = await supabase
    .from('enterprise_workspace_members')
    .select('*')
    .eq('workspace_id', workspace.id);

  const memberOrgIds = (members || []).map((m) => m.member_org_id);
  const { data: profiles } = memberOrgIds.length
    ? await supabase.from('organization_profiles').select('organization_id, name, slug, logo_url, trust_score_v3').in('organization_id', memberOrgIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.organization_id, p]));

  return {
    ...toPublicWorkspace(workspace),
    members: (members || []).map((m) => ({
      orgId: m.member_org_id,
      orgName: profileMap[m.member_org_id]?.name || null,
      orgSlug: profileMap[m.member_org_id]?.slug || null,
      logoUrl: profileMap[m.member_org_id]?.logo_url || null,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  };
};

const getWorkspaceRow = async (workspaceId, orgId) => {
  const isCode = typeof workspaceId === 'string' && workspaceId.startsWith('ews_');
  const { data, error } = isCode
    ? await supabase.from('enterprise_workspaces').select('*').eq('workspace_id', workspaceId).maybeSingle()
    : await supabase.from('enterprise_workspaces').select('*').eq('id', workspaceId).maybeSingle();
  if (error) throw httpError(500, error.message);
  if (!data) throw httpError(404, 'Workspace not found.', 'NOT_FOUND');

  // Verify membership
  const { data: membership } = await supabase
    .from('enterprise_workspace_members')
    .select('id')
    .eq('workspace_id', data.id)
    .eq('member_org_id', orgId)
    .maybeSingle();
  if (!membership && data.owner_org_id !== orgId) {
    throw httpError(403, 'You are not a member of this workspace.', 'FORBIDDEN');
  }
  return data;
};

const toPublicWorkspace = (w) => ({
  workspaceId: w.workspace_id,
  ownerOrgId: w.owner_org_id,
  name: w.name,
  description: w.description,
  createdAt: w.created_at,
  updatedAt: w.updated_at,
});
