/**
 * PlatformRepository — schema detection & resilience helpers.
 *
 * The developer platform must never crash when the Supabase tables have not
 * been created yet. Every read/write to a platform table is guarded through
 * this module so the UI can show a "Setup Required" state instead of 500s.
 */

import { supabase } from '../config/supabaseClient.js';
import { cache } from '../utils/ttlCache.js';

export const REQUIRED_TABLES = [
  'ai_agents',
  'ai_agent_transactions',
  'api_usage_logs',
  'developer_settings',
  'developer_api_keys',
  'webhook_endpoints',
  'webhook_deliveries',
  'subscriptions',
  'invoices'
];

export const MIGRATION_FILE = 'backend/src/config/agents_migration.sql';

const MISSING_TABLE_RE =
  /Could not find the table|PGRST205|relation "?[a-z_.]+"? does not exist|42P01/i;

/** True when the Supabase error indicates a missing table (not a real failure). */
export const isMissingTable = (error) => MISSING_TABLE_RE.test(String(error?.message || ''));

/** Hard ceiling for a single platform-table existence probe, well below Supabase's
 *  statement_timeout (~20s). Prevents a degraded connection pool from stalling
 *  /api/developers/status (and therefore /developer) for tens of seconds. */
export const TABLE_PROBE_TIMEOUT_MS = 8000;

const withTimeout = (promise, ms, onTimeout) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => onTimeout(() => reject(new Error('Platform table check timed out.')), timer), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

/**
 * Non-destructive existence check: query the primary key with a limit of 1.
 * Bounded by TABLE_PROBE_TIMEOUT_MS so a slow/cold pool fails fast instead of
 * hanging on Supabase's own ~20s statement timeout.
 *
 * Returns true (exists), false (missing) or null (probe timed out / unknown).
 */
export const tableExists = async (table) => {
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), TABLE_PROBE_TIMEOUT_MS);
  try {
    const { error } = await withTimeout(
      supabase.from(table).select('id').limit(1).abortSignal(signal),
      TABLE_PROBE_TIMEOUT_MS,
      (fail) => { controller.abort(); fail(); }
    );
    return !error || !isMissingTable(error);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Results are cached briefly so rapid /developer mounts (and the dashboard
 *  + setup gate hitting status) don't hammer the pool. A refresh can be forced
 *  by the caller; the cache only ever reports the most recent healthy probe. */
const STATUS_CACHE_KEY = 'required-tables:status';
const STATUS_CACHE_TTL_MS = 60_000;

export const checkRequiredTables = async ({ force = false } = {}) => {
  if (!force) {
    const cached = cache.get(STATUS_CACHE_KEY);
    if (cached) return cached;
  }
  const results = await Promise.all(
    REQUIRED_TABLES.map(async (table) => ({ table, exists: await tableExists(table) }))
  );
  const value = {
    ready: results.every((r) => r.exists === true),
    missing: results.filter((r) => r.exists === false).map((r) => r.table),
    degraded: results.some((r) => r.exists === null),
    tables: results
  };
  return cache.set(STATUS_CACHE_KEY, value, STATUS_CACHE_TTL_MS);
};

/**
 * Wraps a platform data call. If the underlying failure is a missing table,
 * rejects with a normalized SetupRequiredError so controllers can respond
 * with a consistent { success:false, setupRequired:true } shape.
 */
export const requireTables = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTable(err)) {
      throw Object.assign(new Error('Platform tables are not provisioned yet.'), {
        code: 'SETUP_REQUIRED'
      });
    }
    throw err;
  }
};

export class SetupRequiredError extends Error {
  constructor(message = 'Platform tables are not provisioned yet.') {
    super(message);
    this.name = 'SetupRequiredError';
    this.code = 'SETUP_REQUIRED';
    this.status = 503;
  }
}

export const isSetupRequiredError = (err) => (err?.code || '') === 'SETUP_REQUIRED';

/**
 * Normalizes a supabase result error: throws SetupRequiredError when the cause
 * is a missing table, otherwise rethrows the original error.
 */
export const throwMissingTable = (error) => {
  if (error && isMissingTable(error)) {
    throw new SetupRequiredError();
  }
  if (error) throw error;
};
