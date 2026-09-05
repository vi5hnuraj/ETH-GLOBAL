import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { boundedFetch } from '../utils/boundedFetch.js';
import logger from '../utils/logger.js';
// Load the project .env as the source of truth, overriding any SUPABASE_*
// values inherited from the launching shell. Without this, a developer shell
// that exports a non-service key would silently turn on RLS for every backend
// query (reads return nothing → "invalid key"/"not found", inserts fail with
// "row violates row-level security policy").
dotenv.config({ override: true });

let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn("⚠️ [Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
}

// Self-healing URL check: strip trailing "/rest/v1" or slashes if present in .env
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

// Service role client bypasses RLS policies securely for admin backend operations
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseServiceKey || 'placeholder', {
  global: { fetch: boundedFetch }
});
