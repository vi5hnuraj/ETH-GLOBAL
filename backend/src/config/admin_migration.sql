-- ============================================================================
-- GlobalPay Admin Console — Platform Role Migration
-- Run this in Supabase SQL Editor to enable admin access.
-- ============================================================================

-- Add platform_role column (NULL = regular user, 'super_admin' = full admin access)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS platform_role TEXT DEFAULT NULL
  CHECK (platform_role IS NULL OR platform_role IN ('super_admin', 'admin', 'support'));

-- Index for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_platform_role
  ON public.profiles(platform_role)
  WHERE platform_role IS NOT NULL;

-- ============================================================================
-- PROMOTE A USER TO SUPER ADMIN
-- Replace the email below with your admin account email.
-- ============================================================================

-- Option A: Promote by email
-- UPDATE public.profiles SET platform_role = 'super_admin' WHERE email = 'your@email.com';

-- Option B: Promote by user ID
-- UPDATE public.profiles SET platform_role = 'super_admin' WHERE id = 'your-user-id';

-- Verify:
-- SELECT id, email, name, platform_role FROM public.profiles WHERE platform_role IS NOT NULL;
