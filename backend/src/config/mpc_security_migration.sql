-- Required durable controls for the external MPC control plane. Apply through
-- the normal migration process before enabling any signing environment.
CREATE TABLE IF NOT EXISTS public.mpc_signing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  organization_id uuid,
  wallet_id text NOT NULL,
  actor_id uuid,
  idempotency_key text NOT NULL,
  transaction_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('authorized','submitted','signed','rejected','failed')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.mpc_replay_nonces (
  key_id text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_id, nonce)
);
CREATE TABLE IF NOT EXISTS public.mpc_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  signing_paused boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Wallet and protocol metadata only: key shares and plaintext secrets must
-- never be placed in PostgreSQL.
CREATE TABLE IF NOT EXISTS public.mpc_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  address text NOT NULL UNIQUE,
  participant_ids jsonb NOT NULL,
  threshold smallint NOT NULL CHECK (threshold = 2),
  parties smallint NOT NULL CHECK (parties = 3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked','destroyed')),
  provider_key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mpc_protocol_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.mpc_wallets(id),
  kind text NOT NULL CHECK (kind IN ('dkg','sign','reshare','recovery','node_replacement')),
  state text NOT NULL CHECK (state IN ('requested','authorized','quorum_pending','running','completed','failed','expired')),
  request_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.mpc_signing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.mpc_wallets(id),
  organization_id uuid NOT NULL,
  session_id uuid REFERENCES public.mpc_protocol_sessions(id),
  idempotency_key text NOT NULL,
  chain_id bigint NOT NULL,
  transaction_hash text,
  status text NOT NULL CHECK (status IN ('requested','authorized','quorum_pending','signing','signed','broadcast','pending','confirmed','failed','rejected')),
  authorization_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.mpc_state_transitions (
  id bigserial PRIMARY KEY,
  signing_job_id uuid NOT NULL REFERENCES public.mpc_signing_jobs(id),
  previous_state text,
  next_state text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mpc_replay_nonces_expiry_idx ON public.mpc_replay_nonces (expires_at);
CREATE INDEX IF NOT EXISTS mpc_signing_jobs_status_idx ON public.mpc_signing_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS mpc_sessions_wallet_idx ON public.mpc_protocol_sessions (wallet_id, created_at);
