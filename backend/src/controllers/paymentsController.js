import { supabase } from "../config/supabaseClient.js";
import logger from '../utils/logger.js';
// Helper mapper to preserve Mongoose output contract for the frontend
const mapPaymentToMongoose = (p) => {
  if (!p) return null;
  return {
    _id: p.id,
    id: p.id,
    date: p.created_at,
    toUPI: p.recipient_pay_tag,
    keyword: p.keyword || "",
    amount: Number(p.amount),
    sender: p.sender ? {
      _id: p.sender.id,
      id: p.sender.id,
      globalPayTag: p.sender.global_pay_tag,
      upiId: p.sender.global_pay_tag,
      email: p.sender.email,
      name: p.sender.name,
      internalWalletAddress: p.sender.internal_wallet_address,
      metamaskId: p.sender.metamask_id
    } : p.sender_id,
    receiver: p.receiver ? {
      _id: p.receiver.id,
      id: p.receiver.id,
      globalPayTag: p.receiver.global_pay_tag,
      upiId: p.receiver.global_pay_tag,
      email: p.receiver.email,
      name: p.receiver.name,
      internalWalletAddress: p.receiver.internal_wallet_address,
      metamaskId: p.receiver.metamask_id
    } : p.receiver_id,
    coin: p.coin,
    txHash: p.tx_hash,
    requestedAmount: p.requested_amount,
    requestedCurrency: p.requested_currency,
    exchangeRateSnapshot: p.exchange_rate_snapshot,
    botPriceSnapshot: p.bot_price_snapshot,
    botAmountSnapshot: p.bot_amount_snapshot,
    receivingWalletType: p.receiving_wallet_type,
    senderWalletType: p.sender_wallet_type,
    destinationAddress: p.destination_address,
    senderWalletAddress: p.sender_wallet_address,
    receiverWalletAddress: p.receiver_wallet_address
  };
};

// Write a new payment with Base Sepolia On-Chain Verification
export const paymentsWrite = async (req, res) => {
  try {
    const {
      date,
      to,
      keyword,
      amt,
      coin,
      txHash,
      requestedAmount,
      requestedCurrency,
      exchangeRateSnapshot,
      botPriceSnapshot,
      botAmountSnapshot,
      receivingWalletType,
      destinationAddress,
      reqId
    } = req.body;

    const sender = req.user && req.user.id;
    if (!sender) return res.status(401).json({ message: "Unauthorized: missing user" });

    const finalAmt = (amt !== undefined && amt !== null && !isNaN(Number(amt)))
      ? Number(amt)
      : Number(requestedAmount || botAmountSnapshot || 0);

    if (!to || finalAmt < 0) return res.status(400).json({ message: "Missing or invalid payment parameters" });
    const finalCoin = (coin && String(coin).trim()) ? String(coin).trim() : "USDC";

    // 1. Resolve receiver / merchant user in Supabase
    let receiverUser = null;

    if (reqId) {
      try {
        const { data: reqMoneyItem } = await supabase
          .from('request_money')
          .select('*')
          .eq('id', reqId)
          .maybeSingle();

        if (!reqMoneyItem) {
          return res.status(404).json({ message: "Invoice request not found" });
        }

        if (reqMoneyItem.status !== 'Pending') {
          return res.status(400).json({ message: `Invoice request is already ${reqMoneyItem.status} and cannot be paid.` });
        }

        if (reqMoneyItem.user_id) {
          const { data: recUser } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', reqMoneyItem.user_id)
            .single();
          receiverUser = recUser;
        }
      } catch (reqErr) {
        logger.warn("reqId resolution warning:", reqErr.message);
        return res.status(400).json({ message: "Invalid request ID: " + reqErr.message });
      }
    }

    if (!receiverUser && to) {
      const cleanTag = String(to).replace(/^@/, '').trim();
      const tagWithAt = `@${cleanTag}`;

      try {
        // Try each tag format individually to avoid .or() parsing issues with @
        for (const tag of [to, cleanTag, tagWithAt]) {
          if (!tag) continue;
          const { data: r } = await supabase
            .from('profiles')
            .select('*')
            .eq('global_pay_tag', tag)
            .maybeSingle();
          if (r) { receiverUser = r; break; }
        }
        if (!receiverUser) {
          const { data: r } = await supabase
            .from('profiles')
            .select('*')
            .or(`email.eq.${to},email.eq.${cleanTag}`)
            .maybeSingle();
          if (r) receiverUser = r;
        }
        if (!receiverUser) {
          const { data: r } = await supabase
            .from('profiles')
            .select('*')
            .ilike('name', cleanTag)
            .maybeSingle();
          if (r) receiverUser = r;
        }
      } catch (findErr) {
        logger.warn("Receiver search query warning:", findErr.message);
      }
    }

    if (!receiverUser && to) {
      const cleanTag = String(to).replace(/^@/, '').trim();
      try {
        let reqRecord = null;
        for (const tag of [to, cleanTag, `@${cleanTag}`]) {
          if (!tag) continue;
          const { data: r } = await supabase
            .from('request_money')
            .select('user_id')
            .eq('upi', tag)
            .maybeSingle();
          if (r) { reqRecord = r; break; }
        }
        if (!reqRecord) {
          const { data: r } = await supabase
            .from('request_money')
            .select('user_id')
            .eq('metamask', to)
            .maybeSingle();
          reqRecord = r;
        }
        if (reqRecord?.user_id) {
          const { data: recUser } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', reqRecord.user_id)
            .single();
          receiverUser = recUser;
        }
      } catch (e) { }
    }

    // Fourth attempt: resolve by destination wallet address (QR payments embed the wallet)
    if (!receiverUser && destinationAddress && String(destinationAddress).startsWith('0x')) {
      try {
        const { data: addrUser } = await supabase
          .from('profiles')
          .select('*')
          .or(`metamask_id.eq.${destinationAddress},internal_wallet_address.eq.${destinationAddress}`)
          .maybeSingle();
        receiverUser = addrUser;
      } catch (e) { }
    }

    if (receiverUser && sender === receiverUser.id) {
      return res.status(400).json({ message: "You cannot pay yourself." });
    }

    // 2. Ensure a valid Base Sepolia 0x... TxHash is verified
    let finalTxHash = txHash;

    if (!finalTxHash || typeof finalTxHash !== 'string' || !finalTxHash.startsWith("0x")) {
      return res.status(400).json({ message: "Transaction hash (txHash) is required for client-signed MPC payments." });
    }

    // ✅ SECURITY: Prevent transaction replay — reject duplicate txHash
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('tx_hash', finalTxHash)
      .maybeSingle();
    if (existingPayment) {
      return res.status(409).json({ message: "Transaction already recorded. Duplicate payment prevented." });
    }
    const { data: existingTransfer } = await supabase
      .from('money_transfers')
      .select('id')
      .eq('tx_hash', finalTxHash)
      .maybeSingle();
    if (existingTransfer) {
      return res.status(409).json({ message: "Transaction already recorded. Duplicate payment prevented." });
    }

    const { data: senderUser } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sender)
      .single();

    if (!senderUser) return res.status(400).json({ message: "Sender profile unavailable" });

    const clientSenderWallet = (req.body.senderWalletType && String(req.body.senderWalletType).toLowerCase().includes('external'))
      ? "external"
      : "internal";

    let finalSenderAddress = (clientSenderWallet === 'external')
      ? (senderUser?.metamask_id || senderUser?.external_wallet || null)
      : (senderUser?.internal_wallet_address || null);

    const finalSenderWallet = (senderUser && finalSenderAddress && String(finalSenderAddress).toLowerCase() === String(senderUser.internal_wallet_address).toLowerCase())
      ? "internal"
      : "external";

    const clientReceivingWallet = (receiverUser && receiverUser.primary_receiving_wallet)
      ? String(receiverUser.primary_receiving_wallet).toLowerCase()
      : ((receivingWalletType && String(receivingWalletType).toLowerCase().includes('external')) ? "external" : "internal");

    const recipientWeb3Wallet = receiverUser ? (receiverUser.metamask_id || receiverUser.external_wallet) : null;
    let finalDestinationAddress = (clientReceivingWallet === 'external' && recipientWeb3Wallet)
      ? recipientWeb3Wallet
      : (receiverUser ? receiverUser.internal_wallet_address : (destinationAddress || null));

    const finalReceivingWallet = (receiverUser && finalDestinationAddress && String(finalDestinationAddress).toLowerCase() === String(receiverUser.internal_wallet_address).toLowerCase())
      ? "internal"
      : "external";

    // Verify on-chain transfer logs (poll for mining — a freshly broadcast
    // client-signed tx may not have a receipt for several seconds, and aborting
    // here would drop the transaction from the Activity Log entirely).
    try {
      const { ethers } = await import('ethers');
      const rpcUrl = process.env.RPC_URL || process.env.BASE_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org";
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      const MAX_ATTEMPTS = 20;
      const RETRY_DELAY_MS = 1500;
      let receipt = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          receipt = await provider.getTransactionReceipt(finalTxHash);
        } catch (rpcErr) {
          receipt = null;
        }
        if (receipt) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      if (!receipt || receipt.status !== 1) {
        return res.status(400).json({
          message: receipt && receipt.status !== 1
            ? "Transaction failed on-chain (reverted)."
            : "Transaction receipt not found on-chain yet. If you just approved this payment, the transaction may still be mining — please wait a moment and view your Activity Log, or retry after it confirms."
        });
      }

      const txData = await provider.getTransaction(finalTxHash);
      if (!txData) {
        return res.status(400).json({ message: "Transaction data not found on-chain." });
      }

      // Check recipient address
      if (!finalDestinationAddress) {
        return res.status(400).json({ message: "No destination address provided for payment verification." });
      }
      const expectedReceiver = finalDestinationAddress;
      if (String(txData.to).toLowerCase() !== String(expectedReceiver).toLowerCase()) {
        return res.status(400).json({ message: `Recipient address mismatch. Expected: ${expectedReceiver}, Found: ${txData.to}` });
      }
    } catch (blockchainErr) {
      logger.error("⚠️ Base Sepolia RPC payment verify error:", blockchainErr.message);
      return res.status(400).json({ message: "Failed to verify transaction on-chain: " + blockchainErr.message });
    }

    // 4. Perform Treasury Settlement (non-critical — best effort)
    const rate = Number(exchangeRateSnapshot) || 83.5;
    const bPrice = Number(botPriceSnapshot) || 9.72;
    const botPaid = botAmountSnapshot ? Number(botAmountSnapshot) : (Number(amt) / rate / bPrice);

    let localFiatSettled = 0;
    let usdFiatSettled = 0;

    if (requestedAmount && Number(requestedAmount) > 0) {
      localFiatSettled = Number(requestedAmount);
      usdFiatSettled = parseFloat((localFiatSettled / rate).toFixed(2));
    } else {
      usdFiatSettled = parseFloat(((botPaid > 0 ? botPaid : finalAmt) * bPrice).toFixed(2));
      localFiatSettled = parseFloat((usdFiatSettled * rate).toFixed(2));
    }

    if (receiverUser) {
      try {
        let { data: receiverBank } = await supabase
          .from('bank_details')
          .select('*')
          .eq('user_id', receiverUser.id)
          .maybeSingle();

        if (!receiverBank) {
          const fallbackUpi = receiverUser.global_pay_tag || `upi_${receiverUser.id}_${Date.now()}`;
          const { data: newBank } = await supabase
            .from('bank_details')
            .insert({
              user_id: receiverUser.id,
              bank_name: "Linked Bank",
              ifsc_code: "GLOBAL001",
              account_holder: receiverUser.name || "Merchant Account",
              account_address: "GlobalPay Registered Account",
              account_type: "savings",
              amount: 0,
              global_pay_tag: fallbackUpi,
              region: receiverUser.region || "India"
            })
            .select()
            .single();
          receiverBank = newBank;
        }

        const newBal = Number(receiverBank.amount || 0) + localFiatSettled;
        await supabase
          .from('bank_details')
          .update({ amount: newBal })
          .eq('id', receiverBank.id);
      } catch (bankErr) {
        logger.warn("⚠️ Non-critical BankDetails update note:", bankErr.message);
      }
    }

    // 5. Create MoneyTransfer record for Activity Log (non-critical — but the log
    // must not silently vanish when the PostgREST gateway degrades, so fall
    // back to direct SQL if the gateway insert fails).
    let rUPI = to;
    try {
      const sUPI = (senderUser && senderUser.global_pay_tag) || "GlobalPay Customer";
      rUPI = (receiverUser && receiverUser.global_pay_tag) || to;

      const mtRow = {
        sender_id: sender,
        sender_pay_tag: sUPI,
        receiver_id: receiverUser ? receiverUser.id : sender,
        receiver_pay_tag: rUPI,
        amount: finalAmt > 0 ? finalAmt : botPaid,
        network: 'base-sepolia',
        tx_hash: finalTxHash,
        status: 'COMPLETED',
        usd_equivalent: usdFiatSettled,
        local_equivalent: localFiatSettled,
        local_currency: requestedCurrency || 'INR',
        transfer_rail: 'crypto',
        sender_wallet_type: finalSenderWallet,
        sender_wallet_address: finalSenderAddress,
        receiving_wallet_type: finalReceivingWallet,
        receiver_wallet_address: finalDestinationAddress,
        destination_address: finalDestinationAddress,
        bot_amount: finalAmt > 0 ? finalAmt : botPaid,
        exchange_rate: rate,
        bot_price: bPrice
      };

      const { error: mtErr } = await supabase
        .from('money_transfers')
        .insert(mtRow);

      if (mtErr) {
        logger.warn("⚠️ MoneyTransfer gateway insert failed — retrying with direct SQL:", mtErr.message);
        const { getPool } = await import('../utils/db.js');
        const pool = getPool();
        const cols = Object.keys(mtRow);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(
          `insert into money_transfers (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders})`,
          cols.map((c) => mtRow[c])
        );
      }
    } catch (mtErr) {
      logger.warn("⚠️ Non-critical MoneyTransfer log note:", mtErr.message);
    }

    // 6. Create Payments record (non-critical — RLS may block, tx is already on-chain)
    let newPayment = null;
    try {
      const { data: pData, error: pErr } = await supabase
        .from('payments')
        .insert({
          recipient_pay_tag: to,
          keyword: keyword || "",
          amount: finalAmt,
          sender_id: sender,
          receiver_id: receiverUser ? receiverUser.id : null,
          coin: finalCoin,
          tx_hash: finalTxHash,
          requested_amount: requestedAmount ? Number(requestedAmount) : null,
          requested_currency: requestedCurrency || null,
          exchange_rate_snapshot: exchangeRateSnapshot ? Number(exchangeRateSnapshot) : null,
          bot_price_snapshot: botPriceSnapshot ? Number(botPriceSnapshot) : null,
          bot_amount_snapshot: botAmountSnapshot ? Number(botAmountSnapshot) : null,
          receiving_wallet_type: finalReceivingWallet,
          sender_wallet_type: finalSenderWallet,
          destination_address: finalDestinationAddress,
          sender_wallet_address: finalSenderAddress,
          receiver_wallet_address: finalDestinationAddress
        })
        .select()
        .single();
      if (!pErr) newPayment = pData;
      else logger.warn("⚠️ Non-critical Payments insert note:", pErr.message);
    } catch (pErr) {
      logger.warn("⚠️ Non-critical Payments insert error:", pErr.message);
    }

    if (reqId) {
      const { data: updatedReqs, error: updateErr } = await supabase
        .from('request_money')
        .update({ status: 'Paid' })
        .eq('id', reqId)
        .eq('status', 'Pending')
        .select();

      if (updateErr || !updatedReqs || updatedReqs.length === 0) {
        return res.status(400).json({ message: "Invoice request already paid, expired, or failed to update." });
      }
    }

    const treasurySettlement = {
      completed: true,
      botPaid: parseFloat((finalAmt > 0 ? finalAmt : botPaid).toFixed(4)),
      usdSettled: usdFiatSettled,
      localSettled: localFiatSettled,
      localCurrency: requestedCurrency || 'INR',
      receiverUpi: rUPI,
      txHash: finalTxHash
    };

    return res.status(201).json({
      ...(newPayment ? mapPaymentToMongoose(newPayment) : { txHash: finalTxHash, amount: finalAmt }),
      txHash: finalTxHash,
      treasurySettlement
    });
  } catch (error) {
    logger.error("Payments Write Error:", error);
    return res.status(500).json({ message: 'Server error during payment processing' });
  }
};

// Internal Ledger
export const paymentsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*, sender:profiles!payments_sender_id_fkey(*), receiver:profiles!payments_receiver_id_fkey(*)')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const filteredPayments = payments.filter(p => {
      const isSenderInternal = p.sender_id === userId && p.sender_wallet_type === 'internal';
      const isReceiverInternal = p.receiver_id === userId && p.receiving_wallet_type === 'internal';
      return isSenderInternal || isReceiverInternal;
    });

    const mongoosePayments = filteredPayments.map(p => mapPaymentToMongoose(p));
    return res.status(200).json(mongoosePayments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// External Ledger
export const paymentsReadExternal = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*, sender:profiles!payments_sender_id_fkey(*), receiver:profiles!payments_receiver_id_fkey(*)')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const filteredPayments = payments.filter(p => {
      const isSenderExternal = p.sender_id === userId && p.sender_wallet_type === 'external';
      const isReceiverExternal = p.receiver_id === userId && p.receiving_wallet_type === 'external';
      return isSenderExternal || isReceiverExternal;
    });

    const mongoosePayments = filteredPayments.map(p => mapPaymentToMongoose(p));
    return res.status(200).json(mongoosePayments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
