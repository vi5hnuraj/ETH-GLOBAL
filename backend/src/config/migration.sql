-- =====================================================================
-- GLOBAPAY PRIVY MPC WALLET MIGRATION SCRIPT
-- Execute this script inside the Supabase SQL Editor to prepare your tables.
-- =====================================================================

-- Add wallet_created_at timestamp to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add wallet_challenge column for cryptographic nonces
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_challenge TEXT DEFAULT NULL;

-- Drop the legacy CHECK constraint on wallet_provider
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_wallet_provider_check;

-- Add updated CHECK constraint supporting 'privy'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_wallet_provider_check CHECK (wallet_provider IN ('custodial', 'thirdweb', 'privy'));

-- Set default wallet_provider to 'privy'
ALTER TABLE public.profiles ALTER COLUMN wallet_provider SET DEFAULT 'privy';

-- =====================================================================
-- REQUEST MONEY ROW-LEVEL SECURITY
-- A requester may create an invoice only for their own account.  The
-- backend uses the service-role key for administrative operations; this
-- policy covers authenticated Supabase clients without exposing inserts for
-- arbitrary users.
-- =====================================================================

ALTER TABLE public.request_money ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "request_money_insert_own" ON public.request_money;

CREATE POLICY "request_money_insert_own"
  ON public.request_money
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow an authenticated user to create and reconcile only transfers sent
-- from their own profile. This supports the AI agent without granting access
-- to other users' transactions.
ALTER TABLE public.money_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "money_transfers_insert_own" ON public.money_transfers;
CREATE POLICY "money_transfers_insert_own"
  ON public.money_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "money_transfers_update_own" ON public.money_transfers;
CREATE POLICY "money_transfers_update_own"
  ON public.money_transfers
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- =====================================================================
-- PAYMENTS ROW-LEVEL SECURITY
-- Allow authenticated users (or service-role) to insert payments linked
-- to their own sender_id.  The on-chain verification in paymentsController
-- runs server-side before this insert, so RLS is a safety net.
-- =====================================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_insert_own" ON public.payments;
CREATE POLICY "payments_insert_own"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());
