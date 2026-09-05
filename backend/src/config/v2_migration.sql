-- ============================================================================
-- GlobalPay v2.0 — AI Agent Marketplace (additive, idempotent)
-- Companies publish complete AI agents (agent_catalog), organizations install
-- them (agent_installations) and subscribe (agent_subscriptions), usage is
-- metered per invocation (agent_invocation_logs), peers rate them
-- (agent_reviews) and providers ship versions (agent_versions). Billing,
-- invoices, purchase sessions and provider reputation all stay in the
-- existing commerce engine — nothing here re-implements payments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Phase 1/2/3/8/9: agent catalog + versions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_catalog (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id         TEXT UNIQUE NOT NULL,            -- agc_...
  agent_id           UUID NOT NULL UNIQUE REFERENCES ai_agents(id) ON DELETE CASCADE,
  agent_code         TEXT NOT NULL,                   -- agt_... (denormalized)
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  developer_id       TEXT NOT NULL,
  title              TEXT NOT NULL,
  tagline            TEXT,
  description        TEXT,
  icon_url           TEXT,
  screenshots        TEXT[] NOT NULL DEFAULT '{}',
  category           TEXT NOT NULL DEFAULT 'automation'
                     CHECK (category IN ('research','finance','legal','hr','translation','ocr','voice','video','gpu','compute','storage','automation')),
  tags               TEXT[] NOT NULL DEFAULT '{}',
  version            TEXT NOT NULL DEFAULT '1.0.0',
  pricing_model      TEXT NOT NULL DEFAULT 'per_request'
                     CHECK (pricing_model IN ('free','monthly','usage','per_request','per_hour','enterprise')),
  price_bot          TEXT NOT NULL DEFAULT '0',      -- BOT decimal string
  billing_cycle      TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  plans              JSONB NOT NULL DEFAULT '[]',     -- [{name,pricingModel,priceBOT,billingCycle}]
  default_service_id UUID REFERENCES ai_services(id) ON DELETE SET NULL,  -- backend billing service
  api_endpoint       TEXT,
  webhook_endpoint   TEXT,
  documentation_url  TEXT,
  support_contact    TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published','unpublished')),
  install_count      INTEGER NOT NULL DEFAULT 0,
  rating_avg         NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  review_count       INTEGER NOT NULL DEFAULT 0,
  success_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_response_ms    INTEGER,
  first_published_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_catalog_status ON agent_catalog(status, category);
CREATE INDEX IF NOT EXISTS idx_agent_catalog_org ON agent_catalog(organization_id);

CREATE TABLE IF NOT EXISTS agent_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   UUID NOT NULL REFERENCES agent_catalog(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  changelog    TEXT,
  release_notes TEXT,
  is_current   BOOLEAN NOT NULL DEFAULT FALSE,
  published_by TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, version)
);

-- ----------------------------------------------------------------------------
-- Phase 3/4: installations + subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_installations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id TEXT UNIQUE NOT NULL,              -- ain_...
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  developer_id    TEXT NOT NULL,
  listing_id      UUID NOT NULL REFERENCES agent_catalog(id) ON DELETE CASCADE,
  agent_code      TEXT NOT NULL,
  agent_title     TEXT NOT NULL,
  agent_version   TEXT NOT NULL,                     -- installed version snapshot
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','pending','suspended','cancelled','expired')),
  acting_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,  -- org consumer agent
  configuration   JSONB NOT NULL DEFAULT '{}',
  usage_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_installations_active
  ON agent_installations(organization_id, listing_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     TEXT UNIQUE NOT NULL,          -- asb_...
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  developer_id        TEXT NOT NULL,
  listing_id          UUID NOT NULL REFERENCES agent_catalog(id) ON DELETE CASCADE,
  installation_id     UUID REFERENCES agent_installations(id) ON DELETE SET NULL,
  agent_code          TEXT NOT NULL,
  agent_title         TEXT NOT NULL,
  plan                TEXT,
  pricing_model       TEXT NOT NULL DEFAULT 'per_request',
  price_bot           TEXT NOT NULL DEFAULT '0',
  billing_cycle       TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','trialing','past_due','cancelled','expired')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ,
  last_invoice_id     TEXT,
  renewals            INTEGER NOT NULL DEFAULT 0,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Phase 5: invocation/metering logs (API access) + Phase 8 reviews
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_invocation_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id           TEXT UNIQUE NOT NULL,             -- aiv_...
  installation_id  UUID REFERENCES agent_installations(id) ON DELETE CASCADE,
  listing_id       UUID NOT NULL REFERENCES agent_catalog(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  developer_id     TEXT NOT NULL,
  consumer_agent_code TEXT,
  input            TEXT,
  output           TEXT,
  status           TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed')),
  error            TEXT,
  duration_ms      INTEGER,
  cost_wei         TEXT NOT NULL DEFAULT '0',
  session_id       TEXT,                             -- psn_... when billed
  source           TEXT NOT NULL DEFAULT 'installed-agent',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_invocations_org ON agent_invocation_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_invocations_listing ON agent_invocation_logs(listing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        TEXT UNIQUE NOT NULL,             -- arv_...
  listing_id       UUID NOT NULL REFERENCES agent_catalog(id) ON DELETE CASCADE,
  installation_id  UUID REFERENCES agent_installations(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  developer_id     TEXT NOT NULL,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title            TEXT,
  review           TEXT,
  status           TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_reviews_install ON agent_reviews(installation_id);

-- ----------------------------------------------------------------------------
-- RLS (backend uses the service role and bypasses; these enforce tenant safety
-- for direct/anon access)
-- ----------------------------------------------------------------------------
ALTER TABLE agent_catalog          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_installations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_invocation_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_reviews          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_catalog_select ON agent_catalog;
CREATE POLICY agent_catalog_select ON agent_catalog FOR SELECT
  USING (status = 'published' OR public.is_org_member(organization_id) OR
         EXISTS (SELECT 1 FROM organizations o WHERE o.owner_developer_id = CURRENT_SETTING('request.jwt.claims', TRUE)::jsonb->>'sub'));

DROP POLICY IF EXISTS agent_catalog_org_write ON agent_catalog;
CREATE POLICY agent_catalog_org_write ON agent_catalog FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS agent_versions_read ON agent_versions;
CREATE POLICY agent_versions_read ON agent_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM agent_catalog c WHERE c.id = agent_versions.listing_id AND (c.status = 'published' OR public.is_org_member(c.organization_id))));

DROP POLICY IF EXISTS agent_versions_org_write ON agent_versions;
CREATE POLICY agent_versions_org_write ON agent_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM agent_catalog c WHERE c.id = agent_versions.listing_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM agent_catalog c WHERE c.id = agent_versions.listing_id AND public.is_org_member(c.organization_id)));

DROP POLICY IF EXISTS agent_installations_org ON agent_installations;
CREATE POLICY agent_installations_org ON agent_installations FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS agent_subscriptions_org ON agent_subscriptions;
CREATE POLICY agent_subscriptions_org ON agent_subscriptions FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS agent_invocation_logs_org ON agent_invocation_logs;
CREATE POLICY agent_invocation_logs_org ON agent_invocation_logs FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS agent_reviews_org ON agent_reviews;
CREATE POLICY agent_reviews_org ON agent_reviews FOR ALL
  USING (public.is_org_member(organization_id) OR
         EXISTS (SELECT 1 FROM agent_catalog c WHERE c.id = agent_reviews.listing_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT ON agent_catalog, agent_versions TO anon, authenticated;