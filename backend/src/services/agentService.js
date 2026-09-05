/**
 * AgentService — domain logic for the AI Agent platform.
 *
 * Everything an AI agent needs: create an agent (headless wallet + API key),
 * authenticate, pay, check balance, view history, and stats. All reads/writes
 * go through Supabase; wallet operations are delegated to WalletService so the
 * provider is swappable (local/Privy/BO Wallet).
 */

import logger from '../utils/logger.js';import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { encryptText } from '../utils/cryptoUtils.js';
import { getWalletService } from '../wallets/walletService.js';
import { dispatchEvent } from './webhookService.js';
import { audit } from './auditService.js';
const EXPLORER_URL = process.env.EXPLORER_URL || process.env.BASE_EXPLORER_URL || 'https://sepolia.basescan.org/';

// ==================== API Key Utilities ====================

export const generateApiKey = () =>
  `gpay_sk_${crypto.randomBytes(24).toString('base64url')}`;

export const generateAgentId = () =>
  `agt_${crypto.randomBytes(8).toString('hex')}`;

export const hashApiKey = (apiKey) =>
  crypto.createHash('sha256').update(apiKey).digest('hex');

// ==================== Agent Lifecycle ====================

/**
 * Create an AI agent programmatically — no human login required.
 * Mints a headless wallet, issues an API key, persists metadata.
 */
export const createAgent = async ({ name, description, developerId, organizationId }) => {
  let created;
  try {
    const walletService = getWalletService();
    created = await walletService.createWallet({ name, ownerId: developerId });
  } catch (walletErr) {
    // MPC service unavailable — generate a local wallet as fallback
    logger.warn('MPC wallet creation failed, using local fallback', { error: walletErr.message });
    const { ethers } = await import('ethers');
    const wallet = ethers.Wallet.createRandom();
    created = {
      address: wallet.address,
      walletId: `local_${wallet.address.slice(2, 10)}`,
      chainId: Number(process.env.CHAIN_ID || process.env.BASE_CHAIN_ID || 84532),
      privateKey: wallet.privateKey,
      provider: 'local'
    };
  }

  const apiKey = generateApiKey();
  const agentId = generateAgentId();

  const insertData = {
    agent_id: agentId,
    developer_id: developerId || null,
    organization_id: organizationId || null,
    agent_name: (name || 'AI Agent').trim(),
    description: description || null,
    wallet_address: created.address,
    wallet_id: created.walletId,
    wallet_provider: created.provider || 'local',
    chain_id: created.chainId != null ? Number(created.chainId) : Number(process.env.CHAIN_ID || process.env.BASE_CHAIN_ID || 84532),
    encrypted_private_key: created.privateKey ? encryptText(created.privateKey) : null,
    api_key_hash: hashApiKey(apiKey),
    api_key_prefix: apiKey.slice(0, 16),
    balance: '0',
    status: 'active',
    rate_limit_per_min: 30,
    created_at: new Date().toISOString()
  };

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error('Failed to persist AI agent', { error: error.message });
    throw new Error(`Failed to create AI agent: ${error.message}`);
  }

  audit('agent.created', {
    agentId,
    name: (name || 'AI Agent').trim(),
    wallet: created.address,
    provider: created.provider || 'local',
    network: 'Base Sepolia',
    chainId: Number(process.env.CHAIN_ID || process.env.BASE_CHAIN_ID || 84532)
  }, { developerId, organizationId });
  dispatchEvent('wallet.created', {
    agentId,
    wallet: created.address,
    walletId: created.walletId,
    provider: created.provider || 'local'
  }, { developerId, organizationId });

  return {
    agentId,
    wallet: created.address,
    walletId: created.walletId,
    apiKey, // returned exactly once — never stored raw
    apiKeyPrefix: agent.api_key_prefix,
    provider: created.provider || 'local',
    network: 'Base Sepolia',
    chainId: created.chainId != null ? Number(created.chainId) : Number(process.env.CHAIN_ID || process.env.BASE_CHAIN_ID || 84532)
  };
};

/**
 * Resolve an agent by raw API key (hashed lookup). Null if not found/revoked.
 */
export const getAgentByApiKey = async (apiKey) => {
  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('api_key_hash', hashApiKey(apiKey))
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new Error(`API key lookup failed: ${error.message}`);
  return data || null;
};

export const getAgentById = async (agentId) => {
  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  return data || null;
};

export const listAgentsByDeveloper = async (developerId) => {
  let query = supabase.from('ai_agents').select('*');
  if (developerId) query = query.eq('developer_id', developerId);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`Agent list failed: ${error.message}`);
  return data || [];
};

// ==================== Balances / Payments / History ====================

const toPublicAgent = (agent) => ({
  agentId: agent.agent_id,
  developerId: agent.developer_id,
  name: agent.agent_name,
  description: agent.description,
  wallet: agent.wallet_address,
  walletId: agent.wallet_id,
  chainId: agent.chain_id != null ? Number(agent.chain_id) : null,
  apiKeyPrefix: agent.api_key_prefix,
  provider: agent.wallet_provider,
  balance: agent.balance,
  status: agent.status,
  createdAt: agent.created_at
});

export const getAgentBalance = async (agent) => {
  const walletService = getWalletService();
  const balance = await walletService.getBalance(agent.wallet_address);

  await supabase
    .from('ai_agents')
    .update({ balance: balance.formatted, updated_at: new Date().toISOString() })
    .eq('id', agent.id);

  return {
    wallet: agent.wallet_address,
    balance: `${Number(balance.formatted).toFixed(6)} BOT`,
    wei: balance.wei
  };
};

/**
 * Pay from the agent's wallet. Amount in token units (BOT) or raw wei.
 */
export const agentPay = async (agent, { to, amount, wei, token, note }) => {
  const { ethers } = await import('ethers');
  if (!to || !ethers.isAddress(to)) {
    throw Object.assign(new Error('A valid destination EVM address is required.'), { status: 400 });
  }

  let valueWei;
  if (wei) {
    valueWei = BigInt(wei);
  } else {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw Object.assign(new Error('A positive amount is required.'), { status: 400 });
    }
    valueWei = ethers.parseEther(String(amount));
  }

  const walletService = getWalletService();

  // Authoritative chain validation: the agent's recorded chain must match its
  // linked MPC wallet. Never trust stale local metadata for a signing path.
  if (agent.wallet_id) {
    const walletChainId = await walletService.getWalletChainId(agent.wallet_id);
    if (agent.chain_id != null && Number(agent.chain_id) !== Number(walletChainId)) {
      throw Object.assign(
        new Error(
          `Agent chain mismatch: agent.chain_id=${agent.chain_id} does not match linked MPC wallet chain=${walletChainId}. Refusing to sign or broadcast.`
        ),
        { status: 409 }
      );
    }
  }

  // Replay/double-spend guard: if an identical payment (same agent, destination,
  // amount) was already broadcast in the last 5 minutes, return the existing
  // transaction instead of broadcasting a second time. This covers the case
  // where a client retried after a timeout while the first tx was still mined.
  const dedupeWindowMs = 5 * 60 * 1000;
  const dedupeSince = new Date(Date.now() - dedupeWindowMs).toISOString();
  try {
    const { data: existing } = await supabase
      .from('ai_agent_transactions')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('destination_address', to)
      .eq('amount', valueWei.toString())
      .gte('created_at', dedupeSince)
      .limit(1);
    if (existing?.length && existing[0].tx_hash) {
      const prior = existing[0];
      return {
        txHash: prior.tx_hash,
        from: agent.wallet_address,
        to,
        amount: ethers.formatEther(valueWei),
        token: token || 'BOT',
        explorerUrl: `${EXPLORER_URL}/tx/${prior.tx_hash}`,
        transactionId: prior.id,
        duplicate: true
      };
    }
  } catch {
    // dedupe is best-effort; never block the payment on it
  }

  const result = await walletService.sendPayment({
    walletId: agent.wallet_id,
    encryptedPrivateKey: agent.encrypted_private_key,
    to,
    wei: valueWei.toString()
  });

  dispatchEvent('payment.completed', {
    agentId: agent.agent_id,
    to,
    amount: ethers.formatEther(valueWei),
    token: token || 'BOT',
    txHash: result.txHash,
    network: 'BOT Chain'
  }, { developerId: agent.developer_id, organizationId: agent.organization_id });

  audit({
    developerId: agent.developer_id,
    organizationId: agent.organization_id,
    actorType: 'agent',
    actorId: agent.agent_id,
    action: 'payment.completed',
    resourceType: 'ai_agent_transaction',
    metadata: { to, amount: ethers.formatEther(valueWei), token: token || 'BOT', txHash: result.txHash }
  });

  // Write the ledger row as 'pending' — the agent transaction reconciliation
  // worker flips it to 'confirmed'/'failed' from the real on-chain receipt. The
  // only exception: when the wallet layer already observed a mined receipt,
  // record it immediately (still verified against the chain on a later pass).
  const { data: ledger, error: ledgerErr } = await supabase
    .from('ai_agent_transactions')
    .insert({
      agent_id: agent.id,
      destination_address: to,
      amount: valueWei.toString(),
      token: token || 'BOT',
      note: note || null,
      tx_hash: result.txHash,
      nonce: result.nonce != null ? result.nonce : null,
      status: result.confirmed ? 'confirmed' : 'pending'
    })
    .select()
    .single();

  if (ledgerErr) logger.error('[AGENT PAY] Ledger insert warning:', ledgerErr.message);

  return {
    txHash: result.txHash,
    from: result.from || agent.wallet_address,
    to,
    amount: ethers.formatEther(valueWei),
    token: token || 'BOT',
    explorerUrl: `${EXPLORER_URL}/tx/${result.txHash}`,
    transactionId: ledger ? ledger.id : null
  };
};

export const getAgentHistory = async (agent, { limit = 50, page, offset } = {}) => {
  const per = Math.min(Number(limit) || 50, 200);
  let query = supabase
    .from('ai_agent_transactions')
    .select('*, id', { count: 'exact' })
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  if (page || offset) {
    const off = Number(offset) || ((Number(page) || 1) - 1) * per;
    query = query.range(off, off + per - 1);
  } else {
    query = query.limit(per);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`History fetch failed: ${error.message}`);

  const transactions = (data || []).map((tx) => ({
    id: tx.id,
    to: tx.destination_address,
    amount: (Number(tx.amount) / 1e18).toFixed(8),
    token: tx.token || 'BOT',
    txHash: tx.tx_hash,
    status: tx.status,
    blockNumber: tx.block_number,
    nonce: tx.nonce,
    confirmedAt: tx.confirmed_at,
    createdAt: tx.created_at
  }));

  if (!(page || offset)) return transactions;

  const off = Number(offset) || (Number(page) || 1 - 1) * per;
  const total = count || 0;
  return {
    transactions,
    meta: {
      page: Number(page) || Math.floor(off / per) + 1,
      offset: off,
      perPage: per,
      total,
      totalPages: Math.max(1, Math.ceil(total / per)),
      hasMore: off + transactions.length < total
    }
  };
};

/**
 * Payment statistics for the agent dashboard.
 */
export const getAgentStats = async (agent) => {
  const { data, error } = await supabase
    .from('ai_agent_transactions')
    .select('amount, status, created_at, destination_address')
    .eq('agent_id', agent.id);

  if (error) throw new Error(`Stats fetch failed: ${error.message}`);

  const txs = data || [];
  const totalWei = txs.reduce((sum, t) => sum + BigInt(t.amount || '0'), 0n);

  const uniqueRecipients = new Set(txs.map((t) => t.destination_address.toLowerCase())).size;

  const last7 = txs.filter((t) => new Date(t.created_at) >= new Date(Date.now() - 7 * 86400000));
  const perDay = {};
  last7.forEach((t) => {
    const day = t.created_at.slice(0, 10);
    perDay[day] = (perDay[day] || 0n) + BigInt(t.amount || '0');
  });

  const { ethers } = await import('ethers');
  return {
    totalPayments: txs.length,
    totalVolumeBOT: ethers.formatEther(totalWei),
    uniqueRecipients,
    last7Days: Object.entries(perDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amt]) => ({ date, volumeBOT: ethers.formatEther(amt) }))
  };
};

// ==================== API Key Management ====================

/**
 * Regenerate an agent's API key. Old key is immediately invalidated.
 */
export const regenerateAgentApiKey = async (agent) => {
  const newKey = generateApiKey();

  const { error } = await supabase
    .from('ai_agents')
    .update({
      api_key_hash: hashApiKey(newKey),
      api_key_prefix: newKey.slice(0, 16),
      updated_at: new Date().toISOString()
    })
    .eq('id', agent.id);

  if (error) throw new Error(`Key rotation failed: ${error.message}`);

  audit({
    developerId: agent.developer_id,
    organizationId: agent.organization_id,
    action: 'agent.api_key_rotated',
    resourceType: 'ai_agent',
    resourceId: agent.agent_id
  });

  dispatchEvent('api_key.rotated', {
    agentId: agent.agent_id,
    apiKeyPrefix: newKey.slice(0, 16)
  }, { developerId: agent.developer_id, organizationId: agent.organization_id });

  return { agentId: agent.agent_id, apiKey: newKey, apiKeyPrefix: newKey.slice(0, 16) };
};

export { toPublicAgent };