-- =====================================================================
-- GLOBALPAY AI AGENT PLATFORM ("Bank for Bots") MIGRATION
-- Headless server wallets + API keys for autonomous AI agents on BOT Chain.
-- Run in the Supabase SQL Editor (or `psql $DATABASE_URL -f`).
-- Idempotent: safe to run more than once.
-- =====================================================================

-- AI agents (bots) that hold a headless wallet on the BOT Chain.
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,              -- public id, e.g. agt_...
  developer_id TEXT DEFAULT NULL,             -- owning developer / user id
  agent_name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  wallet_address TEXT NOT NULL,               -- headless BOT Chain vault address
  wallet_id TEXT DEFAULT NULL,                -- provider wallet id (e.g. Privy server wallet id)
  wallet_provider TEXT NOT NULL DEFAULT 'local', -- local | privy | bowallet | ...
  encrypted_private_key TEXT DEFAULT NULL,    -- AES-256-GCM encrypted server signing key (local provider)
  api_key_hash TEXT UNIQUE NOT NULL,          -- SHA-256 of the live API key (secret never stored)
  api_key_prefix TEXT NOT NULL,               -- "gpay_sk_ab12..." shown for identification only
  balance TEXT DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'active',      -- active | revoked
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log of every agent transaction (micro-settlements, AI-to-AI, DePIN).
CREATE TABLE IF NOT EXISTS public.ai_agent_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  destination_address TEXT NOT NULL,
  amount TEXT NOT NULL,                       -- native amount in wei
  token TEXT NOT NULL DEFAULT 'BOT',
  note TEXT DEFAULT NULL,
  tx_hash TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | confirmed | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill for databases created before the agent_id/developer fields existed.
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS developer_id TEXT DEFAULT NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS wallet_provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS agent_id TEXT UNIQUE DEFAULT NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS api_key_prefix TEXT DEFAULT NULL;
ALTER TABLE public.ai_agents ALTER COLUMN agent_name TYPE TEXT;

-- =====================================================================
-- CHAIN_ID FOR AI AGENTS
-- Every agent permanently stores the blockchain network (chain ID) of its
-- linked wallet. New agents get this set at creation time; existing rows are
-- backfilled below from their linked MPC wallet records (authoritative).
-- Idempotent: safe to run more than once.
-- =====================================================================
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS chain_id BIGINT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agents_chain ON public.ai_agents(chain_id);

-- Backfill: every agent linked to an MPC wallet inherits that wallet's chain.
UPDATE public.ai_agents a
SET chain_id = w.chain_id,
    updated_at = NOW()
FROM public.mpc_wallets w
WHERE w.wallet_id = a.wallet_id
  AND a.chain_id IS NULL
  AND w.chain_id IS NOT NULL;

-- Fallback: agents created before MPC wallets existed but whose platform is
-- pinned to the BOT Chain mainnet (BOTCHAIN_CHAIN_ID=677 in backend/.env).
UPDATE public.ai_agents a
SET chain_id = 677,
    updated_at = NOW()
WHERE a.chain_id IS NULL
  AND a.wallet_provider = 'local';

CREATE INDEX IF NOT EXISTS idx_ai_agents_api_key_hash ON public.ai_agents(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_ai_agents_wallet ON public.ai_agents(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ai_agents_developer ON public.ai_agents(developer_id);
CREATE INDEX IF NOT EXISTS idx_ai_tx_agent ON public.ai_agent_transactions(agent_id);

-- =====================================================================
-- GLOBALPAY DEVELOPER PLATFORM MIGRATION
-- Tables backing the Developer Platform UI (dashboard, usage, billing,
-- webhooks, settings, revenue). Idempotent.
-- =====================================================================

-- Per-developer persisted platform settings (env, wallet provider,
-- permissions, notifications, security, team members).
CREATE TABLE IF NOT EXISTS public.developer_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Request log for every /api/agents/* + /api/developers/* call.
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT DEFAULT NULL,
  agent_id UUID DEFAULT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  error_code TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_dev_created ON public.api_usage_logs(developer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON public.api_usage_logs(agent_id);

-- Developer-level API keys (separate from per-agent keys).
CREATE TABLE IF NOT EXISTS public.developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_keys_developer ON public.developer_api_keys(developer_id);

-- Webhook endpoints owned by a developer.
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_developer ON public.webhook_endpoints(developer_id);

-- Delivery attempt log for each webhook event.
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | delivered | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER DEFAULT NULL,
  last_attempt_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_endpoint ON public.webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_dev ON public.webhook_deliveries(developer_id);

-- Developer subscriptions / plans.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',        -- free | pro | enterprise
  status TEXT NOT NULL DEFAULT 'trialing',  -- trialing | active | past_due | canceled
  price_cents INTEGER NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT NULL,
  cancel_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice / payment history records.
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'open',      -- open | paid | void | past_due
  due_date TIMESTAMPTZ DEFAULT NULL,
  paid_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_dev ON public.invoices(developer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dev ON public.subscriptions(developer_id);

-- =====================================================================
-- PRODUCTION HARDENING — real usage attribution, key security, audit log.
-- Idempotent; safe to run more than once.
-- =====================================================================

-- Attributable usage: which API key (agent or developer) drove each call.
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS api_key_id UUID DEFAULT NULL;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL; -- agent_key | developer_key
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS ip TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_api_key ON public.api_usage_logs(api_key_id);

-- Developer key hardening: scopes, expiration, IP allowlist, usage count.
ALTER TABLE public.developer_api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.developer_api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.developer_api_keys ADD COLUMN IF NOT EXISTS ip_allowlist TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.developer_api_keys ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

-- Agent lifecycle: suspension timestamp (status column already supports 'suspended').
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ DEFAULT NULL;

-- Webhook delivery diagnostics.
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL;
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS duration_ms DOUBLE PRECISION DEFAULT NULL;

-- Audit trail for every meaningful platform action.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT DEFAULT NULL,
  actor_type TEXT NOT NULL DEFAULT 'developer',  -- developer | agent | system
  actor_id TEXT DEFAULT NULL,
  action TEXT NOT NULL,                          -- e.g. key.created, agent.suspended
  resource_type TEXT DEFAULT NULL,
  resource_id TEXT DEFAULT NULL,
  ip TEXT DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_dev_created ON public.audit_logs(developer_id, created_at);

-- =====================================================================
-- PRODUCTION HARDENING PHASE 1 — indexes, unique constraints, RLS, and
-- webhook delivery retry machinery. Idempotent; safe to run repeatedly.
-- =====================================================================

-- Webhook retry/backoff + dead-letter queue fields.
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS dead_letter BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_retry
  ON public.webhook_deliveries(status, next_attempt_at)
  WHERE status = 'failed' AND dead_letter = FALSE;

-- Unique transaction hashes prevent duplicate blockchain transactions from
-- ever being recorded twice (application-level checks are defense-in-depth).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_agent_tx_hash
  ON public.ai_agent_transactions(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_tx_hash
  ON public.payments(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_money_transfers_tx_hash
  ON public.money_transfers(tx_hash) WHERE tx_hash IS NOT NULL;

-- Common query-path indexes (list/history queries).
CREATE INDEX IF NOT EXISTS idx_ai_tx_agent_created
  ON public.ai_agent_transactions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_transfers_sender
  ON public.money_transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_transfers_receiver
  ON public.money_transfers(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_sender
  ON public.payments(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_receiver
  ON public.payments(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_money_user ON public.request_money(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_transactions_created ON public.ai_agent_transactions(created_at DESC);

-- =====================================================================
-- ROW LEVEL SECURITY
-- The backend uses the service role (bypasses RLS), so enabling RLS hardens
-- the public REST API: the anon key and ordinary user JWTs can no longer read
-- or write these tables directly. Policies grant the `authenticated` role
-- tenant-scoped access where an ownership column exists; tables without one
-- default to deny (service role still works).
-- =====================================================================

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agents_owner_select ON public.ai_agents;
CREATE POLICY ai_agents_owner_select ON public.ai_agents
  FOR SELECT TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.ai_agent_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_tx_owner ON public.ai_agent_transactions;
CREATE POLICY ai_agent_tx_owner ON public.ai_agent_transactions
  FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM public.ai_agents WHERE developer_id = auth.uid()::text));

ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_keys_owner ON public.developer_api_keys;
CREATE POLICY dev_keys_owner ON public.developer_api_keys
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_endpoints_owner ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_owner ON public.webhook_endpoints
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_deliveries_owner ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_owner ON public.webhook_deliveries
  FOR SELECT TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_usage_logs_owner ON public.api_usage_logs;
CREATE POLICY api_usage_logs_owner ON public.api_usage_logs
  FOR SELECT TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.developer_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS developer_settings_owner ON public.developer_settings;
CREATE POLICY developer_settings_owner ON public.developer_settings
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_owner ON public.subscriptions;
CREATE POLICY subscriptions_owner ON public.subscriptions
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_owner ON public.invoices;
CREATE POLICY invoices_owner ON public.invoices
  FOR SELECT TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_owner ON public.audit_logs;
CREATE POLICY audit_logs_owner ON public.audit_logs
  FOR SELECT TO authenticated USING (developer_id = auth.uid()::text);

-- =====================================================================
-- PHASE 2 — MULTI-TENANT ORGANIZATIONS + RBAC
-- Organizations, membership, invitations, roles, settings, audit logs.
-- Idempotent; safe to run repeatedly.
-- =====================================================================

-- Organizations (tenants). Every legacy developer_id gets a lazily-provisioned
-- "personal" organization so existing single-user accounts keep working.
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  owner_developer_id TEXT DEFAULT NULL,          -- legacy developer id of the creator
  is_personal BOOLEAN NOT NULL DEFAULT FALSE,    -- true for auto-provisioned personal workspaces
  created_by TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Membership: a developer belongs to many organizations with exactly one role.
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL,
  email TEXT DEFAULT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',           -- owner | admin | developer | billing_manager | viewer
  status TEXT NOT NULL DEFAULT 'active',         -- active | removed
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, developer_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_dev ON public.organization_members(developer_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);

-- Invitations keyed by an unguessable token; expiring.
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | accepted | declined | cancelled | expired
  invited_by TEXT DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON public.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.organization_invitations(token);
-- Prevent duplicate *pending* invitations to the same email in one org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invite_pending
  ON public.organization_invitations(organization_id, email) WHERE status = 'pending';

-- Per-organization settings document.
CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization-scoped audit trail (invitations, role changes, ownership…).
CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_developer_id TEXT DEFAULT NULL,
  action TEXT NOT NULL,
  resource_type TEXT DEFAULT NULL,
  resource_id TEXT DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_audit_org ON public.organization_audit_logs(organization_id, created_at DESC);

-- Every tenant-owned resource gains an organization_id. Existing rows are
-- backfilled at runtime by organizationService.ensureOrgForDeveloper (and by
-- the scripts/backfillOrganizations.js one-shot), so no data is lost.
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.developer_api_keys ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.webhook_endpoints ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.developer_settings ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON public.ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_dev_keys_org ON public.developer_api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON public.webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org ON public.webhook_deliveries(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_org ON public.api_usage_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON public.audit_logs(organization_id);

-- Billing is shared per-organization: at most one subscription row per org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_org
  ON public.subscriptions(organization_id) WHERE organization_id IS NOT NULL;

-- =====================================================================
-- PHASE 2 ROW LEVEL SECURITY — org-aware
-- The service-role backend bypasses RLS (all enforcement is app-level).
-- These policies close the direct-to-DB path for user JWTs: a member can
-- only see rows belonging to organizations they belong to.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = org_id
      AND m.developer_id = auth.uid()::text
      AND m.status = 'active'
  );
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orgs_owner_select ON public.organizations;
CREATE POLICY orgs_owner_select ON public.organizations
  FOR SELECT TO authenticated USING (owner_developer_id = auth.uid()::text);
DROP POLICY IF EXISTS orgs_member_select ON public.organizations;
CREATE POLICY orgs_member_select ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_members_member_select ON public.organization_members;
CREATE POLICY org_members_member_select ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_invites_member_select ON public.organization_invitations;
CREATE POLICY org_invites_member_select ON public.organization_invitations
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR email = auth.email());

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_settings_member_select ON public.organization_settings;
CREATE POLICY org_settings_member_select ON public.organization_settings
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

ALTER TABLE public.organization_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_audit_member_select ON public.organization_audit_logs;
CREATE POLICY org_audit_member_select ON public.organization_audit_logs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Extend the Phase 1 tenant policies so org members can read rows that belong
-- to organizations they belong to (not only rows owned by their own uid).
DROP POLICY IF EXISTS ai_agents_org_select ON public.ai_agents;
CREATE POLICY ai_agents_org_select ON public.ai_agents
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS dev_keys_org ON public.developer_api_keys;
CREATE POLICY dev_keys_org ON public.developer_api_keys
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS webhook_endpoints_org ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_org ON public.webhook_endpoints
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS webhook_deliveries_org ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_org ON public.webhook_deliveries
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS api_usage_logs_org ON public.api_usage_logs;
CREATE POLICY api_usage_logs_org ON public.api_usage_logs
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS subscriptions_org ON public.subscriptions;
CREATE POLICY subscriptions_org ON public.subscriptions
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS invoices_org ON public.invoices;
CREATE POLICY invoices_org ON public.invoices
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS audit_logs_org ON public.audit_logs;
CREATE POLICY audit_logs_org ON public.audit_logs
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- Tables without an ownership column (payments, money_transfers,
-- bank_details, request_money): RLS is enabled with NO policy, so the anon
-- key and user JWTs are denied entirely; the service-role backend is
-- unaffected. (flash_loan_history is provisioned separately, if at all.)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_money ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_owner ON public.profiles;
CREATE POLICY profiles_owner ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- =====================================================================
-- PHASE 3 — BOT CHAIN CORE INFRASTRUCTURE HARDENING
-- Transaction reconciliation metadata + per-agent usage quotas.
-- Idempotent; safe to run more than once.
-- =====================================================================

-- ai_agent_transactions reconciliation columns. Rows are written as 'pending'
-- on broadcast and reconciled to 'confirmed'/'failed' by the agent transaction
-- reconciliation worker against real on-chain receipts (no fabricated statuses).
ALTER TABLE public.ai_agent_transactions ADD COLUMN IF NOT EXISTS block_number BIGINT DEFAULT NULL;
ALTER TABLE public.ai_agent_transactions ADD COLUMN IF NOT EXISTS receipt_status INTEGER DEFAULT NULL;
ALTER TABLE public.ai_agent_transactions ADD COLUMN IF NOT EXISTS nonce INTEGER DEFAULT NULL;
ALTER TABLE public.ai_agent_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.ai_agent_transactions ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_tx_reconcile
  ON public.ai_agent_transactions(status, tx_hash)
  WHERE status IN ('pending', 'confirmed') AND tx_hash IS NOT NULL;

-- Per-agent request quota tracking (monthly window). Used by the agent rate
-- limiter to enforce plan request limits per agent instead of only a global cap.
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS request_count_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS request_month_start TIMESTAMPTZ DEFAULT NULL;
-- =====================================================================
-- PHASE 4 — PRODUCTION DEVELOPER PLATFORM
-- Query-path indexes for status filters, monthly rollups and pagination.
-- Idempotent; safe to run more than once.
-- =====================================================================

-- Status-filtered scans (agents dashboard, list admin)
CREATE INDEX IF NOT EXISTS idx_ai_agents_status ON public.ai_agents(status);
CREATE INDEX IF NOT EXISTS idx_ai_agents_status_created ON public.ai_agents(status, created_at DESC);

-- Transactions: reconcile + history + stats grouping already cover (agent_id);
-- add a confirm/fail time index for the worker and monthly volume rollups.
CREATE INDEX IF NOT EXISTS idx_ai_tx_confirmed ON public.ai_agent_transactions(confirmed_at)
  WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_ai_tx_status_created ON public.ai_agent_transactions(status, created_at DESC);

-- Usage logs: the monthly quota + error-rate queries filter on created_at and
-- status_code. A leading (created_at DESC) index serves the wide range scans
-- and Revenue/dashboard rollups.
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON public.api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_org_created ON public.api_usage_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_status ON public.api_usage_logs(status_code);

-- Developer API keys: revocation/rotation filtering by status
CREATE INDEX IF NOT EXISTS idx_dev_keys_status ON public.developer_api_keys(status);
CREATE INDEX IF NOT EXISTS idx_dev_keys_org_status ON public.developer_api_keys(organization_id, status);

-- Webhook deliveries: retry + dashboard filters
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org_created ON public.webhook_deliveries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);

-- Audit + org audit: time-series reads for log viewers/export
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_audit_created ON public.organization_audit_logs(created_at DESC);

-- Subscriptions / invoices: plan lifetime + invoice window reads
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_created ON public.invoices(organization_id, created_at DESC);

-- Organizations: slug + owner lookups in the org switcher / transfer flows
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_developer_id);

-- RLS Write policies to allow personal organization provisioning for authenticated users
DROP POLICY IF EXISTS orgs_insert_policy ON public.organizations;
CREATE POLICY orgs_insert_policy ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS orgs_update_policy ON public.organizations;
CREATE POLICY orgs_update_policy ON public.organizations
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS org_members_insert_policy ON public.organization_members;
CREATE POLICY org_members_insert_policy ON public.organization_members
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS org_members_update_policy ON public.organization_members;
CREATE POLICY org_members_update_policy ON public.organization_members
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS org_settings_insert_policy ON public.organization_settings;
CREATE POLICY org_settings_insert_policy ON public.organization_settings
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS org_settings_update_policy ON public.organization_settings;
CREATE POLICY org_settings_update_policy ON public.organization_settings
  FOR UPDATE TO authenticated USING (true);

-- =====================================================================
-- PHASE 5 — PRODUCTION DEVELOPER PLATFORM: API DASHBOARD
-- Request-log telemetry (expandable rows) + audit user-agent capture.
-- Idempotent; safe to run more than once.
-- =====================================================================

ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS request_headers jsonb;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS request_body text;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS response_body text;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS idx_api_usage_request_id ON public.api_usage_logs(request_id);

-- =====================================================================
-- PHASE 6 — BULLETPROOF PERSONAL-ORG PROVISIONING
-- The Supabase gateway intermittently downgrades service-role requests to
-- anon (RLS-restricted). Reads then silently return `[]` and inserts raise
-- 42501 "new row violates row-level security policy". That previously made
-- org provisioning fail for entire request bursts, 500-ing the developer
-- UI ("sometimes not loading"). A SECURITY DEFINER function runs as its
-- owner (postgres — BYPASSRLS) no matter what role invoked it, so
-- provisioning is immune to the anon downgrade. Idempotent; safe to run
-- repeatedly.
-- =====================================================================

-- Per-owner uniqueness for personal workspaces so concurrent provisioning
-- can never insert a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_personal_owner
  ON public.organizations(owner_developer_id) WHERE is_personal = true;

CREATE OR REPLACE FUNCTION public.ensure_personal_org(p_dev_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_org_id
    FROM public.organizations
   WHERE owner_developer_id = p_dev_id AND is_personal = true
   LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (slug, name, owner_developer_id, is_personal, created_by)
    VALUES (
      'org-' || p_dev_id,
      'Personal workspace — ' || p_dev_id,
      p_dev_id,
      true,
      p_dev_id
    )
    ON CONFLICT (owner_developer_id) WHERE is_personal DO NOTHING
    RETURNING id INTO v_org_id;
  END IF;

  IF v_org_id IS NULL THEN
    -- Race loser: a concurrent call inserted between our SELECT and INSERT.
    SELECT id INTO v_org_id
      FROM public.organizations
     WHERE owner_developer_id = p_dev_id AND is_personal = true
     LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'unable to provision personal organization for %', p_dev_id;
  END IF;

  INSERT INTO public.organization_members (organization_id, developer_id, role, status)
  VALUES (v_org_id, p_dev_id, 'owner', 'active')
  ON CONFLICT (organization_id, developer_id) DO UPDATE
    SET role = 'owner', status = 'active', updated_at = NOW();

  -- Backfill legacy rows owned by this developer so the org-scoped UI sees
  -- them even when this function runs under a downgraded (anon) caller.
  UPDATE public.ai_agents SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.developer_api_keys SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.webhook_endpoints SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.webhook_deliveries SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.api_usage_logs SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.subscriptions SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.invoices SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.audit_logs SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;

  SELECT jsonb_build_object(
    'org', to_jsonb(o),
    'membership', to_jsonb(m)
  )
  FROM public.organizations o
  JOIN public.organization_members m
    ON m.organization_id = o.id AND m.developer_id = p_dev_id
  WHERE o.id = v_org_id
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_org(p_dev_id TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_personal_org(p_dev_id TEXT) TO anon, authenticated, service_role;
