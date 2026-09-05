import logger from '../utils/logger.js';import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { getProvider } from '../services/chainRpcService.js';

const POLL_INTERVAL_MS = 30 * 1000;

// The Supabase service key intermittently degrades to anon RLS, which silently
// drops writes (0 rows updated, no error). All status/insert writes here go
// through the direct Postgres pool so reconciliation always lands.
const sqlUpdateTransfer = async (id, fields) => {
  const pool = getPool();
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setSql = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  await pool.query(`UPDATE money_transfers SET ${setSql} WHERE id = $${keys.length + 1}`, [...Object.values(fields), id]);
};

const sqlInsertPayment = async (row) => {
  const pool = getPool();
  const cols = Object.keys(row);
  const colSql = cols.map((c) => `"${c}"`).join(', ');
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(`INSERT INTO payments (${colSql}) VALUES (${ph})`, Object.values(row));
};

function getContractData() {
  const filePath = path.resolve('globalPayData.json');
  if (!fs.existsSync(filePath)) {
    return {
      address: process.env.GLOBAL_PAY_MANAGER_ADDRESS || "0x6F3B1DC09A8C968F0B829276570bCF10AB9858c1",
      abi: [
        {
          "inputs": [{"internalType": "bytes32","name": "id","type": "bytes32"}],
          "name": "release","outputs": [],"stateMutability": "nonpayable","type": "function"
        },
        {
          "inputs": [{"internalType": "bytes32","name": "id","type": "bytes32"}],
          "name": "getPayment","outputs": [
            {"internalType": "uint8","name":"","type":"uint8"},
            {"internalType": "uint8","name":"","type":"uint8"},
            {"internalType": "address","name":"","type":"address"},
            {"internalType": "address","name":"","type":"address"},
            {"internalType": "uint256","name":"","type":"uint256"},
            {"internalType": "uint256","name":"","type":"uint256"},
            {"internalType": "bytes32","name":"","type":"bytes32"}
          ],"stateMutability": "view","type": "function"
        }
      ]
    };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const createPaymentsRecord = async (payment, txHash) => {
  // Check if a payments record already exists for this release tx
  if (txHash) {
    const { data: existing } = await supabase
      .from('payments')
      .select('id, keyword')
      .eq('tx_hash', txHash)
      .maybeSingle();
    if (existing) {
      if (existing.keyword !== 'Scheduled Payment (Released)') {
        const pool = getPool();
        await pool.query(`UPDATE payments SET keyword = 'Scheduled Payment (Released)' WHERE id = $1`, [existing.id]);
      }
      return;
    }
  }
  try {
    const insertRow = {
      sender_id: payment.sender_id,
      receiver_id: payment.receiver_id,
      amount: payment.amount,
      bot_amount_snapshot: payment.bot_amount || payment.amount,
      coin: 'BOT',
      tx_hash: txHash || payment.tx_hash,
      keyword: 'Scheduled Payment (Released)',
      sender_wallet_type: payment.sender_wallet_type || 'external',
      receiving_wallet_type: payment.receiving_wallet_type || 'internal',
      destination_address: payment.destination_address || payment.receiver_wallet_address,
      sender_wallet_address: payment.sender_wallet_address || null,
      receiver_wallet_address: payment.receiver_wallet_address || null,
      created_at: new Date().toISOString()
    };
    // Only include pay_tag columns if they exist in the schema
    if (payment.sender_pay_tag) insertRow.sender_pay_tag = payment.sender_pay_tag;
    if (payment.receiver_pay_tag) insertRow.recipient_pay_tag = payment.receiver_pay_tag;
    await sqlInsertPayment(insertRow);
  } catch (err) {
    // Duplicate (already recorded elsewhere) — safe to ignore
    if (!String(err.message || '').includes('duplicate')) {
      logger.warn('createPaymentsRecord insert failed', { error: err.message });
    }
  }
};

/** Recover stuck schedules where raw_signed_tx = 'AWAITING_APPROVAL' or raw_signed_tx is not a valid JSON (funded on-chain but storeContractFunding never called). */
const recoverStuckSchedules = async () => {
  try {
    const { data: stuck } = await supabase
      .from('money_transfers')
      .select('id, tx_hash, amount, sender_wallet_address, receiver_wallet_address, sender_id, raw_signed_tx')
      .eq('status', 'PENDING');
    if (!stuck || stuck.length === 0) return;
    const toRecover = stuck.filter(r => {
      if (r.raw_signed_tx === 'AWAITING_APPROVAL') return true;
      if (!r.raw_signed_tx || !r.tx_hash) return false;
      try { const m = JSON.parse(r.raw_signed_tx); return !(m?.type === 'paymentManager' && m?.paymentId); }
      catch { return true; }
    });
    if (toRecover.length === 0) return;
    logger.info(`⏰ [SCHEDULER WORKER] Found ${toRecover.length} stuck schedules to recover`);

    const provider = getProvider();
    const contractData = getContractData();
    const contract = new ethers.Contract(contractData.address, contractData.abi, provider);

    for (const record of toRecover) {
      try {
        const recvShort = (record.receiver_wallet_address || '').substring(0, 6) + '...' + (record.receiver_wallet_address || '').slice(-4);
        logger.info(`⏰ [SCHEDULER WORKER] Processing stuck ${record.id}: amt=${record.amount} recv=${recvShort}`);
        // First try to find PaymentCreated from the tx_hash if available
        let paymentId = null;
        let fundingTx = null;
        if (record.tx_hash?.startsWith('0x')) {
          try {
            const receipt = await provider.waitForTransaction(record.tx_hash, 1, 30000);
            if (receipt && receipt.status === 1) {
              const recoveryContract = new ethers.Contract(contractData.address, contractData.abi, provider);
              for (const log of receipt.logs) {
                try {
                  const parsed = recoveryContract.interface.parseLog({ topics: log.topics, data: log.data });
                  if (parsed?.name === 'PaymentCreated') {
                    paymentId = parsed.args.id;
                    fundingTx = record.tx_hash;
                    break;
                  }
                } catch (pl) { continue; }
              }
            }
          } catch (txErr) {
            logger.info(`⏰ [SCHEDULER WORKER] Tx fetch failed for ${record.id}: ${txErr.message}`);
          }
        }
        // Fallback: scan recent events by receiver + amount
        if (!paymentId) {
          const currentBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - 200000);
          const events = await contract.queryFilter('PaymentCreated', fromBlock, currentBlock);
          logger.info(`⏰ [SCHEDULER WORKER] Scanned ${events.length} PaymentCreated events from ${fromBlock} to ${currentBlock}`);
          const amtExpected = ethers.parseUnits(Number(record.amount || 0).toFixed(18), 18).toString();
          const recvExpected = (record.receiver_wallet_address || '').toLowerCase();
          const matched = events.find(e => {
            const recvOnChain = String(e.args?.receiver || '').toLowerCase();
            const amtOnChain = String(e.args?.amount || '');
            return recvOnChain === recvExpected && amtOnChain === amtExpected;
          });
          if (!matched) {
            logger.info(`⏰ [SCHEDULER WORKER] No match for ${record.id}`);
            continue;
          }
          paymentId = matched.args.id;
          fundingTx = matched.transactionHash;
        }
        if (!paymentId || !fundingTx) {
          logger.info(`⏰ [SCHEDULER WORKER] Could not determine paymentId for ${record.id}`);
          continue;
        }
        const rawSignedTx = JSON.stringify({ type: 'paymentManager', paymentId, fundingTx });
        await sqlUpdateTransfer(record.id, { raw_signed_tx: rawSignedTx, tx_hash: fundingTx });
        logger.info(`✅ [SCHEDULER WORKER] Recovered stuck schedule ${record.id} -> paymentId ${String(paymentId).substring(0, 30)}...`);
      } catch (rErr) {
        logger.error(`⏰ [SCHEDULER WORKER] Recovery error for ${record.id}:`, rErr.message);
      }
    }
  } catch (err) {
    logger.error("⏰ [SCHEDULER WORKER] recoverStuckSchedules error:", err.message);
  }
};

/** Backfill payments records for schedules released before the payments insert was added. */
const backfillMissingPayments = async () => {
  try {
    const { data: completed } = await supabase
      .from('money_transfers')
      .select('id, tx_hash, sender_id, receiver_id, amount, bot_amount, receiver_pay_tag, sender_wallet_type, receiving_wallet_type, destination_address, receiver_wallet_address, sender_wallet_address, raw_signed_tx')
      .eq('status', 'COMPLETED')
      .not('raw_signed_tx', 'is', null);
    if (!completed || completed.length === 0) return;
    for (const record of completed) {
      const releaseTxHash = record.tx_hash;
      if (!releaseTxHash) continue;
      const { data: existingPay } = await supabase
        .from('payments')
        .select('id')
        .eq('tx_hash', releaseTxHash)
        .maybeSingle();
      if (existingPay) continue;
      try {
        const backfillRow = {
          sender_id: record.sender_id,
          receiver_id: record.receiver_id,
          amount: record.amount,
          bot_amount_snapshot: record.bot_amount || record.amount,
          coin: 'BOT',
          tx_hash: releaseTxHash,
          keyword: 'Scheduled Payment (Released)',
          sender_wallet_type: record.sender_wallet_type || 'external',
          receiving_wallet_type: record.receiving_wallet_type || 'internal',
          destination_address: record.destination_address || record.receiver_wallet_address,
          sender_wallet_address: record.sender_wallet_address || null,
          receiver_wallet_address: record.receiver_wallet_address || null
        };
        if (record.sender_pay_tag) backfillRow.sender_pay_tag = record.sender_pay_tag;
        if (record.receiver_pay_tag) backfillRow.recipient_pay_tag = record.receiver_pay_tag;
        await sqlInsertPayment(backfillRow);
      } catch (err) {
        if (!String(err.message || '').includes('duplicate')) {
          logger.warn('Backfill payments insert failed', { error: err.message });
        }
      }
      logger.info(`✅ [SCHEDULER WORKER] Backfilled payments record for schedule ${record.id}`);
    }
  } catch (err) {
    logger.error("⏰ [SCHEDULER WORKER] Backfill error:", err.message);
  }
};

export const startScheduledPaymentWorker = () => {
  logger.info("⏰ [SCHEDULER WORKER] Started — auto-release relayer (non-custodial).");
  (async () => {
    await backfillMissingPayments();
    await recoverStuckSchedules();
    // First immediate check so we don't wait 30s
    try {
      const { data: pending } = await supabase
        .from('money_transfers')
        .select('id, status')
        .eq('status', 'PENDING')
        .not('raw_signed_tx', 'is', null);
      logger.info(`[Scheduler] Initial scan: ${pending?.length || 0} pending funded schedules`);
    } catch (e) {
      logger.error("⏰ [SCHEDULER WORKER] Initial scan error:", e.message);
    }
  })();

  let lastCheckedBlock = null;

  setInterval(async () => {
    try {
      logger.info("⏰ [SCHEDULER WORKER] Poll cycle...");
      // Default to server clock; overwritten with on-chain time below so release
      // scheduling is immune to server clock skew (the releaseTime on-chain
      // comparison must not drift with the machine's wall clock).
      let nowSeconds = Math.floor(Date.now() / 1000);

      // Poll PENDING plus FAILED schedules. FAILED rows whose on-chain payment is
      // still Active (e.g. a transient relayer gas failure) are retried below; rows
      // already released/cancelled on-chain get reconciled to COMPLETED/FAILED.
      const { data: duePayments } = await supabase
        .from('money_transfers')
        .select('*')
      .in('status', ['PENDING', 'FAILED'])
      .not('raw_signed_tx', 'is', null);

      logger.info(`⏰ [SCHEDULER WORKER] duePayments: ${duePayments?.length || 0}`);
      if (!duePayments || duePayments.length === 0) return;

      const provider = getProvider();
      // Use the latest mined block's timestamp as the authoritative clock.
      try {
        const latestBlock = await provider.getBlock('latest');
        if (latestBlock?.timestamp) nowSeconds = Number(latestBlock.timestamp);
      } catch (clockErr) {
        logger.warn('Could not fetch on-chain clock, using server clock', { error: clockErr.message });
      }
      const relayerKey = process.env.RELAYER_PRIVATE_KEY;

      if (!relayerKey) {
        logger.error("⏰ [SCHEDULER WORKER] RELAYER_PRIVATE_KEY not set in .env");
        return;
      }

      const relayer = new ethers.Wallet(relayerKey, provider);
      const contractData = getContractData();
      const contract = new ethers.Contract(contractData.address, contractData.abi, relayer);

      for (const payment of duePayments) {
        try {
          let meta;
          let paymentId;
          try {
            meta = JSON.parse(payment.raw_signed_tx);
            if (meta?.type === 'paymentManager' && meta?.paymentId) {
              paymentId = meta.paymentId;
              // Repair missing fundingTx from old recovery code
              if (payment.tx_hash?.startsWith('0x') && !meta.fundingTx) {
                const fixed = JSON.stringify({ type: 'paymentManager', paymentId, fundingTx: payment.tx_hash });
                await sqlUpdateTransfer(payment.id, { raw_signed_tx: fixed });
                logger.info(`⏰ [SCHEDULER WORKER] Repaired fundingTx for ${payment.id}`);
              }
            }
          } catch (e) {
            const raw = String(payment.raw_signed_tx || '').trim();
            if (payment.tx_hash?.startsWith('0x')) {
              // Try recovery for any non-JSON raw_signed_tx that has a tx_hash
              logger.info(`⏰ [SCHEDULER WORKER] Attempting recovery for ${payment.id} from tx ${String(payment.tx_hash).substring(0, 20)}...`);
              try {
                const receipt = await provider.waitForTransaction(payment.tx_hash, 1, 30000);
                if (receipt && receipt.status === 1) {
                  const recoveryContract = new ethers.Contract(contractData.address, contractData.abi, provider);
                  for (const log of receipt.logs) {
                    try {
                      const parsed = recoveryContract.interface.parseLog({ topics: log.topics, data: log.data });
                      if (parsed?.name === 'PaymentCreated') {
                        paymentId = parsed.args.id;
                        const rawSignedTx = JSON.stringify({ type: 'paymentManager', paymentId, fundingTx: payment.tx_hash });
                        await sqlUpdateTransfer(payment.id, { raw_signed_tx: rawSignedTx });
                        logger.info(`⏰ [SCHEDULER WORKER] Recovered paymentId for ${payment.id}: ${String(paymentId).substring(0, 30)}...`);
                        break;
                      }
                    } catch (pl) { continue; }
                  }
                }
              } catch (recoverErr) {
                logger.info(`⏰ [SCHEDULER WORKER] Recovery failed for ${payment.id}: ${recoverErr.message}`);
              }
            }
            if (!paymentId) {
              logger.info(`⏰ [SCHEDULER WORKER] Skipping ${payment.id}: raw=${raw.substring(0, 60)} tx_hash=${String(payment.tx_hash || '').substring(0, 20)}`);
            }
          }
          if (!paymentId) {
            const raw = String(payment.raw_signed_tx || '').trim();
            if (/^0x[a-fA-F0-9]{64}$/.test(raw)) {
              // Use the raw funding tx hash as the paymentId lookup fallback
              paymentId = raw;
            } else {
              logger.info(`⏰ [SCHEDULER WORKER] Cannot determine paymentId for ${payment.id}`);
              continue;
            }
          }

          logger.info(`⏰ [SCHEDULER WORKER] Checking payment ${payment.id} on-chain (paymentId=${(paymentId || '').substring(0, 20)}...)`);
          const onChain = await contract.getPayment(paymentId);
          logger.info(`⏰ [SCHEDULER WORKER] Payment ${payment.id}: on-chain status=${Number(onChain[1])} releaseTime=${Number(onChain[5])} now=${nowSeconds}`);
          const pStatus = Number(onChain[1]);
          const releaseTime = Number(onChain[5]);

          // Check terminal on-chain states FIRST — these take priority even if release time is in the future
          if (pStatus === 2) {
            await sqlUpdateTransfer(payment.id, { status: 'COMPLETED' });
            logger.info(`⏰ [SCHEDULER WORKER] Payment ${payment.id} already released on chain`);
            await createPaymentsRecord(payment, payment.tx_hash);
            continue;
          }

          if (pStatus === 3) {
            // Genuine on-chain cancel — mark CANCELLED so poll loop skips it forever
            let meta3 = {};
            try { meta3 = JSON.parse(payment.raw_signed_tx); } catch { /* keep {} */ }
            const cancelledMeta = meta3?.type === 'paymentManager' && meta3?.paymentId
              ? JSON.stringify({ type: 'paymentManager', paymentId: meta3.paymentId, fundingTx: meta3.fundingTx || undefined, cancelled: true })
              : undefined;
            const updateFields = { status: 'CANCELLED' };
            if (cancelledMeta) updateFields.raw_signed_tx = cancelledMeta;
            await sqlUpdateTransfer(payment.id, updateFields);
            logger.info(`⏰ [SCHEDULER WORKER] Payment ${payment.id} cancelled on chain — marked CANCELLED`);
            continue;
          }

          if (nowSeconds < releaseTime) {
            const remain = releaseTime - nowSeconds;
            logger.info(`⏰ [SCHEDULER WORKER] Payment ${payment.id}: skipping (release in ${Math.round(remain / 60)} min)`);
            continue;
          }

          if (pStatus !== 1) continue;

          if (payment.status === 'FAILED') {
            logger.info(`⏰ [SCHEDULER WORKER] Retrying previously failed payment ${payment.id} (still active on-chain)`);
          }

          logger.info(`⏰ [SCHEDULER WORKER] Releasing payment ${payment.id} (${payment.amount} BOT → ${payment.receiver_pay_tag})`);
          const tx = await contract.release(paymentId);
          const receipt = await tx.wait(1);

          if (receipt.status !== 1) {
            await sqlUpdateTransfer(payment.id, { status: 'FAILED' });
            logger.warn(`⏰ [SCHEDULER WORKER] Payment ${payment.id} release reverted`);
            continue;
          }

          // Stamp the REAL release time (block timestamp of the release tx) onto
          // the row so Activity Logs show when the on-chain release actually
          // mined — not the schedule time, which misled users into thinking no
          // real transaction happened.
          let releasedAt = null;
          try {
            const blk = await provider.getBlock(receipt.blockNumber);
            releasedAt = new Date(Number(blk.timestamp) * 1000).toISOString();
          } catch { /* keep null */ }

          let metaNow = {};
          try { metaNow = JSON.parse(payment.raw_signed_tx) || {}; } catch { metaNow = {}; }

          if (releasedAt) {
            await sqlUpdateTransfer(payment.id, {
              status: 'COMPLETED',
              tx_hash: receipt.hash,
              block_number: receipt.blockNumber,
              raw_signed_tx: JSON.stringify({ ...metaNow, releasedAt })
            });
          } else {
            await sqlUpdateTransfer(payment.id, { status: 'COMPLETED', tx_hash: receipt.hash, block_number: receipt.blockNumber });
          }

          // Create payments record so both sender and receiver see it in Profile activity
          await createPaymentsRecord(payment, receipt.hash);

          logger.info(`✅ [SCHEDULER WORKER] Payment ${payment.id} released. TX: ${receipt.hash}`);
        } catch (singleErr) {
          logger.error(`⏰ [SCHEDULER WORKER] Payment ${payment.id} error:`, singleErr.message);
          await sqlUpdateTransfer(payment.id, { status: 'FAILED' });
        }
      }

      // also listen for PaymentReleased events (catches releases by other callers)
      const contractDataFallback = getContractData();
      const readContract = new ethers.Contract(contractDataFallback.address, [
        {"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"id","type":"bytes32"}],"name":"PaymentReleased","type":"event"},
        {"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"refundAmount","type":"uint256"}],"name":"PaymentCancelled","type":"event"}
      ], provider);

      const currentBlock = await provider.getBlockNumber();
      const fromBlock = lastCheckedBlock !== null ? lastCheckedBlock + 1 : currentBlock - 100;
      logger.info(`⏰ [SCHEDULER WORKER] Event check: blocks ${fromBlock} -> ${currentBlock} (prev=${lastCheckedBlock})`);
      if (fromBlock <= currentBlock) {
        lastCheckedBlock = currentBlock;
        const events = await readContract.queryFilter('PaymentReleased', fromBlock, currentBlock);
        if (events.length > 0) logger.info(`⏰ [SCHEDULER WORKER] Found ${events.length} PaymentReleased event(s) in range`);
        for (const event of events) {
          const eventPaymentId = event.args.id;
          logger.info(`⏰ [SCHEDULER WORKER] PaymentReleased event: id=${String(eventPaymentId).substring(0, 30)}...`);
          const { data: matches } = await supabase
            .from('money_transfers')
            .select('id')
            .eq('status', 'PENDING')
            .not('raw_signed_tx', 'is', null);

          if (!matches) continue;
          for (const record of matches) {
            let meta;
            try { meta = JSON.parse(record.raw_signed_tx); } catch { continue; }
            if (meta?.type === 'paymentManager' && meta?.paymentId?.toLowerCase() === eventPaymentId.toLowerCase()) {
              let relTs = null;
              try { const blk = await provider.getBlock(event.blockNumber); relTs = new Date(Number(blk.timestamp) * 1000).toISOString(); } catch { /* keep null */ }
              if (relTs) {
                await sqlUpdateTransfer(record.id, {
                  status: 'COMPLETED',
                  tx_hash: event.transactionHash,
                  block_number: event.blockNumber,
                  raw_signed_tx: JSON.stringify({ type: 'paymentManager', paymentId: meta.paymentId, fundingTx: meta.fundingTx, releasedAt: relTs })
                });
              } else {
                await sqlUpdateTransfer(record.id, { status: 'COMPLETED', tx_hash: event.transactionHash, block_number: event.blockNumber });
              }
              logger.info(`✅ [SCHEDULER WORKER] Payment ${record.id} completed via event. TX: ${event.transactionHash}`);
            } else {
              logger.info(`⏰ [SCHEDULER WORKER]   No match: rec=${record.id.substring(0, 12)}... metaPID=${(meta?.paymentId || '').substring(0, 20)}... eventPID=${String(eventPaymentId).substring(0, 20)}...`);
            }
          }
        }

        const cancelEvents = await readContract.queryFilter('PaymentCancelled', fromBlock, currentBlock);
        if (cancelEvents.length > 0) logger.info(`⏰ [SCHEDULER WORKER] Found ${cancelEvents.length} PaymentCancelled event(s) in range`);
        for (const event of cancelEvents) {
          const eventPaymentId = event.args.id;
          const { data: matches } = await supabase
            .from('money_transfers')
            .select('id')
            .in('status', ['PENDING'])
            .not('raw_signed_tx', 'is', null);

          if (!matches) continue;
          for (const record of matches) {
            let meta;
            try { meta = JSON.parse(record.raw_signed_tx); } catch { continue; }
            if (meta?.type === 'paymentManager' && meta?.paymentId?.toLowerCase() === eventPaymentId.toLowerCase()) {
              await sqlUpdateTransfer(record.id, { status: 'CANCELLED', tx_hash: event.transactionHash });
              logger.info(`✅ [SCHEDULER WORKER] Payment ${record.id} cancelled via event. TX: ${event.transactionHash}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error("[SCHEDULER WORKER] Loop error:", err.message);
    }
  }, POLL_INTERVAL_MS);
};
