import { supabase } from '../config/supabaseClient.js';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { getProvider } from '../services/chainRpcService.js';
import logger from '../utils/logger.js';
import { getPool } from '../utils/db.js';
function getContractData() {
  const filePath = path.resolve('globalPayData.json');
  if (!fs.existsSync(filePath)) {
    return {
      address: process.env.GLOBAL_PAY_MANAGER_ADDRESS || "0x775Ab463A19E51072C61bAe94A0931E00F7caa42",
      abi: [
        {"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":true,"internalType":"uint8","name":"pType","type":"uint8"},{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"address","name":"receiver","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"releaseTime","type":"uint256"}],"name":"PaymentCreated","type":"event"}
      ]
    };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export const storeContractFunding = async (req, res) => {
  try {
    const { transferId, txHash } = req.body;
    const userId = req.user.id;

    if (!transferId || !txHash) {
      return res.status(400).json({ message: "transferId and txHash are required" });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('money_transfers')
      .select('id, sender_id, status, raw_signed_tx')
      .eq('id', transferId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    if (existing.sender_id !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ message: "Transfer is not in PENDING state" });
    }

    const provider = getProvider();
    const receipt = await provider.waitForTransaction(txHash, 2, 60000);

    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ message: "Transaction failed or not found on chain" });
    }

    const contractData = getContractData();
    const contract = new ethers.Contract(contractData.address, contractData.abi, provider);

    let contractPaymentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'PaymentCreated') {
          contractPaymentId = parsed.args.id;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (contractPaymentId === null) {
      return res.status(400).json({ message: "Could not find PaymentCreated event in transaction logs" });
    }

    let originalMeta = {};
    try {
      originalMeta = existing.raw_signed_tx ? JSON.parse(existing.raw_signed_tx) : {};
    } catch { originalMeta = {}; }
    const rawSignedTx = JSON.stringify({
      ...originalMeta,
      type: 'paymentManager',
      paymentId: contractPaymentId,
      fundingTx: txHash
    });

    // Use direct SQL for this critical write. PostgREST can silently return
    // zero updated rows when the service key is downgraded by RLS.
    const updateResult = await getPool().query(
      `UPDATE money_transfers
       SET raw_signed_tx = $1, tx_hash = $2
       WHERE id = $3 AND sender_id = $4 AND status = 'PENDING'`,
      [rawSignedTx, txHash, transferId, userId]
    );
    if (updateResult.rowCount !== 1) {
      throw new Error('Scheduled payment was confirmed on-chain but could not be recorded in the transaction history');
    }

    return res.status(200).json({
      message: `Funds locked in GlobalPay Manager. Payment will auto-release at the scheduled time.`,
      paymentId: contractPaymentId
    });
  } catch (error) {
    logger.error("storeContractFunding error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const cancelContractFunding = async (req, res) => {
  try {
    const { transferId, cancelTxHash } = req.body;
    const userId = req.user.id;

    if (!transferId || !cancelTxHash) {
      return res.status(400).json({ message: "transferId and cancelTxHash are required" });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('money_transfers')
      .select('id, sender_id, status, raw_signed_tx')
      .eq('id', transferId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    if (existing.sender_id !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Allow FAILED as well: a transient release failure leaves the payment still
    // active on-chain (funds locked), so the sender can still cancel it. The
    // on-chain PaymentCancelled event check below is the real authority.
    if (!['PENDING', 'FUNDED', 'FAILED'].includes(existing.status)) {
      return res.status(400).json({ message: "Transfer is not in a cancellable state" });
    }

    let meta;
    try { meta = JSON.parse(existing.raw_signed_tx); } catch { meta = null; }
    if (!meta || meta.type !== 'paymentManager' || !meta.paymentId) {
      return res.status(400).json({ message: "Not a scheduled payment" });
    }

    const provider = getProvider();
    const receipt = await provider.waitForTransaction(cancelTxHash, 2, 60000);

    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ message: "Cancel transaction failed or not found on chain" });
    }

    const cancelIface = new ethers.Interface([
      'event PaymentCancelled(bytes32 indexed id, uint256 refundAmount)'
    ]);

    let cancelledId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = cancelIface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'PaymentCancelled' && parsed.args.id.toLowerCase() === meta.paymentId.toLowerCase()) {
          cancelledId = parsed.args.id;
          break;
        }
      } catch { continue; }
    }

    if (!cancelledId) {
      return res.status(400).json({ message: "Could not find PaymentCancelled event matching this payment in transaction logs" });
    }

    let metaExisting = {};
    try { metaExisting = JSON.parse(existing.raw_signed_tx) || {}; } catch { /* keep {} */ }
    const updatedRaw = JSON.stringify({
      ...(metaExisting?.type === 'paymentManager' ? metaExisting : { type: 'paymentManager', paymentId: meta.paymentId }),
      cancelled: true
    });

    const { error: updateErr } = await supabase
      .from('money_transfers')
      .update({ status: 'FAILED', tx_hash: cancelTxHash, raw_signed_tx: updatedRaw })
      .eq('id', transferId);

    if (updateErr) throw updateErr;

    return res.status(200).json({ message: "Scheduled payment cancelled successfully" });
  } catch (error) {
    logger.error("cancelContractFunding error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const failContractFunding = async (req, res) => {
  try {
    const { transferId } = req.body;
    const userId = req.user.id;

    if (!transferId) {
      return res.status(400).json({ message: "transferId is required" });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('money_transfers')
      .select('id, sender_id, status')
      .eq('id', transferId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    if (existing.sender_id !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ message: "Transfer is not in PENDING state" });
    }

    const { error: updateErr } = await supabase
      .from('money_transfers')
      .update({ status: 'FAILED' })
      .eq('id', transferId);

    if (updateErr) throw updateErr;

    return res.status(200).json({ message: "Pending schedule marked as failed" });
  } catch (error) {
    logger.error("failContractFunding error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const releaseClaimedSchedule = async (req, res) => {
  try {
    const { transferId, txHash } = req.body;
    const userId = req.user.id;

    if (!transferId || !txHash) {
      return res.status(400).json({ message: "transferId and txHash are required" });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('money_transfers')
      .select('id, status, sender_id')
      .eq('id', transferId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    // IDOR fix: only the sender may claim/release their own schedule.
    if (String(existing.sender_id) !== String(userId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ message: "Transfer is not in PENDING state" });
    }

    const { data: transfer, error: fetchDetailErr } = await supabase
      .from('money_transfers')
      .select('*')
      .eq('id', transferId)
      .single();

    if (fetchDetailErr || !transfer) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    const { error: updateErr } = await supabase
      .from('money_transfers')
      .update({ status: 'COMPLETED', tx_hash: txHash })
      .eq('id', transferId);

    if (updateErr) throw updateErr;

    // Create payments record so both sender and receiver see it in Profile activity
    await supabase.from('payments').insert({
      sender_id: transfer.sender_id,
      sender_pay_tag: transfer.sender_pay_tag,
      receiver_id: transfer.receiver_id,
      amount: transfer.amount,
      bot_amount_snapshot: transfer.bot_amount || transfer.amount,
      coin: 'USDC',
      tx_hash: txHash,
      recipient_pay_tag: transfer.receiver_pay_tag,
      keyword: 'Scheduled Payment (Released)',
      sender_wallet_type: transfer.sender_wallet_type || 'external',
      receiving_wallet_type: transfer.receiving_wallet_type || 'internal',
      destination_address: transfer.destination_address || transfer.receiver_wallet_address,
      sender_wallet_address: transfer.sender_wallet_address || null,
      receiver_wallet_address: transfer.receiver_wallet_address || null,
      created_at: new Date().toISOString()
    }).select().maybeSingle();

    return res.status(200).json({ message: "Schedule claimed and released successfully" });
  } catch (error) {
    logger.error("releaseClaimedSchedule error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};

export const recoverStuckFunding = async (req, res) => {
  try {
    const { transferId, txHash } = req.body;
    const userId = req.user.id;
    if (!transferId || !txHash) {
      return res.status(400).json({ message: "transferId and txHash are required" });
    }

    // IDOR fix: only the sender may recover their own schedule.
    const { data: existingTransfer, error: fetchErr } = await supabase
      .from('money_transfers')
      .select('id, sender_id')
      .eq('id', transferId)
      .single();
    if (fetchErr || !existingTransfer) {
      return res.status(404).json({ message: "Transfer not found" });
    }
    if (String(existingTransfer.sender_id) !== String(userId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Verify on-chain
    const provider = getProvider();
    const receipt = await provider.waitForTransaction(txHash, 1, 30000);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ message: "Transaction not found or reverted on chain" });
    }
    const contractData = getContractData();
    const contract = new ethers.Contract(contractData.address, contractData.abi, provider);
    let contractPaymentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'PaymentCreated') {
          contractPaymentId = parsed.args.id;
          break;
        }
      } catch (e) { continue; }
    }
    if (!contractPaymentId) {
      return res.status(400).json({ message: "No PaymentCreated event found in tx logs" });
    }
    const rawSignedTx = JSON.stringify({ type: 'paymentManager', paymentId: contractPaymentId, fundingTx: txHash });
    const { error: updateErr } = await supabase
      .from('money_transfers')
      .update({ raw_signed_tx: rawSignedTx, tx_hash: txHash })
      .eq('id', transferId);
    if (updateErr) throw updateErr;
    return res.status(200).json({ message: "Schedule recovered successfully", paymentId: contractPaymentId });
  } catch (error) {
    logger.error("recoverStuckFunding error:", error.message);
    return res.status(500).json({ message: error.message });
  }
};
