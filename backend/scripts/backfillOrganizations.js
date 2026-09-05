/**
 * One-shot backfill for Phase 2.
 *
 * For every distinct developer_id that already owns rows in the legacy resource
 * tables (ai_agents, developer_api_keys, webhook_endpoints, webhook_deliveries,
 * api_usage_logs, subscriptions, invoices, developer_settings, audit_logs) this
 * script ensures a "personal" organization + owner membership exist and stamps
 * organization_id onto the legacy rows. Idempotent and safe to re-run.
 */
import { supabase } from '../src/config/supabaseClient.js';
import { ensurePersonalOrg } from '../src/services/organizationService.js';

const TABLES = [
  'ai_agents',
  'developer_api_keys',
  'webhook_endpoints',
  'webhook_deliveries',
  'api_usage_logs',
  'subscriptions',
  'invoices',
  'developer_settings',
  'audit_logs'
];

const distinctDeveloperIds = async () => {
  const ids = new Set();
  await Promise.all(
    TABLES.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select('developer_id', { count: 'exact', head: true })
        .not('developer_id', 'is', null);
      // Fallback: select distinct developer_id values directly.
      if (error) {
        const { data: rows } = await supabase.from(table).select('developer_id').not('developer_id', 'is', null).limit(5000);
        (rows || []).forEach((r) => ids.add(r.developer_id));
        return;
      }
      const { data: rows } = await supabase.from(table).select('developer_id').not('developer_id', 'is', null).limit(5000);
      (rows || []).forEach((r) => ids.add(r.developer_id));
    })
  );
  return [...ids];
};

const main = async () => {
  const ids = await distinctDeveloperIds();
  console.log(`Found ${ids.length} distinct developer_id(s) to backfill:`);
  for (const dev of ids) {
    console.log('  -', dev || '(empty)');
  }
  let created = 0;
  for (const dev of ids) {
    try {
      const { org, membership } = await ensurePersonalOrg(dev);
      console.log(`OK  developer=${dev || '(empty)'} org=${org.slug} role=${membership.role}`);
      created += 1;
    } catch (err) {
      console.error(`FAIL developer=${dev || '(empty)'} — ${err.message}`);
    }
  }
  console.log(`Backfilled ${created} organization(s).`);
  process.exit(0);
};

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
