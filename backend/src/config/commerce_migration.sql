-- =====================================================================
-- GLOBALPAY AUTONOMOUS AI COMMERCE INFRASTRUCTURE MIGRATION
-- Extends the AI Service Marketplace with enterprise procurement:
--   1. procurement_policies  — company AI procurement policy (per org)
--   2. provider_capabilities — capability profile per marketplace service
--   3. purchase_sessions     — autonomous purchase lifecycle
--   4. provider_reputation   — automatically computed trust score (0-100)
-- Everything reuses the existing orgs, RBAC, MPC wallets, invoices and
-- settlement engine. Run in the Supabase SQL Editor or `psql -f`.
-- Idempotent: safe to run more than once.
-- =====================================================================

-- =====================================================================
-- 1. PROCUREMENT POLICIES (one per organization)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.procurement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id TEXT UNIQUE NOT NULL,                -- public id, e.g. pol_...
  organization_id UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_id TEXT DEFAULT NULL,
  max_budget_bot TEXT NOT NULL DEFAULT '0',      -- monthly procurement cap (BOT decimal string)
  preferred_regions TEXT[] NOT NULL DEFAULT '{}',
  blocked_regions TEXT[] NOT NULL DEFAULT '{}',
  approved_providers TEXT[] NOT NULL DEFAULT '{}',  -- agent codes (agt_...)
  blocked_providers TEXT[] NOT NULL DEFAULT '{}',
  preferred_gpu_models TEXT[] NOT NULL DEFAULT '{}',
  minimum_vram_gb INTEGER DEFAULT NULL,
  minimum_availability_pct NUMERIC(5,2) DEFAULT NULL,
  minimum_trust_score NUMERIC(5,2) DEFAULT NULL,
  maximum_latency_ms INTEGER DEFAULT NULL,
  preferred_currencies TEXT[] NOT NULL DEFAULT '{BOT}',
  auto_purchase_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  invoice_approval_threshold_bot TEXT DEFAULT NULL,  -- invoices above this need human approval
  spending_limits JSONB NOT NULL DEFAULT '{}',       -- per category/service budget caps
  departments JSONB NOT NULL DEFAULT '{}',           -- { name: { budgetBOT, spentBOT } }
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_procurement_policies_org ON public.procurement_policies(organization_id);

-- =====================================================================
-- 2. PROVIDER CAPABILITY PROFILES (one per service)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.provider_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID UNIQUE NOT NULL REFERENCES public.ai_services(id) ON DELETE CASCADE,
  service_code TEXT NOT NULL,
  supported_models TEXT[] NOT NULL DEFAULT '{}',  -- "llama-3-70b", "gpt-j", ...
  gpu_model TEXT DEFAULT NULL,                    -- "H100", "RTX 4090", ...
  vram_gb INTEGER DEFAULT NULL,
  cuda_version TEXT DEFAULT NULL,
  inference_supported BOOLEAN NOT NULL DEFAULT FALSE,
  training_supported BOOLEAN NOT NULL DEFAULT FALSE,
  image_generation BOOLEAN NOT NULL DEFAULT FALSE,
  embeddings BOOLEAN NOT NULL DEFAULT FALSE,
  speech BOOLEAN NOT NULL DEFAULT FALSE,
  ocr BOOLEAN NOT NULL DEFAULT FALSE,
  translation BOOLEAN NOT NULL DEFAULT FALSE,
  storage BOOLEAN NOT NULL DEFAULT FALSE,
  supported_regions TEXT[] NOT NULL DEFAULT '{}', -- "asia", "eu", "us", ...
  average_latency_ms INTEGER DEFAULT NULL,
  average_response_time_ms INTEGER DEFAULT NULL,
  uptime_pct NUMERIC(5,2) DEFAULT NULL,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  active_jobs INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT NULL,
  monthly_revenue_wei TEXT NOT NULL DEFAULT '0',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_capabilities_service ON public.provider_capabilities(service_id);

-- =====================================================================
-- 3. PURCHASE SESSIONS (prepaid-only purchase lifecycle)
--   awaiting_payment (intent, no invoice/credits) -> paid (payment + invoice
--   confirmed) -> active (credits granted) -> completed
--   failures: payment_failed | cancelled | expired
--   Removed (prepaid-only migration): requested/reserved/running/
--   invoice_generated/closed — see prepaid_migration.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.purchase_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,               -- public id, e.g. psn_...
  organization_id UUID DEFAULT NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  developer_id TEXT DEFAULT NULL,
  consumer_agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  provider_agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.ai_services(id),
  consumer_agent_code TEXT NOT NULL,
  provider_agent_code TEXT NOT NULL,
  service_code TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '1',
  unit TEXT DEFAULT NULL,
  currency TEXT NOT NULL DEFAULT 'BOT',
  estimated_cost_wei TEXT NOT NULL DEFAULT '0',
  actual_cost_wei TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
    -- awaiting_payment | processing | paid | active | completed | payment_failed | cancelled | expired
  invoice_id UUID DEFAULT NULL REFERENCES public.service_invoices(id),
  invoice_code TEXT DEFAULT NULL,
  payment_tx_hash TEXT DEFAULT NULL,
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  confidence_score NUMERIC(5,2) DEFAULT NULL,
  reason TEXT DEFAULT NULL,                       -- recommendation reasoning snapshot
  source TEXT NOT NULL DEFAULT 'manual',          -- recommend | manual | policy
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_org ON public.purchase_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_consumer ON public.purchase_sessions(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_provider ON public.purchase_sessions(provider_agent_id);
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_status ON public.purchase_sessions(status);
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_created ON public.purchase_sessions(created_at DESC);

-- =====================================================================
-- 4. PROVIDER REPUTATION (automatically computed trust score)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.provider_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_agent_id UUID UNIQUE NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  provider_agent_code TEXT NOT NULL,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,     -- 0-100
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  payment_success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  dispute_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  customer_satisfaction NUMERIC(3,2) DEFAULT NULL,
  uptime_pct NUMERIC(5,2) DEFAULT NULL,
  response_latency_ms INTEGER DEFAULT NULL,
  total_revenue_wei TEXT NOT NULL DEFAULT '0',
  repeat_customers INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}',
  recomputed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_reputation_agent ON public.provider_reputation(provider_agent_id);

-- =====================================================================
-- ROW LEVEL SECURITY (mirrors the marketplace migration pattern)
-- =====================================================================
ALTER TABLE public.procurement_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procurement_policies_owner ON public.procurement_policies;
CREATE POLICY procurement_policies_owner ON public.procurement_policies
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.purchase_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_sessions_owner ON public.purchase_sessions;
CREATE POLICY purchase_sessions_owner ON public.purchase_sessions
  FOR ALL TO authenticated USING (developer_id = auth.uid()::text);

ALTER TABLE public.provider_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_capabilities_owner ON public.provider_capabilities;
CREATE POLICY provider_capabilities_owner ON public.provider_capabilities
  FOR ALL TO authenticated USING ((SELECT developer_id FROM public.ai_services WHERE id = provider_capabilities.service_id) = auth.uid()::text);

ALTER TABLE public.provider_reputation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_reputation_owner ON public.provider_reputation;
CREATE POLICY provider_reputation_owner ON public.provider_reputation
  FOR ALL TO authenticated USING ((SELECT developer_id FROM public.ai_agents WHERE id = provider_agent_id) = auth.uid()::text);

-- Org members can read rows that belong to their organization.
DROP POLICY IF EXISTS procurement_policies_org ON public.procurement_policies;
CREATE POLICY procurement_policies_org ON public.procurement_policies
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS purchase_sessions_org ON public.purchase_sessions;
CREATE POLICY purchase_sessions_org ON public.purchase_sessions
  FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS provider_capabilities_org ON public.provider_capabilities;
CREATE POLICY provider_capabilities_org ON public.provider_capabilities
  FOR SELECT TO authenticated USING (public.is_org_member((SELECT organization_id FROM public.ai_services WHERE id = provider_capabilities.service_id)));
DROP POLICY IF EXISTS provider_reputation_org ON public.provider_reputation;
CREATE POLICY provider_reputation_org ON public.provider_reputation
  FOR SELECT TO authenticated USING (public.is_org_member((SELECT organization_id FROM public.ai_agents WHERE id = provider_agent_id)));

-- =====================================================================
-- EXTEND PERSONAL-ORG PROVISIONING to backfill the new commerce tables
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
  UPDATE public.purchase_sessions SET organization_id = v_org_id
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
