CREATE TABLE IF NOT EXISTS world_id_nullifiers (
  id BIGSERIAL PRIMARY KEY,
  nullifier NUMERIC(78, 0) NOT NULL,
  action TEXT NOT NULL,
  developer_id UUID,
  agent_id TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nullifier, action)
);
CREATE INDEX IF NOT EXISTS idx_world_nullifiers_lookup ON world_id_nullifiers (action, verified_at);
