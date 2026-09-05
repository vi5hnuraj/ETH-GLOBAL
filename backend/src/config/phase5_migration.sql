-- ============================================================================
-- Phase 5 — Global AI Network (AI Economy Infrastructure)
--
-- Adds:
--   1. organization_profiles  — public AI company profiles + verification levels
--   2. workflow_templates     — reusable, org-scoped multi-provider workflows
--   3. workflow_runs          — one-click deployments (the collaboration network)
--   4. workflow_run_steps     — per-step provider/session/invoice/cost tracking
--   5. procurement_policies   — additive columns for automatic provider switching
--
-- Everything else (agents, MPC wallets, marketplace, invoices, purchase
-- sessions, reputation, policies, RBAC, audit, webhooks) is reused as-is.
-- Apply via the Supabase SQL editor (idempotent), same as the other migrations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 / 5.2  Public AI company profiles + provider verification
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT DEFAULT NULL,
  logo_url TEXT DEFAULT NULL,
  industry TEXT DEFAULT NULL,
  country TEXT DEFAULT NULL,
  website TEXT DEFAULT NULL,
  certifications TEXT[] DEFAULT '{}',
  supported_regions TEXT[] DEFAULT '{}',
  verification_level TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_level IN ('unverified','community','startup','enterprise','verified_company','government_partner')),
  verified_at TIMESTAMPTZ DEFAULT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_profiles_org ON public.organization_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_profiles_slug ON public.organization_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_org_profiles_verification ON public.organization_profiles(verification_level);

ALTER TABLE public.organization_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_profiles_anon_select ON public.organization_profiles;
CREATE POLICY org_profiles_anon_select ON public.organization_profiles
  FOR SELECT TO anon, authenticated
  USING (is_public = TRUE);
DROP POLICY IF EXISTS org_profiles_org_all ON public.organization_profiles;
CREATE POLICY org_profiles_org_all ON public.organization_profiles
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 5.8  Workflow templates (reusable multi-provider workflows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT UNIQUE NOT NULL,                -- wft_...
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  category TEXT NOT NULL DEFAULT 'research',
  steps JSONB NOT NULL DEFAULT '[]',               -- [{action, category, capability, model, quantity, params:{...}}]
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deployed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_org ON public.workflow_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON public.workflow_templates(organization_id, is_active);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_templates_owner ON public.workflow_templates;
CREATE POLICY workflow_templates_owner ON public.workflow_templates
  FOR ALL TO authenticated
  USING (developer_id = auth.uid()::text);
DROP POLICY IF EXISTS workflow_templates_org ON public.workflow_templates;
CREATE POLICY workflow_templates_org ON public.workflow_templates
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 5.6  Workflow runs — the AI collaboration network deployment graph
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT UNIQUE NOT NULL,                     -- wfr_...
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL DEFAULT '',
  template_id TEXT DEFAULT NULL,                   -- wft_... (null for ad-hoc)
  template_name TEXT DEFAULT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','cancelled','partial')),
  current_step INTEGER NOT NULL DEFAULT 0,         -- 0-based index of next step to run
  total_steps INTEGER NOT NULL DEFAULT 0,
  input JSONB DEFAULT '{}',                        -- task summary the network executes
  dependencies JSONB NOT NULL DEFAULT '[]',        -- [{step, dependsOn:[stepIndex]}]
  session_ids TEXT[] DEFAULT '{}',                 -- linked purchase sessions
  invoice_ids TEXT[] DEFAULT '{}',                 -- linked invoices
  estimated_cost_wei TEXT NOT NULL DEFAULT '0',
  actual_cost_wei TEXT NOT NULL DEFAULT '0',
  consumer_agent_code TEXT DEFAULT NULL,           -- agent executing on behalf of the org
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org ON public.workflow_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON public.workflow_runs(status);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_runs_owner ON public.workflow_runs;
CREATE POLICY workflow_runs_owner ON public.workflow_runs
  FOR ALL TO authenticated
  USING (developer_id = auth.uid()::text);
DROP POLICY IF EXISTS workflow_runs_org ON public.workflow_runs;
CREATE POLICY workflow_runs_org ON public.workflow_runs
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 5.5 / 5.6  Per-step execution record (multi-provider + billing linkage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  run_code TEXT NOT NULL,                          -- wfr_... (denormalized for lookups)
  step_index INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL,                            -- e.g. 'gpu', 'storage', 'translation', 'ocr'
  category TEXT DEFAULT NULL,
  capability TEXT DEFAULT NULL,
  model TEXT DEFAULT NULL,
  quantity TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','matching','matched','reserved','running','completed','failed','skipped')),
  service_id TEXT DEFAULT NULL,                    -- srv_...
  provider_agent_code TEXT DEFAULT NULL,           -- agt_...
  session_id TEXT DEFAULT NULL,                    -- psn_...
  invoice_id TEXT DEFAULT NULL,                    -- inv_...
  estimated_cost_wei TEXT NOT NULL DEFAULT '0',
  actual_cost_wei TEXT NOT NULL DEFAULT '0',
  failover_tried INTEGER NOT NULL DEFAULT 0,       -- provider switches attempted
  error TEXT DEFAULT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON public.workflow_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_session ON public.workflow_run_steps(session_id);

ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_steps_org ON public.workflow_run_steps;
CREATE POLICY workflow_steps_org ON public.workflow_run_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_runs wr
    WHERE wr.id = workflow_run_steps.run_id AND public.is_org_member(wr.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workflow_runs wr
    WHERE wr.id = workflow_run_steps.run_id AND public.is_org_member(wr.organization_id)
  ));
-- Note: workflow_run_steps has no developer_id column; scoping is resolved
-- through the parent workflow_runs row via the policy above.

-- ---------------------------------------------------------------------------
-- 5.4  Automatic provider switching (additive policy controls)
-- ---------------------------------------------------------------------------
ALTER TABLE public.procurement_policies
  ADD COLUMN IF NOT EXISTS auto_switch_providers BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.procurement_policies
  ADD COLUMN IF NOT EXISTS preferred_failover_count INTEGER NOT NULL DEFAULT 2;