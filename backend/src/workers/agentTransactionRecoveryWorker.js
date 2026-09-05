/**
 * AgentTransactionRecoveryWorker — reconciles ai_agent_transactions against
 * real on-chain receipts.
 *
 * Payments are recorded as 'pending' immediately after broadcast (the receipt
 * may not be mined yet). This worker polls the chain for each pending/confirmed
 * tx_hash and flips rows to their true state:
 *   - receipt.status === 1 -> 'confirmed' (+ block_number, confirmed_at)
 *   - receipt.status === 0 -> 'failed'   (reverted on-chain)
 *   - no receipt after a timeout -> 'failed' (dropped/never mined)
 *
 * It never invents a status: every terminal state comes from the chain.
 */

import { supabase } from '../config/supabaseClient.js';
import { getProvider } from '../services/chainRpcService.js';
import { logger } from '../utils/logger.js';

const RECONCILE_INTERVAL_MS = Number(process.env.AGENT_TX_RECONCILE_POLL_MS || 30_000);
const BATCH_SIZE = Number(process.env.AGENT_TX_RECONCILE_BATCH || 50);
// A broadcast tx that has not been mined within this window is marked failed.
const STALE_AFTER_MS = 15 * 60 * 1000;

export const reconcileAgentTransactions = async (limit = BATCH_SIZE) => {
  const { data: rows, error } = await supabase
    .from('ai_agent_transactions')
    .select('id, tx_hash, status, created_at')
    .in('status', ['pending', 'confirmed'])
    .not('tx_hash', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.warn('Agent tx reconciliation scan failed', { error: error.message });
    return 0;
  }
  if (!rows || rows.length === 0) return 0;

  const provider = getProvider();
  let reconciled = 0;

  for (const row of rows) {
    try {
      if (row.status === 'confirmed') continue; // already terminal
      const receipt = await provider.getTransactionReceipt(row.tx_hash);

      const patch = { last_reconciled_at: new Date().toISOString() };

      if (receipt) {
        const confirmed = Number(receipt.status) === 1;
        patch.status = confirmed ? 'confirmed' : 'failed';
        patch.block_number = Number(receipt.blockNumber) || null;
        patch.receipt_status = Number(receipt.status);
        if (confirmed) patch.confirmed_at = new Date().toISOString();
      } else if (Date.now() - new Date(row.created_at).getTime() > STALE_AFTER_MS) {
        patch.status = 'failed';
        patch.receipt_status = null;
      } else {
        continue; // still within the mining window — leave pending
      }

      const { error: updateErr } = await supabase
        .from('ai_agent_transactions')
        .update(patch)
        .eq('id', row.id);
      if (updateErr) {
        logger.warn('Agent tx reconciliation update failed', { txId: row.id, error: updateErr.message });
        continue;
      }
      reconciled += 1;
      logger.info('Reconciled agent transaction', {
        txId: row.id,
        txHash: row.tx_hash,
        status: patch.status,
        blockNumber: patch.block_number
      });
    } catch (err) {
      logger.error('Agent tx reconciliation error', { txId: row.id, error: err.message });
    }
  }

  return reconciled;
};

export const startAgentTransactionRecoveryWorker = () => {
  logger.info('Agent transaction reconciliation worker started');
  global.__workerStatus = global.__workerStatus || {};
  global.__workerStatus.agentTxReconciliation = { status: 'running', startedAt: new Date().toISOString() };
  setInterval(() => {
    reconcileAgentTransactions().catch((err) =>
      logger.error('Agent tx reconciliation worker error', { error: err.message })
    );
  }, RECONCILE_INTERVAL_MS);
};
