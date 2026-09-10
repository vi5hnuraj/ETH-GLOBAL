-- AgentKit usage accounting — free-trial counters per (endpoint, humanId).
-- Implements the durable-storage recommendation from the AgentKit docs
-- (InMemoryAgentKitStorage is dev-only; production persists usage + nonces).

CREATE TABLE IF NOT EXISTS agentkit_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint      text NOT NULL,
  human_id      text NOT NULL,
  uses          integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  last_used_at  timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (endpoint, human_id)
);

CREATE INDEX IF NOT EXISTS idx_agentkit_usage_human ON agentkit_usage (human_id);
