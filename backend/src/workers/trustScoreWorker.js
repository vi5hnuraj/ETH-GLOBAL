/**
 * TrustScoreWorker — GlobalPay V3
 *
 * Runs every 6 hours. Computes Trust Scores for all non-personal organizations
 * using only objective commerce metrics (payments, invoices, sessions, ratings,
 * uptime, verification level). Then refreshes evidence-based business
 * relationships for active org pairs.
 *
 * Reuses: businessNetworkService (computeTrustScore, refreshRelationship,
 *         refreshTrustScores), supabase client.
 * Never touches: payments, wallets, billing logic.
 */

import { refreshTrustScores, refreshRelationship } from '../services/businessNetworkService.js';
import { supabase } from '../config/supabaseClient.js';
import logger from '../utils/logger.js';
const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REL_REFRESH_LIMIT = 200; // max pairs to refresh per cycle

let running = false;

const runCycle = async () => {
  if (running) return;
  running = true;
  const started = Date.now();
  logger.info('[TrustScoreWorker] Starting trust score refresh cycle...');

  try {
    // 1. Refresh trust scores for all orgs
    const results = await refreshTrustScores();
    const succeeded = results.filter((r) => !r.error).length;
    logger.info(`[TrustScoreWorker] Trust scores updated: ${succeeded}/${results.length} orgs`);

    // 2. Refresh top business relationships (most active pairs from recent invoices)
    const { data: recentPairs } = await supabase
      .from('invoices')
      .select('organization_id, buyer_organization_id')
      .eq('status', 'paid')
      .not('buyer_organization_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(REL_REFRESH_LIMIT * 2);

    const pairSet = new Set();
    for (const row of recentPairs || []) {
      if (!row.organization_id || !row.buyer_organization_id) continue;
      if (row.organization_id === row.buyer_organization_id) continue;
      const key = [row.organization_id, row.buyer_organization_id].sort().join(':');
      pairSet.add(key);
      if (pairSet.size >= REL_REFRESH_LIMIT) break;
    }

    let relRefreshed = 0;
    for (const key of pairSet) {
      const [a, b] = key.split(':');
      try {
        await refreshRelationship(a, b);
        relRefreshed++;
      } catch {
        // Non-fatal
      }
    }

    logger.info(`[TrustScoreWorker] Relationships refreshed: ${relRefreshed} pairs (${Date.now() - started}ms)`);
  } catch (err) {
    logger.error('[TrustScoreWorker] Cycle error:', err.message);
  } finally {
    running = false;
  }
};

export const startTrustScoreWorker = () => {
  if (process.env.NODE_ENV === 'test') return;
  logger.info('[TrustScoreWorker] Started (interval: 6h)');
  // Run once at startup (after a 30-second delay to let the server warm up)
  setTimeout(() => runCycle(), 30_000);
  setInterval(() => runCycle(), INTERVAL_MS);
};
