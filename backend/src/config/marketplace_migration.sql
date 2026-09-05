-- =====================================================================
-- GLOBALPAY AI SERVICE MARKETPLACE & AUTONOMOUS BILLING MIGRATION
-- Commerce layer on top of the AI agent platform:
--   1. ai_services        — publishable service catalog (per agent)
--   2. usage_reports      — metered usage that drives invoicing
--   3. service_invoices   — auto-generated invoices (pending/paid/expired/cancelled)
-- Every agent already owns an MPC wallet + gpay_sk_ key; invoices settle by
-- paying the provider's wallet directly from the consumer agent's wallet.
-- Run in the Supabase SQL Editor (or `psql $DATABASE_URL -f`).
-- Idempotent: safe to run more than once.
-- =====================================================================

-- =====================================================================
-- 1. AI SERVICES (the catalog)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ai_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id TEXT UNIQUE NOT NULL,             -- public id, e.g. srv_...
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  agent_code TEXT NOT NULL,                    -- owning agent public id agt_...
  developer_id TEXT DEFAULT NULL,
  organization_id UUID DEFAULT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  category TEXT NOT NULL DEFAULT 'compute',    -- gpu | storage | ai-model | translation | ocr | voice | video | compute | api | other
  pricing_model TEXT NOT NULL DEFAULT 'per_unit', -- per_unit | per_hour | per_request | per_char | per_mb_day | flat | subscription
  unit_price TEXT NOT NULL DEFAULT '0',        -- BOT per unit (decimal string)
  unit_label TEXT DEFAULT NULL,                -- 'hour', 'request', '1000 chars', 'MB/day', 'unit'
  supported_currencies TEXT[] NOT NULL DEFAULT '{BOT}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_services_agent ON public.ai_services(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_services_dev ON public.ai_services(developer_id);
CREATE INDEX IF NOT EXISTS idx_ai_services_org ON public.ai_services(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_services_category ON public.ai_services(category);
CREATE INDEX IF NOT EXISTS idx_ai_services_active ON public.ai_services(is_active, created_at DESC);

-- =====================================================================
-- 2. USAGE REPORTS (metered consumption)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.usage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id TEXT UNIQUE NOT NULL,               -- public id, e.g. use_...
  service_id UUID NOT NULL REFERENCES public.ai_services(id) ON DELETE CASCADE,
  service_code TEXT NOT NULL,
  consumer_agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  provider_agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  consumer_agent_code TEXT NOT NULL,
  provider_agent_code TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '0',          -- decimal string (e.g. "3.5")
  unit TEXT DEFAULT NULL,                      -- derived from the service unit label
  amount_wei TEXT NOT NULL DEFAULT '0',        -- computed charge (integer wei)
  status TEXT NOT NULL DEFAULT 'reported',     -- reported | invoiced | void
  invoice_id UUID DEFAULT NULL,                -- service_invoices.id once invoiced
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_reports_service ON public.usage_reports(service_id);
CREATE INDEX IF NOT EXISTS idx_usage_reports_consumer ON public.usage_reports(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_reports_provider ON public.usage_reports(provider_agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_reports_status ON public.usage_reports(status);
CREATE INDEX IF NOT EXISTS idx_usage_reports_created ON public.usage_reports(created_at DESC);

-- =====================================================================
-- 3. SERVICE INVOICES (automatic billing)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.service_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id TEXT UNIQUE NOT NULL,             -- public id, e.g. inv_...
  service_id UUID NOT NULL REFERENCES public.ai_services(id),
  service_code TEXT NOT NULL,
  consumer_agent_id UUID NOT NULL REFERENCES public.ai_agents(id),
  provider_agent_id UUID NOT NULL REFERENCES public.ai_agents(id),
  consumer_agent_code TEXT NOT NULL,
  provider_agent_code TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '0',
  unit TEXT DEFAULT NULL,
  amount_wei TEXT NOT NULL DEFAULT '0',        -- integer wei
  currency TEXT NOT NULL DEFAULT 'BOT',
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | paid | expired | cancelled
  tx_hash TEXT DEFAULT NULL,
  paid_at TIMESTAMPTZ DEFAULT NULL,
  due_at TIMESTAMPTZ DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_invoices_service ON public.service_invoices(service_id);
CREATE INDEX IF NOT EXISTS idx_service_invoices_consumer ON public.service_invoices(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_service_invoices_provider ON public.service_invoices(provider_agent_id);
CREATE INDEX IF NOT EXISTS idx_service_invoices_status ON public.service_invoices(status);
CREATE INDEX IF NOT EXISTS idx_service_invoices_created ON public.service_invoices(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_invoices_tx_hash
  ON public.service_invoices(tx_hash) WHERE tx_hash IS NOT NULL;

-- =====================================================================
-- TENANT BACKFILL: org-scoped reads in the developer platform
-- =====================================================================
ALTER TABLE public.usage_reports ADD COLUMN IF NOT EXISTS developer_id TEXT DEFAULT NULL;
ALTER TABLE public.service_invoices ADD COLUMN IF NOT EXISTS developer_id TEXT DEFAULT NULL;
ALTER TABLE public.ai_services ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.usage_reports ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;
ALTER TABLE public.service_invoices ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT NULL;

-- =====================================================================
-- ROW LEVEL SECURITY
-- The service-role backend bypasses RLS (all enforcement is app-level).
-- These policies close the direct-to-DB path for user JWTs to their own rows.
-- =====================================================================
ALTER TABLE public.ai_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_services_owner ON public.ai_services;
CREATE POLICY ai_services_owner ON public.ai_services
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.usage_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_reports_owner ON public.usage_reports;
CREATE POLICY usage_reports_owner ON public.usage_reports
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.service_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_invoices_owner ON public.service_invoices;
CREATE POLICY service_invoices_owner ON public.service_invoices
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

-- Org members can read rows that belong to organizations they belong to.
DROP POLICY IF EXISTS ai_services_org ON public.ai_services;
CREATE POLICY ai_services_org ON public.ai_services
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS usage_reports_org ON public.usage_reports;
CREATE POLICY usage_reports_org ON public.usage_reports
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS service_invoices_org ON public.service_invoices;
CREATE POLICY service_invoices_org ON public.service_invoices
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- =====================================================================
-- EXTEND PERSONAL-ORG PROVISIONING to backfill the new commerce tables
-- (see Phase 6 of agents_migration.sql for the original function).
-- =====================================================================
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
  UPDATE public.ai_services SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.usage_reports SET organization_id = v_org_id
   WHERE developer_id = p_dev_id AND organization_id IS NULL;
  UPDATE public.service_invoices SET organization_id = v_org_id
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
