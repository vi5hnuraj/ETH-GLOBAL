-- ============================================================================
-- GlobalPay V3 — AI Business Network (additive, idempotent)
-- ============================================================================

-- ============================================================================
-- Phase 1 — Extended Public Company Profile fields
-- ============================================================================
ALTER TABLE public.organization_profiles
  ADD COLUMN IF NOT EXISTS cover_image_url   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS headquarters      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS company_size      TEXT DEFAULT NULL
    CHECK (company_size IS NULL OR company_size IN ('1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+')),
  ADD COLUMN IF NOT EXISTS founded_year      INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_capabilities   TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS field_visibility  JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_org_profiles_country   ON public.organization_profiles(country);
CREATE INDEX IF NOT EXISTS idx_org_profiles_industry  ON public.organization_profiles(industry);
CREATE INDEX IF NOT EXISTS idx_org_profiles_public    ON public.organization_profiles(is_public, verification_level);

-- ============================================================================
-- Phase 2 — Business Relationships
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.business_relationships (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a                 UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_b                 UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  relationship_strength NUMERIC(6,2) NOT NULL DEFAULT 0,
  shared_sessions       INTEGER NOT NULL DEFAULT 0,
  shared_invoices       INTEGER NOT NULL DEFAULT 0,
  shared_workflows      INTEGER NOT NULL DEFAULT 0,
  shared_projects       INTEGER NOT NULL DEFAULT 0,
  total_volume_wei      TEXT NOT NULL DEFAULT '0',
  first_interaction_at  TIMESTAMPTZ DEFAULT NULL,
  last_interaction_at   TIMESTAMPTZ DEFAULT NULL,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_a, org_b),
  CHECK (org_a < org_b)
);
CREATE INDEX IF NOT EXISTS idx_biz_rel_org_a  ON public.business_relationships(org_a, relationship_strength DESC);
CREATE INDEX IF NOT EXISTS idx_biz_rel_org_b  ON public.business_relationships(org_b, relationship_strength DESC);
CREATE INDEX IF NOT EXISTS idx_biz_rel_strong ON public.business_relationships(relationship_strength DESC);

-- ============================================================================
-- Phase 3 — Partnerships
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_partnerships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id      TEXT UNIQUE NOT NULL,
  org_a               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_b               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type                TEXT NOT NULL DEFAULT 'technology'
    CHECK (type IN ('technology','marketplace','research','integration','infrastructure')),
  status              TEXT NOT NULL DEFAULT 'recommended'
    CHECK (status IN ('recommended','pending','accepted','expired','rejected')),
  recommended_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_by_org     UUID DEFAULT NULL,
  proposed_at         TIMESTAMPTZ DEFAULT NULL,
  accepted_at         TIMESTAMPTZ DEFAULT NULL,
  expires_at          TIMESTAMPTZ DEFAULT NULL,
  terms               TEXT DEFAULT NULL,
  collaboration_basis JSONB NOT NULL DEFAULT '{}',
  UNIQUE(org_a, org_b, type),
  CHECK (org_a < org_b)
);
CREATE INDEX IF NOT EXISTS idx_partnerships_org_a  ON public.org_partnerships(org_a, status);
CREATE INDEX IF NOT EXISTS idx_partnerships_org_b  ON public.org_partnerships(org_b, status);
CREATE INDEX IF NOT EXISTS idx_partnerships_status ON public.org_partnerships(status);

-- ============================================================================
-- Phase 4 — Collaboration Projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.collaboration_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT UNIQUE NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','paused','archived')),
  is_public     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collab_projects_org ON public.collaboration_projects(organization_id);

CREATE TABLE IF NOT EXISTS public.collaboration_project_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.collaboration_projects(id) ON DELETE CASCADE,
  participant_org_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role                TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('owner','admin','contributor','viewer')),
  invited_by          TEXT NOT NULL,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, participant_org_id)
);
CREATE INDEX IF NOT EXISTS idx_collab_participants_project ON public.collaboration_project_participants(project_id);
CREATE INDEX IF NOT EXISTS idx_collab_participants_org     ON public.collaboration_project_participants(participant_org_id);

-- ============================================================================
-- Phase 5 — Workflow Marketplace
-- ============================================================================
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_bot      TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS marketplace_category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS install_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg     NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count   INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workflow_templates_marketplace
  ON public.workflow_templates(is_published, marketplace_category);

CREATE TABLE IF NOT EXISTS public.workflow_marketplace_installations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id TEXT UNIQUE NOT NULL,
  template_id     UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  template_code   TEXT NOT NULL,
  buyer_org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_id    TEXT NOT NULL,
  session_id      TEXT DEFAULT NULL,
  invoice_id      TEXT DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','cancelled')),
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, buyer_org_id)
);
CREATE INDEX IF NOT EXISTS idx_wmi_buyer_org ON public.workflow_marketplace_installations(buyer_org_id);
CREATE INDEX IF NOT EXISTS idx_wmi_template  ON public.workflow_marketplace_installations(template_id);

-- ============================================================================
-- Phase 6 — Trust Score V3
-- ============================================================================
ALTER TABLE public.organization_profiles
  ADD COLUMN IF NOT EXISTS trust_score_v3       NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trust_score_breakdown JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trust_score_updated_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_org_profiles_trust ON public.organization_profiles(trust_score_v3 DESC NULLS LAST);

-- ============================================================================
-- Phase 9 — Activity Feed
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_activity_feed (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT DEFAULT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_org       ON public.org_activity_feed(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_public    ON public.org_activity_feed(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type      ON public.org_activity_feed(event_type, created_at DESC);

-- ============================================================================
-- Phase 10 — Enterprise Workspaces
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.enterprise_workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    TEXT UNIQUE NOT NULL,
  owner_org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.enterprise_workspaces(owner_org_id);

CREATE TABLE IF NOT EXISTS public.enterprise_workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.enterprise_workspaces(id) ON DELETE CASCADE,
  member_org_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin','contributor','viewer')),
  invited_by      TEXT NOT NULL,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, member_org_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws  ON public.enterprise_workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_org ON public.enterprise_workspace_members(member_org_id);

-- ============================================================================
-- ROW LEVEL SECURITY AND POLICIES (Created after tables to avoid dependency errors)
-- ============================================================================

-- Business Relationships
ALTER TABLE public.business_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS biz_rel_org_select ON public.business_relationships;
CREATE POLICY biz_rel_org_select ON public.business_relationships
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_a) OR public.is_org_member(org_b));

-- Partnerships
ALTER TABLE public.org_partnerships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partnerships_org_select ON public.org_partnerships;
CREATE POLICY partnerships_org_select ON public.org_partnerships
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_a) OR public.is_org_member(org_b));

DROP POLICY IF EXISTS partnerships_org_all ON public.org_partnerships;
CREATE POLICY partnerships_org_all ON public.org_partnerships
  FOR ALL TO authenticated
  USING (public.is_org_member(org_a) OR public.is_org_member(org_b))
  WITH CHECK (public.is_org_member(org_a) OR public.is_org_member(org_b));

DROP POLICY IF EXISTS partnerships_public_accepted ON public.org_partnerships;
CREATE POLICY partnerships_public_accepted ON public.org_partnerships
  FOR SELECT TO anon, authenticated
  USING (status = 'accepted');

-- Collaboration Projects
ALTER TABLE public.collaboration_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collab_projects_member ON public.collaboration_projects;
CREATE POLICY collab_projects_member ON public.collaboration_projects
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT cpp.participant_org_id FROM public.collaboration_project_participants cpp
      WHERE public.is_org_member(cpp.participant_org_id)
    )
    OR public.is_org_member(organization_id)
  )
  WITH CHECK (public.is_org_member(organization_id));

ALTER TABLE public.collaboration_project_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collab_participants_member ON public.collaboration_project_participants;
CREATE POLICY collab_participants_member ON public.collaboration_project_participants
  FOR ALL TO authenticated
  USING (public.is_org_member(participant_org_id))
  WITH CHECK (public.is_org_member(participant_org_id));

-- Workflow Marketplace Installations
ALTER TABLE public.workflow_marketplace_installations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wmi_org_all ON public.workflow_marketplace_installations;
CREATE POLICY wmi_org_all ON public.workflow_marketplace_installations
  FOR ALL TO authenticated
  USING (public.is_org_member(buyer_org_id))
  WITH CHECK (public.is_org_member(buyer_org_id));

-- Activity Feed
ALTER TABLE public.org_activity_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_public_read ON public.org_activity_feed;
CREATE POLICY activity_public_read ON public.org_activity_feed
  FOR SELECT TO anon, authenticated
  USING (is_public = TRUE);

DROP POLICY IF EXISTS activity_org_all ON public.org_activity_feed;
CREATE POLICY activity_org_all ON public.org_activity_feed
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

-- Enterprise Workspaces
ALTER TABLE public.enterprise_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspaces_member ON public.enterprise_workspaces;
CREATE POLICY workspaces_member ON public.enterprise_workspaces
  FOR ALL TO authenticated
  USING (
    public.is_org_member(owner_org_id)
    OR EXISTS (
      SELECT 1 FROM public.enterprise_workspace_members ewm
      WHERE ewm.workspace_id = enterprise_workspaces.id
        AND public.is_org_member(ewm.member_org_id)
    )
  )
  WITH CHECK (public.is_org_member(owner_org_id));

ALTER TABLE public.enterprise_workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_members_org ON public.enterprise_workspace_members;
CREATE POLICY workspace_members_org ON public.enterprise_workspace_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(member_org_id));
