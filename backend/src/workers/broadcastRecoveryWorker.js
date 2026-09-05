import { supabase } from '../config/supabaseClient.js';
import { getProvider } from '../services/chainRpcService.js';
import { logger } from '../utils/logger.js';

const RECOVERY_INTERVAL_MS = 35 * 1000;
const TIMEOUT_EXPIRED_MS = 15 * 60 * 1000;

export const startBroadcastRecoveryWorker = () => {
  logger.info('Broadcast Reconciliation Worker started');

  setInterval(async () => {
    try {
      // Fetch transfers stuck in pending or broadcast state with non-null transaction hashes
      const { data: broadcastTxs } = await supabase
        .from('money_transfers')
        .select('*')
        .in('status', ['PENDING', 'pending', 'BROADCAST'])
        .not('tx_hash', 'is', null);

      if (!broadcastTxs || broadcastTxs.length === 0) return;

      const provider = getProvider();

      for (const tx of broadcastTxs) {
        // Skip scheduled payments — only the scheduler worker should mark those as COMPLETED after on-chain release
        try {
          if (tx.raw_signed_tx === 'AWAITING_APPROVAL') continue;
          if (tx.raw_signed_tx) {
            const parsed = JSON.parse(tx.raw_signed_tx);
            if (parsed?.type === 'paymentManager') continue;
          }
        } catch { /* non-JSON raw_signed_tx, proceed */ }

        try {
          const receipt = await provider.getTransactionReceipt(tx.tx_hash);

          if (receipt) {
            // Prefer on-chain block time for age when the receipt exposes it.
            const onChainSeconds = Number(receipt.timestamp || 0);
            const ageMs = onChainSeconds > 0
              ? Date.now() - onChainSeconds * 1000
              : Date.now() - new Date(tx.created_at).getTime();

            if (receipt.status === 1) {
              logger.info('Reconciled TX -> CONFIRMED', { txHash: tx.tx_hash, ageMs });

              await supabase
                .from('money_transfers')
                .update({ status: 'COMPLETED', block_number: receipt.blockNumber })
                .eq('id', tx.id);

              if (tx.receiver_id) {
                const { data: receiverBank } = await supabase
                  .from('bank_details')
                  .select('*')
                  .eq('user_id', tx.receiver_id)
                  .maybeSingle();

                if (receiverBank) {
                  const newBal = Number(receiverBank.usdc_balance || 0) + Number(tx.bot_amount || tx.amount || 0);
                  await supabase
                    .from('bank_details')
                    .update({ usdc_balance: newBal })
                    .eq('id', receiverBank.id);
                }
              }
            } else if (receipt.status === 0) {
              logger.info('Reconciled TX -> FAILED', { txHash: tx.tx_hash });
              await supabase
                .from('money_transfers')
                .update({ status: 'FAILED' })
                .eq('id', tx.id);
            }
          } else if (ageMsFallback(tx) > TIMEOUT_EXPIRED_MS) {
            logger.warn('Transaction timed out -> FAILED', { txId: tx.id });
            await supabase
              .from('money_transfers')
              .update({ status: 'FAILED' })
              .eq('id', tx.id);
          }
        } catch (singleErr) {
          logger.error('Failed to process TX', { txId: tx.id, error: singleErr.message });
        }
      }
    } catch (err) {
      logger.error('Recovery worker loop error', { error: err.message });
    }
  }, RECOVERY_INTERVAL_MS);
};

const ageMsFallback = (tx) => Date.now() - new Date(tx.created_at).getTime();
