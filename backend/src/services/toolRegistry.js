import { supabase } from '../config/supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from '../utils/boundedFetch.js';
import { getLiveBotPrice } from './liveRateService.js';
import { getProvider } from './chainRpcService.js';
import { ethers } from 'ethers';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import {
  getArcBalance,
  getArcNetworkStatus,
  checkAgentSpendingPolicy,
  createProgrammableEscrow,
  executeNanopayment,
  routeCrosschainUsdc
} from './arcService.js';

/**
 * Tool Definitions for Groq / LLM Tool Calling Architecture
 */
export const toolDefinitions = [
  {
    name: "sendBot",
    description: "Send USDC or crypto tokens to a recipient via PayTag (@username), UPI ID, or wallet address.",
    parameters: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "The PayTag (e.g. @alice) or receiver UPI ID" },
        amount: { type: "number", description: "Amount of USDC tokens to send" },
        currency: { type: "string", description: "Currency code (default USDC)" }
      },
      required: ["recipient", "amount"]
    }
  },
  {
    name: "payMerchant",
    description: "Pay a merchant (e.g., Starbucks, Amazon) using USDC tokens or linked account.",
    parameters: {
      type: "object",
      properties: {
        merchant: { type: "string", description: "Name or UPI ID of the merchant" },
        amount: { type: "number", description: "Amount to pay" },
        coin: { type: "string", description: "Token/Coin used (default USDC)" }
      },
      required: ["merchant", "amount"]
    }
  },
  {
    name: "payQR",
    description: "Pay a QR code string, merchant QR payload, or payment barcode.",
    parameters: {
      type: "object",
      properties: {
        qrData: { type: "string", description: "The QR payload, merchant ID, or payment URI" },
        amount: { type: "number", description: "Amount to pay" }
      },
      required: ["qrData"]
    }
  },
  {
    name: "checkBalance",
    description: "Check user's current available fiat bank account balance and USDC vault balance.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "getTransactionHistory",
    description: "Get user's recent transaction activity log and spending history.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of transactions to retrieve" }
      }
    }
  },
  {
    name: "findUser",
    description: "Find a user by PayTag (@username), UPI ID, email, or name.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "PayTag, UPI ID, email, or name to search for" }
      },
      required: ["query"]
    }
  },
  {
    name: "schedulePayment",
    description: "Schedule a future or recurring payment to a recipient.",
    parameters: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "PayTag or UPI ID of recipient" },
        amount: { type: "number", description: "Amount to send" },
        date: { type: "string", description: "Scheduled date/time for payment" },
        note: { type: "string", description: "Optional note or description" }
      },
      required: ["recipient", "amount"]
    }
  },
  {
    name: "createInvoice",
    description: "Create a payment request invoice for a customer or client.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Invoice amount" },
        currency: { type: "string", description: "Currency, e.g. USD, INR, USDC" },
        recipient: { type: "string", description: "Target recipient PayTag or email" },
        note: { type: "string", description: "Invoice description" }
      },
      required: ["amount"]
    }
  },
  {
    name: "getRate",
    description: "Get the current live USDC/USD exchange rate.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "getWallet",
    description: "Show your Internal Vault and External Web3 wallet addresses.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "switchPrimary",
    description: "Switch your primary receiving wallet between Internal Vault and External Web3 wallet.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Target wallet type: 'internal' or 'external'. Omit to auto-toggle." }
      }
    }
  },
  {
    name: "getHelp",
    description: "List all available AI Agent commands with descriptions.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "cancelSchedulePayment",
    description: "Cancel a scheduled payment and refund the locked USDC. Requires a transfer ID or will find the latest one.",
    parameters: {
      type: "object",
      properties: {
        transferId: { type: "string", description: "Optional transfer ID to cancel. Omit to cancel the most recent pending/funded schedule." }
      }
    }
  },
  {
    name: "sendUsdcOnArc",
    description: "Send USDC directly on Arc Testnet (Circle L1 with USDC native gas) to a recipient address or PayTag.",
    parameters: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "Recipient address (0x...) or PayTag (@alice)" },
        amount: { type: "number", description: "Amount of USDC to send" }
      },
      required: ["recipient", "amount"]
    }
  },
  {
    name: "checkArcBalance",
    description: "Check live USDC native gas balance and Arc Testnet network stats.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Optional EVM wallet address to check. Defaults to user primary wallet." }
      }
    }
  },
  {
    name: "createArcEscrow",
    description: "Create a programmable conditional escrow on Arc Testnet for multi-step settlement.",
    parameters: {
      type: "object",
      properties: {
        payeeAddress: { type: "string", description: "Payee EVM address" },
        amountUsdc: { type: "number", description: "Amount of USDC to lock in escrow" },
        milestone: { type: "string", description: "Milestone or condition description" }
      },
      required: ["payeeAddress", "amountUsdc"]
    }
  },
  {
    name: "executeAgentNanopayment",
    description: "Execute an autonomous Agent-to-Agent nanopayment in USDC on Arc for API or service execution.",
    parameters: {
      type: "object",
      properties: {
        recipientAddress: { type: "string", description: "Target agent or API provider address" },
        amountUsdc: { type: "number", description: "Amount of USDC to pay" },
        serviceName: { type: "string", description: "Service or inference job name" }
      },
      required: ["recipientAddress", "amountUsdc"]
    }
  },
  {
    name: "bridgeUsdcViaGateway",
    description: "Bridge USDC from another chain to Arc Testnet via Circle Gateway / CCTP.",
    parameters: {
      type: "object",
      properties: {
        sourceChain: { type: "string", description: "Source chain (e.g., 'ethereum', 'base')" },
        amountUsdc: { type: "number", description: "Amount of USDC to bridge" }
      },
      required: ["sourceChain", "amountUsdc"]
    }
  },
  {
    name: "getAgentSpendingPolicy",
    description: "Inspect the autonomous AI Agent's spending policy, daily budget, and per-transaction limits on Arc.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "AI Agent ID" }
      }
    }
  }
];

/**
 * Execute tool handler functions using Supabase client
 */
const createUserScopedClient = (accessToken) => {
  const url = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!accessToken || !url || !anonKey) return supabase;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` }, fetch: boundedFetch }
  });
};

export const executeTool = async (name, args, user, accessToken, opts = {}) => {
  const userId = user.id;
  const userScopedSupabase = createUserScopedClient(accessToken);
  // Browser-reported timezone offset (minutes WEST of UTC) so the user always
  // sees/plans times in their OWN local timezone (Brazil, NZ, AUS, US, IN, JP, CN...)
  const tzOffsetMinutes = Number(opts?.timezoneOffset) || 0;

  switch (name) {
    case "sendBot": {
      const { recipient, amount, currency = "USDC" } = args;
      if (!recipient || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return { tool: "sendBot", success: false, message: "❌ Include a valid recipient and an amount greater than zero." };
      }
      const cleanTag = recipient.replace(/^@/, '').trim();
      const tagWithAt = `@${cleanTag}`;

      // Resolve receiver user profile — try multiple strategies
      let receiverUser = null;
      let lookupErr = null;

      // Strategy 1: by global_pay_tag (try each format individually to avoid .or() parsing issues with @)
      for (const tag of [recipient, cleanTag, tagWithAt]) {
        if (!tag) continue;
        logger.info(`sendBot lookup: profiles.global_pay_tag eq "${tag}"`);
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('global_pay_tag', tag)
          .maybeSingle();
        logger.info(`sendBot lookup result:`, data ? `found ${data.name} (${data.global_pay_tag})` : 'not found');
        if (data) { receiverUser = data; break; }
      }

      // Strategy 2: by email
      if (!receiverUser) {
        const { data: r2 } = await supabase
          .from('profiles')
          .select('*')
          .or(`email.eq.${recipient},email.eq.${cleanTag}`)
          .maybeSingle();
        if (r2) receiverUser = r2;
        else lookupErr = r2 ? null : lookupErr;
      }

      // Strategy 3: by name (case-insensitive)
      if (!receiverUser) {
        const { data: r3 } = await supabase
          .from('profiles')
          .select('*')
          .ilike('name', cleanTag)
          .maybeSingle();
        if (r3) receiverUser = r3;
      }

      // Strategy 4: lookup user_id from bank_details by global_pay_tag
      if (!receiverUser) {
        for (const tag of [recipient, cleanTag, tagWithAt]) {
          if (!tag) continue;
          const { data: bankUser } = await supabase
            .from('bank_details')
            .select('user_id')
            .eq('global_pay_tag', tag)
            .maybeSingle();
          if (bankUser?.user_id) {
            const { data: r4 } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', bankUser.user_id)
              .maybeSingle();
            if (r4) { receiverUser = r4; break; }
          }
        }
      }

      if (!receiverUser) {
        logger.error(`sendBot lookup failed for ${recipient}:`, lookupErr?.message, { cleanTag, tagWithAt });
        return { tool: "sendBot", success: false, message: `❌ No user found with that paytag, email, or wallet address.` };
      }

      const { data: senderUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const isExternalReceiver = String(receiverUser?.primary_receiving_wallet).toLowerCase() === 'external';
      const extAddr = receiverUser?.metamask_id || receiverUser?.external_wallet;
      const targetAddress = (isExternalReceiver && extAddr)
        ? extAddr
        : receiverUser?.internal_wallet_address || extAddr;
      if (!targetAddress) {
        return { tool: "sendBot", success: false, message: `❌ Recipient ${recipient} does not have a payable wallet.` };
      }
      return {
        tool: "sendBot",
        success: true,
        actionRequired: true,
        action: {
          recipient: receiverUser.global_pay_tag || recipient,
          targetAddress,
          amount: Number(amount),
          currency
        },
        message: `Ready to send ${Number(amount)} ${currency} to ${receiverUser.global_pay_tag || recipient}. Review the details and choose your wallet below.`
      };
    }

    case "payMerchant": {
      return { tool: "payMerchant", success: false, message: "🔐 Merchant payments must be approved from your connected wallet in the Pay screen." };
    }

    case "payQR": {
      return { tool: "payQR", success: false, message: "🔐 QR payments must be approved from your connected wallet in the Pay screen." };
    }

    case "checkBalance": {
      const { data: bankDetails } = await supabase
        .from('bank_details')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: userObj } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const fiatAmount = bankDetails ? Number(bankDetails.amount || 0) : 0;
      const region = bankDetails ? bankDetails.region || 'India' : 'India';

      const currencyMap = { India: 'INR', Brazil: 'BRL', Mexico: 'MXN', France: 'EUR' };
      const currencySymbolMap = { India: '₹', Brazil: 'R$', Mexico: 'MX$', France: '€' };

      const currSymbol = currencySymbolMap[region] || '₹';

      let internalBotBal = 0;
      let externalBotBal = 0;

      try {
        const { ethers } = await import('ethers');
        const rpcUrl = process.env.ARC_RPC_URL || process.env.RPC_URL || "https://rpc.testnet.arc.io";
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        if (userObj?.internal_wallet_address) {
          const rawInt = await provider.getBalance(userObj.internal_wallet_address);
          internalBotBal = parseFloat(ethers.formatUnits(rawInt, 18));
        }

        if (userObj?.metamask_id && userObj.metamask_id.startsWith('0x')) {
          const rawExt = await provider.getBalance(userObj.metamask_id);
          externalBotBal = parseFloat(ethers.formatUnits(rawExt, 18));
        }
      } catch (err) {
        logger.error("Tool checkBalance RPC Error:", err.message);
        internalBotBal = bankDetails?.usdc_balance || 0;
      }

      let usdcPrice = 1.00;
      try {
        usdcPrice = await getLiveBotPrice();
      } catch (e) { }

      const totalUsdcBal = internalBotBal + externalBotBal;
      const totalUsd = (totalUsdcBal * usdcPrice).toFixed(2);
      const internalUsd = (internalBotBal * usdcPrice).toFixed(2);

      let msg = `🤖 Arc Chain Balances:\n`;
      msg += `🏦 Internal Vault: ${internalBotBal.toFixed(4)} USDC (≈ $${internalUsd} USD)\n`;

      if (userObj?.metamask_id && userObj.metamask_id !== 'Not Connected') {
        const externalUsd = (externalBotBal * usdcPrice).toFixed(2);
        msg += `🔗 External Web3 Wallet: ${externalBotBal.toFixed(4)} USDC (≈ $${externalUsd} USD)\n`;
      }

      msg += `💎 Total On-Chain Balance: ${totalUsdcBal.toFixed(4)} USDC (≈ $${totalUsd} USD)`;

      return {
        tool: "checkBalance",
        success: true,
        totalBotBalance: totalUsdcBal,
        internalBotBalance: internalBotBal,
        externalBotBalance: externalBotBal,
        botPrice: usdcPrice,
        message: msg
      };
    }

    case "getTransactionHistory": {
      const { limit = 5 } = args;

      // Query transfers and payments concurrently
      const [transfersRes, paymentsRes] = await Promise.all([
        supabase
          .from('money_transfers')
          .select('*')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('payments')
          .select('*')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(limit)
      ]);

      const transfers = transfersRes.data || [];
      const payments = paymentsRes.data || [];

      let allTxs = [
        ...transfers.map(t => ({
          _id: t.id,
          sender: t.sender_id,
          receiver: t.receiver_id,
          senderUPI: t.sender_pay_tag,
          receiverUPI: t.receiver_pay_tag,
          amount: t.bot_amount || t.amount || 0,
          coin: 'USDC',
          txHash: t.tx_hash,
          date: t.created_at
        })),
        ...payments.map(p => ({
          _id: p.id,
          sender: p.sender_id,
          senderUPI: p.sender_pay_tag,
          receiverUPI: p.recipient_pay_tag,
          amount: p.bot_amount_snapshot || p.amount || 0,
          coin: p.coin || 'USDC',
          txHash: p.tx_hash,
          date: p.created_at
        }))
      ];

      // De-duplicate by txHash (transfer version wins since it comes first)
      const seen = new Set();
      allTxs = allTxs.filter(t => {
        const key = t.txHash || String(t._id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Resolve missing sender paytags for payments-table records
      const missingPaytags = allTxs.filter(t => t.sender && !t.senderUPI).map(t => t.sender);
      if (missingPaytags.length > 0) {
        const uniqueIds = [...new Set(missingPaytags)];
        const { data: senderProfiles } = await supabase
          .from('profiles')
          .select('id, global_pay_tag')
          .in('id', uniqueIds);
        const paytagMap = {};
        if (senderProfiles) {
          senderProfiles.forEach(sp => { paytagMap[sp.id] = sp.global_pay_tag; });
        }
        allTxs.forEach(t => {
          if (t.sender && !t.senderUPI && paytagMap[t.sender]) {
            t.senderUPI = paytagMap[t.sender];
          }
        });
      }

      // Sort newest first (handle null dates safely)
      allTxs.sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      });
      const sliced = allTxs.slice(0, Number(limit));

      if (sliced.length === 0) {
        return {
          tool: "getTransactionHistory",
          success: true,
          count: 0,
          history: [],
          message: "📜 No recent transaction history found."
        };
      }

      const explorerUrl = process.env.ARC_EXPLORER_URL || process.env.EXPLORER_URL || "https://testnet.arcscan.app";
      // The chat bubble renders links itself but does not parse Markdown
      // emphasis. Keep transaction history as clean plain text so users do
      // not see literal ** and * markers.
      let msg = `📜 Recent Transactions (${sliced.length}):\n`;

      sliced.forEach((tx, i) => {
        const isSender = String(tx.sender) === String(userId);
        const icon = isSender ? '💸' : '📥';
        const direction = isSender ? `To ${tx.receiverUPI || 'Recipient'}` : `From ${tx.senderUPI || 'Sender'}`;
        const amountStr = `${Number(tx.amount).toFixed(4)} ${tx.coin || 'USDC'}`;
        const dateStr = new Date(tx.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const scheduledLabel = tx.txHash && tx.sender && tx.receiver ? ' • Scheduled / locked' : '';
        msg += `\n${i + 1}. ${icon} ${amountStr} (${direction})${scheduledLabel} • ${dateStr}`;
        if (tx.txHash) {
          msg += `\n    🔗 [ArcScan Verified ↗](${explorerUrl}/tx/${tx.txHash})`;
        }
      });

      return {
        tool: "getTransactionHistory",
        success: true,
        count: sliced.length,
        history: sliced,
        message: msg
      };
    }

    case "findUser": {
      const { query } = args;
      const cleanTag = query.replace(/^@/, '').trim();
      const tagWithAt = `@${cleanTag}`;

      // Try multiple search strategies sequentially for broader matching
      let foundUser = null;

      for (const tag of [tagWithAt, cleanTag, query]) {
        if (!tag) continue;
        logger.info(`findUser: profiles.global_pay_tag eq "${tag}"`);
        const { data } = await supabase
          .from('profiles')
          .select('name, email, global_pay_tag, region, primary_receiving_wallet')
          .eq('global_pay_tag', tag)
          .maybeSingle();
        logger.info(`findUser result:`, data ? `found ${data.name} (${data.global_pay_tag})` : 'not found');
        if (data) { foundUser = data; break; }
      }

      if (!foundUser) {
        for (const emailTag of [query, cleanTag]) {
          if (!emailTag) continue;
          const { data } = await supabase
            .from('profiles')
            .select('name, email, global_pay_tag, region, primary_receiving_wallet')
            .eq('email', emailTag)
            .maybeSingle();
          if (data) { foundUser = data; break; }
        }
      }

      if (!foundUser) {
        const { data } = await supabase
          .from('profiles')
          .select('name, email, global_pay_tag, region, primary_receiving_wallet')
          .ilike('name', `%${cleanTag}%`)
          .maybeSingle();
        foundUser = data;
      }

      // Strategy 4: lookup user_id from bank_details by global_pay_tag
      if (!foundUser) {
        for (const tag of [tagWithAt, cleanTag, query]) {
          if (!tag) continue;
          const { data: bankUser } = await supabase
            .from('bank_details')
            .select('user_id')
            .eq('global_pay_tag', tag)
            .maybeSingle();
          if (bankUser?.user_id) {
            const { data: r4 } = await supabase
              .from('profiles')
              .select('name, email, global_pay_tag, region, primary_receiving_wallet')
              .eq('id', bankUser.user_id)
              .maybeSingle();
            if (r4) { foundUser = r4; break; }
          }
        }
      }

      if (!foundUser) {
        return {
          tool: "findUser",
          success: false,
          message: `🔍 User '${query}' not found on GlobalPay.`
        };
      }

      const walletType = String(foundUser.primary_receiving_wallet || 'internal').toLowerCase() === 'external' ? 'External Web3' : 'Internal Vault';

      return {
        tool: "findUser",
        success: true,
        user: {
          name: foundUser.name,
          payTag: foundUser.global_pay_tag,
          region: foundUser.region || "Global"
        },
        message: `✅ Verified User Found!\n👤 Name: ${foundUser.name}\n🏷️ PayTag: ${foundUser.global_pay_tag}\n📧 Email: ${foundUser.email}\n🌍 Region: ${foundUser.region || 'Global'}\n💳 Receives via: ${walletType}`
      };
    }

    case "schedulePayment": {
      const { recipient, amount, date } = args;

      const { data: senderUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!senderUser?.metamask_id) {
        return { tool: "schedulePayment", success: false, message: "❌ Scheduled Payments are currently available only for external wallets (MetaMask, Rabby, WalletConnect). Connect an external wallet and try again." };
      }

      const senderTag = senderUser?.global_pay_tag || senderUser?.email;
      // Parse the scheduled date. The AI controller already converts the user's
      // local wall-clock into an absolute UTC instant using the browser-sent
      // timezone offset, so treat the ISO string as a fixed point in time —
      // never shift it by this server's timezone (that broke global users).
      const scheduledAt = date
        ? new Date(typeof date === 'string' ? date.trim() : date)
        : new Date(Date.now() + 86400000);

      if (isNaN(scheduledAt.getTime())) {
        return { tool: "schedulePayment", success: false, message: "❌ Invalid date/time format. Try: 'Schedule 5 USDC to @user tomorrow at 3pm'." };
      }

      const cleanTag = recipient.replace(/^@/, '').trim();
      const tagWithAt = `@${cleanTag}`;

      let receiverUser = null;
      for (const tag of [tagWithAt, cleanTag]) {
        if (!tag) continue;
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('global_pay_tag', tag)
          .maybeSingle();
        if (data) { receiverUser = data; break; }
      }

      if (!receiverUser) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .or(`email.eq.${recipient},email.eq.${cleanTag}`)
          .maybeSingle();
        receiverUser = data;
      }

      if (!receiverUser) {
        return { tool: "schedulePayment", success: false, message: `❌ User "${recipient}" not found. Make sure the PayTag or email is correct.` };
      }

      const isExternalReceiver = String(receiverUser?.primary_receiving_wallet).toLowerCase() === 'external';
      const extAddr = receiverUser?.metamask_id || receiverUser?.external_wallet;
      const targetAddress = (isExternalReceiver && extAddr)
        ? extAddr
        : receiverUser?.internal_wallet_address || extAddr;
      if (!targetAddress) {
        return { tool: "schedulePayment", success: false, message: `❌ ${receiverUser.global_pay_tag || recipient} has no wallet address linked. They need to set up their wallet first.` };
      }

      const releaseTime = Math.floor(scheduledAt.getTime() / 1000);

      const { data: scheduledTx, error } = await supabase
        .from('money_transfers')
        .insert({
          sender_id: userId,
          sender_pay_tag: senderTag,
          receiver_id: receiverUser.id,
          receiver_pay_tag: recipient,
          amount: Number(amount),
          network: process.env.NETWORK || 'arc-testnet',
          status: 'PENDING',
          bot_amount: Number(amount),
          created_at: new Date().toISOString(),
          sender_wallet_type: 'external',
          sender_wallet_address: senderUser?.metamask_id || senderUser?.internal_wallet_address || null,
          receiving_wallet_type: isExternalReceiver ? 'external' : 'internal',
          receiver_wallet_address: targetAddress,
          destination_address: targetAddress,
          raw_signed_tx: JSON.stringify({ releaseAt: releaseTime })
        })
        .select()
        .single();

      if (error) throw error;

      const managerAddress = process.env.GLOBAL_PAY_MANAGER_ADDRESS || "0x775Ab463A19E51072C61bAe94A0931E00F7caa42";
      const receiverTag = receiverUser.global_pay_tag || recipient;

      // ---- Fee computation (exact, no hidden charges) ----
      // Sender covers: amount (locked for receiver) + scheduling gas (createScheduled)
      // + release gas (relayer's release() tx). Only these are deducted.
      let releaseFee = '0';
      let schedulingFee = '0';
      let feeTotal = '0';
      let totalDeduct = Number(amount);
      let feeWallet = null;
      try {
        const provider = getProvider();
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 0n;
        const paymentIdHex = ethers.keccak256(ethers.toUtf8Bytes(scheduledTx.id));
        const mgrAbi = ['function createScheduled(bytes32 id, address receiver, uint256 releaseTime) payable'];
        const mgr = new ethers.Contract(managerAddress, mgrAbi, provider);
        const schedGas = await mgr.createScheduled.estimateGas(paymentIdHex, targetAddress, releaseTime, { value: 1n });
        const REL_RELEASE_GAS = 50000n; // observed ~48204
        const schedFeeWei = gasPrice * schedGas;
        const relFeeWei = gasPrice * REL_RELEASE_GAS;
        releaseFee = ethers.formatEther(relFeeWei);
        schedulingFee = ethers.formatEther(schedFeeWei);
        feeTotal = ethers.formatEther(schedFeeWei + relFeeWei);
        totalDeduct = Number(amount) + Number(feeTotal);
        if (process.env.RELAYER_PRIVATE_KEY) {
          feeWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address;
        }
      } catch (feeErr) {
        logger.warn('[schedulePayment] fee estimate failed:', feeErr.message);
      }

      // Render the release time in the USER'S OWN timezone (never the server's),
      // so an Indian/Japanese/Brazilian user sees their local wall-clock.
      const localRelease = new Date(releaseTime * 1000 - tzOffsetMinutes * 60 * 1000);
      const releaseDisplay = localRelease.toISOString().replace('T', ' ').slice(0, 16);

      const feeLine = (feeWallet && Number(feeTotal) > 0)
        ? `\n💸 Transaction fee: ${schedulingFee} USDC (scheduling) + ${releaseFee} USDC (release) = ${feeTotal} USDC\n🧾 Total deduction: ${totalDeduct.toFixed(6)} USDC (${amount} + ${feeTotal} USDC)\n\nOnly this exact amount is deducted from your wallet — no other charges.`
        : '';

        return {
          tool: "schedulePayment",
          success: true,
          recipient: receiverTag,
          amount: Number(amount),
          scheduledDate: scheduledTx.created_at,
          transferId: scheduledTx.id,
          targetAddress,
          contractAddress: managerAddress,
          releaseTime,
          releaseAtIso: new Date(releaseTime * 1000).toISOString(),
          releaseFee,
          schedulingFee,
          feeTotal,
          totalDeduct,
          feeWallet,
          requiresAuth: true,
          message: `⏰ Scheduled ${amount} USDC to ${receiverTag}\n\n📬 Recipient: ${receiverTag}\n🔗 Wallet: ${targetAddress}\n⏱ Release: ${releaseDisplay} (your local time)${feeLine}`
        };
    }

    case "createInvoice": {
      const { amount, currency = "USDC", recipient, note = "" } = args;

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!recipient) {
        return { tool: "createInvoice", success: false, message: "❌ Include an invoice recipient—for example: Create invoice 10 USDC for @username." };
      }

      const normalizedCurrency = String(currency).toUpperCase();
      const liveBotPrice = normalizedCurrency === 'USD' || normalizedCurrency === 'USDC' ? await getLiveBotPrice() : null;
      const botAmount = normalizedCurrency === 'USD' || normalizedCurrency === 'USDC' ? Number(amount) / liveBotPrice : Number(amount);
      const invoiceItem = {
        user_id: userId,
        recipient_pay_tag: recipient || "Open Customer",
        metamask: userProfile.metamask_id,
        name: note || "Invoice",
        sender: userProfile.global_pay_tag || userProfile.email,
        amount: Number(amount),
        currency: normalizedCurrency,
        requested_amount: Number(amount),
        requested_currency: normalizedCurrency,
        bot_price_snapshot: liveBotPrice,
        bot_amount_snapshot: botAmount,
        status: "Pending"
      };

      const { data: invoice } = await supabase
        .from('request_money')
        .insert(invoiceItem)
        .select()
        .single();

      return {
        tool: "createInvoice",
        success: true,
        amount: Number(amount),
        currency: normalizedCurrency,
        recipient: recipient || "Open Customer",
        message: normalizedCurrency === 'USD'
          ? `📄 Created a $${Number(amount).toFixed(2)} invoice for ${recipient}. Estimated at ${botAmount.toFixed(4)} USDC.`
          : `📄 Created a ${Number(amount).toFixed(2)} ${normalizedCurrency} invoice for ${recipient}.`
      };
    }

    case "getRate": {
      let botPrice = 1.0;
      try {
        botPrice = await getLiveBotPrice();
      } catch (e) {}
      return {
        tool: "getRate",
        success: true,
        rate: botPrice,
        message: `💎 Current USDC/USD Rate: $${botPrice.toFixed(6)} per USDC (native gas on Arc)`
      };
    }

    case "getWallet": {
      const { data: userObj } = await supabase
        .from('profiles')
        .select('internal_wallet_address, metamask_id, external_wallet')
        .eq('id', userId)
        .single();

      const internalAddr = userObj?.internal_wallet_address || 'Not set';
      const externalAddr = userObj?.metamask_id || userObj?.external_wallet || 'Not connected';

      const msg = `🏦 Internal Vault: ${internalAddr}\n🔗 External Web3: ${externalAddr}`;

      return {
        tool: "getWallet",
        success: true,
        internalAddress: internalAddr,
        externalAddress: externalAddr,
        message: msg
      };
    }

    case "switchPrimary": {
      const { data: userObj } = await supabase
        .from('profiles')
        .select('primary_receiving_wallet')
        .eq('id', userId)
        .single();

      const current = String(userObj?.primary_receiving_wallet || 'internal').toLowerCase();
      const { target } = args;
      const targetType = target && ['internal', 'external'].includes(target.toLowerCase())
        ? target.toLowerCase()
        : null;

      if (targetType && targetType === current) {
        return {
          tool: "switchPrimary",
          success: true,
          primaryReceivingWallet: current,
          message: `ℹ️ Primary receiving wallet is already set to ${current === 'external' ? 'External Web3 Wallet' : 'Internal Vault'}. No change needed.`
        };
      }

      const newType = targetType || (current === 'external' ? 'internal' : 'external');

      const { error } = await supabase
        .from('profiles')
        .update({ primary_receiving_wallet: newType })
        .eq('id', userId);

      if (error) {
        return { tool: "switchPrimary", success: false, message: `❌ Failed to update primary wallet: ${error.message}` };
      }

      return {
        tool: "switchPrimary",
        success: true,
        primaryReceivingWallet: newType,
        message: `✅ Primary receiving wallet switched to ${newType === 'external' ? 'External Web3 Wallet' : 'Internal Vault'}.`
      };
    }

    case "getHelp": {
      const helpMsg = `📋 Commands\n\n/send — Send USDC\n/balance — View balances\n/history — Transaction log\n/wallet — Your addresses\n/primary — Switch wallet\n/find — Search users\n/schedule — Future payment\n/cancel — Cancel a schedule\n/invoice — Create invoice\n\nTip: Type naturally like "Send 5 USDC to @user"`;

      return {
        tool: "getHelp",
        success: true,
        message: helpMsg
      };
    }

    case "cancelSchedulePayment": {
      const { transferId } = args;
      const managerAddress = process.env.GLOBAL_PAY_MANAGER_ADDRESS || "0x775Ab463A19E51072C61bAe94A0931E00F7caa42";

      const mgrAbi = [
        { "inputs": [{"internalType": "bytes32", "name": "id", "type": "bytes32"}], "name": "getPayment", "outputs": [
          {"internalType": "uint8", "name": "", "type": "uint8"}, {"internalType": "uint8", "name": "", "type": "uint8"},
          {"internalType": "address", "name": "", "type": "address"}, {"internalType": "address", "name": "", "type": "address"},
          {"internalType": "uint256", "name": "", "type": "uint256"}, {"internalType": "uint256", "name": "", "type": "uint256"},
          {"internalType": "bytes32", "name": "", "type": "bytes32"}], "stateMutability": "view", "type": "function" }
      ];

      // Classify a row as: {onChain: 'active'|'released'|'cancelled'|null, contractPaymentId, funded}
      const classify = async (t) => {
        let meta = null;
        try { meta = JSON.parse(t.raw_signed_tx || '{}'); } catch { meta = null; }
        const contractPaymentId = meta?.paymentId || null;
        const funded = contractPaymentId != null;
        if (!funded) return { onChain: null, contractPaymentId: null, funded: false };
        try {
          const c = new ethers.Contract(managerAddress, mgrAbi, getProvider());
          const p = await c.getPayment(contractPaymentId);
          const st = Number(p[1]);
          return { onChain: ({ 2: 'released', 3: 'cancelled' }[st] || 'active'), contractPaymentId, funded: true, releaseTime: Number(p[5]) || null };
        } catch (ocErr) {
          logger.warn('[cancelSchedulePayment] on-chain check failed:', ocErr.message);
          return { onChain: 'active', contractPaymentId, funded: true, releaseTime: null }; // fail open — invalid cancel simply reverts
        }
      };

      const isCancellable = (t, state) => {
        if (state.onChain === 'released' || state.onChain === 'cancelled') return false;
        if (!state.funded && t.status === 'PENDING') return true; // not funded yet → DB-only cancel
        if (t.status === 'PENDING' && state.funded) return true;  // funded, locked, awaiting release
        if (t.status === 'FUNDED') return true;
        if (t.status === 'FAILED' && state.onChain === 'active') return true; // transient release failure, still locked
        return false;
      };

      const fmtDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      };

      const fmtTs = (sec) => {
        return new Date(Number(sec) * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      };

      // Response for cancelling ONE specific transfer.
      const cancelOne = (t, state) => {
        if (!state.funded) {
          // Not funded on-chain — just mark FAILED in DB (CANCELLED is not in the status check constraint)
          return supabase.from('money_transfers').update({ status: 'FAILED' }).eq('id', t.id)
            .then(() => ({ tool: "cancelSchedulePayment", success: true, message: `✅ Scheduled payment #${t.id} cancelled (not yet funded on-chain).` }))
            .catch((err) => ({ tool: "cancelSchedulePayment", success: false, message: `❌ Failed to cancel: ${err.message}` }));
        }
        return {
          tool: "cancelSchedulePayment",
          success: true,
          requiresAuth: true,
          actionRequired: true,
          cancelAction: true,
          transferId: t.id,
          contractPaymentId: state.contractPaymentId,
          contractAddress: managerAddress,
          recipient: t.receiver_pay_tag || 'Unknown',
          amount: Number(t.bot_amount || t.amount || 0),
          message: `🔍 Found scheduled transfer #${t.id} (${t.status}) to ${t.receiver_pay_tag || 'Unknown'} for ${Number(t.bot_amount || t.amount || 0)} USDC.\n\nTo cancel and refund, click "Cancel & Refund" below. This will send a cancel transaction to the GlobalPay Manager contract via MetaMask.`
        };
      };

      if (transferId) {
        const { data } = await supabase
          .from('money_transfers')
          .select('*')
          .eq('id', transferId)
          .eq('sender_id', userId)
          .maybeSingle();
        if (!data) {
          return { tool: "cancelSchedulePayment", success: false, message: "❌ Scheduled payment not found." };
        }
        const state = await classify(data);
        if (state.onChain === 'released') {
          return { tool: "cancelSchedulePayment", success: true, message: "✅ This scheduled payment was already released — the funds were sent to the recipient. Nothing to cancel." };
        }
        if (state.onChain === 'cancelled') {
          return { tool: "cancelSchedulePayment", success: true, message: "ℹ️ This scheduled payment was already cancelled on-chain. Nothing to cancel." };
        }
        if (!isCancellable(data, state)) {
          return { tool: "cancelSchedulePayment", success: true, message: "ℹ️ This scheduled payment can no longer be cancelled." };
        }
        return await cancelOne(data, state);
      }

      // No specific id → show the sender the list of their cancellable schedules
      // first ("give plan first"); they pick one and then approve in MetaMask.
      const { data: all, error: listErr } = await supabase
        .from('money_transfers')
        .select('*')
        .eq('sender_id', userId)
        // PENDING/FUNDED = normal locked-on-chain or awaiting funding.
        // FAILED too: a transient release failure (e.g. relayer gas) leaves the
        // payment still ACTIVE on-chain, so the sender must still be able to cancel.
        .in('status', ['PENDING', 'FUNDED', 'FAILED'])
        .order('created_at', { ascending: false })
        .limit(15);

      if (listErr || !all || all.length === 0) {
        return { tool: "cancelSchedulePayment", success: true, message: "ℹ️ No scheduled payments available to cancel right now. Payments that were already released or cancelled — or none at all — show nothing here." };
      }

      const candidates = [];
      for (const t of all) {
        const state = await classify(t);
        if (isCancellable(t, state)) candidates.push({ t, state });
      }

      if (candidates.length === 0) {
        return { tool: "cancelSchedulePayment", success: true, message: "ℹ️ No scheduled payments available to cancel right now. Payments you have were already released or cancelled, so nothing is shown here." };
      }

      if (candidates.length === 1) {
        return await cancelOne(candidates[0].t, candidates[0].state);
      }

      // Multiple candidates → hand the client a structured checklist. The user
      // ticks the box(es) and taps "Cancel Selected" — no typing needed. Only
      // funded (on-chain) payments can be cancelled from the checklist; any
      // unfunded PENDING lone row still goes through the single-item path above.
      const options = candidates
        .filter((c) => c.state.funded)
        .map((c) => {
          const whenLabel = c.state.releaseTime
            ? `scheduled ${fmtTs(c.state.releaseTime)}`
            : `scheduled ${fmtDate(c.t.created_at)}`;
          return {
            transferId: c.t.id,
            contractPaymentId: c.state.contractPaymentId,
            contractAddress: managerAddress,
            recipient: c.t.receiver_pay_tag || 'Unknown',
            amount: Number(c.t.bot_amount || c.t.amount || 0),
            funded: true,
            label: `${Number(c.t.bot_amount || c.t.amount || 0)} USDC → ${c.t.receiver_pay_tag || 'Unknown'} · ${whenLabel}`
          };
        });

      if (options.length === 0) {
        return { tool: "cancelSchedulePayment", success: true, message: "ℹ️ No scheduled payments available to cancel right now. Payments you have were already released or cancelled, so nothing is shown here." };
      }

      return {
        tool: "cancelSchedulePayment",
        success: true,
        cancelPlan: true,
        cancelOptions: options,
        message: `📋 Your scheduled payments that can still be cancelled:\n\n${options.map((o) => `☐ ${o.label} · funds locked 🔒`).join('\n')}\n\nTick the box(es) you want to cancel below, then tap "Cancel Selected" and approve each MetaMask request.`
      };
    }

    case "sendUsdcOnArc": {
      const { recipient, amount } = args;
      if (!recipient || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return { tool: "sendUsdcOnArc", success: false, message: "❌ Please provide a valid recipient and USDC amount greater than zero." };
      }
      return {
        tool: "sendUsdcOnArc",
        success: true,
        requiresAuth: true,
        actionRequired: true,
        network: "Arc Testnet",
        chainId: 5042002,
        currency: "USDC",
        recipient,
        amount: Number(amount),
        message: `⚡ Initiating transfer of ${amount} USDC on Arc Testnet to ${recipient}. USDC is used directly as native gas.`
      };
    }

    case "checkArcBalance": {
      try {
        const addr = args?.address || user?.internalWalletAddress || user?.internal_wallet_address;
        const status = await getArcNetworkStatus();
        let bal = null;
        if (addr && ethers.utils.isAddress(addr)) {
          bal = await getArcBalance(addr);
        }
        return {
          tool: "checkArcBalance",
          success: true,
          network: status.network,
          chainId: status.chainId,
          nativeGas: "USDC",
          blockHeight: status.blockNumber,
          address: addr || 'Not configured',
          balanceUsdc: bal ? bal.balanceUsdc : '0.00',
          message: `🌐 Arc L1 Network Status: ${status.status.toUpperCase()}\n• Chain ID: ${status.chainId}\n• Native Gas: USDC\n• Wallet: ${addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'None'}\n• Balance: ${bal ? bal.balanceUsdc : '0.00'} USDC\n• Block Height: #${status.blockNumber || 'Syncing'}`
        };
      } catch (err) {
        return { tool: "checkArcBalance", success: false, message: `❌ Error checking Arc status: ${err.message}` };
      }
    }

    case "createArcEscrow": {
      const { payeeAddress, amountUsdc, milestone } = args;
      const res = await createProgrammableEscrow({
        payerAddress: user?.internalWalletAddress || user?.internal_wallet_address || '0xUser',
        payeeAddress,
        amountUsdc,
        conditions: { milestone: milestone || 'milestone_complete', autoRelease: true }
      });
      return {
        tool: "createArcEscrow",
        success: true,
        escrowId: res.escrowId,
        amountUsdc,
        payeeAddress,
        message: `🔒 Programmable Escrow created on Arc Testnet (#${res.escrowId})\n• Amount: ${amountUsdc} USDC\n• Payee: ${payeeAddress}\n• Condition: ${milestone || 'Job Completion'}\n• Settlement: Native USDC on Arc`
      };
    }

    case "executeAgentNanopayment": {
      const { recipientAddress, amountUsdc, serviceName } = args;
      try {
        const receipt = await executeNanopayment({
          payerAgentId: user?.id || 'agent_primary',
          recipientAddress,
          amountUsdc,
          serviceName
        });
        return {
          tool: "executeAgentNanopayment",
          success: true,
          receipt,
          message: `🤖 Agent Nanopayment Settled on Arc!\n• Service: ${serviceName || 'AI Inference'}\n• Amount: ${amountUsdc} USDC\n• Tx Hash: ${receipt.txHash}\n• Explorer: ${receipt.explorerUrl}`
        };
      } catch (err) {
        return { tool: "executeAgentNanopayment", success: false, message: `❌ Nanopayment failed: ${err.message}` };
      }
    }

    case "bridgeUsdcViaGateway": {
      const { sourceChain, amountUsdc } = args;
      const bridgeRes = await routeCrosschainUsdc({
        sourceChain,
        destinationChain: 'arc-testnet',
        amountUsdc,
        recipientAddress: user?.internalWalletAddress || user?.internal_wallet_address || '0xUser'
      });
      return {
        tool: "bridgeUsdcViaGateway",
        success: true,
        bridgeRes,
        message: `🌉 Circle Gateway / CCTP Bridge Initiated:\n• Route: ${sourceChain} ➔ Arc Testnet\n• Amount: ${amountUsdc} USDC\n• Transfer ID: ${bridgeRes.transferId}\n• Status: Settled in Native USDC`
      };
    }

    case "getAgentSpendingPolicy": {
      const policy = await checkAgentSpendingPolicy({
        agentId: args?.agentId || user?.id,
        amountUsdc: 1
      });
      return {
        tool: "getAgentSpendingPolicy",
        success: true,
        policy,
        message: `🛡️ Arc Agent Spending Policy:\n• Daily Limit: 2500 USDC\n• Max Single Tx: 500 USDC\n• Remaining Budget: ${policy.remainingDailyBudget || 2500} USDC\n• Status: Active`
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};
