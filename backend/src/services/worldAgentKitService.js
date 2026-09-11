/**
 * World AgentKit Service — identity & human-authorization layer for GlobalPay.
 *
 * Uses the official @worldcoin/agentkit package to:
 * 1. Look up agent wallets in AgentBook (World Chain)
 * 2. Verify that an agent is backed by a real World ID-verified human
 * 3. Store verification status per agent
 * 4. Provide trust signals for the Trust Engine
 *
 * Canonical AgentBook: World Chain (eip155:480) at 0xA23aB2712eA7BBa896930544C7d6636a96b944dA
 */
import logger from '../utils/logger.js';
import { supabase } from '../config/supabaseClient.js';
import { cache } from '../utils/ttlCache.js';

// Lazy-loaded AgentBook verifier (created once, reused)
let agentBookVerifier = null;

const getAgentBookVerifier = async () => {
  if (agentBookVerifier) return agentBookVerifier;
  try {
    const { createAgentBookVerifier } = await import('@worldcoin/agentkit');
    agentBookVerifier = createAgentBookVerifier();
    logger.info('[WORLD] AgentBook verifier initialized (canonical World Chain deployment)');
    return agentBookVerifier;
  } catch (err) {
    logger.error('[WORLD] Failed to initialize AgentBook verifier:', err.message);
    throw new Error(`AgentBook unavailable: ${err.message}`);
  }
};

// ==================== AgentBook Lookup ====================

/**
 * Look up whether a wallet address is registered in AgentBook.
 * Returns the anonymous human identifier if registered, null otherwise.
 */
export const lookupAgentBook = async (walletAddress) => {
  if (!walletAddress) return null;
  try {
    const verifier = await getAgentBookVerifier();
    const humanId = await verifier.lookupHuman(walletAddress);
    return humanId;
  } catch (err) {
    logger.warn('[WORLD] AgentBook lookup failed:', err.message);
    return null;
  }
};

/**
 * Batch lookup: check multiple wallet addresses against AgentBook.
 * Returns a Map<address, humanId | null>.
 */
export const batchLookupAgentBook = async (walletAddresses) => {
  const results = new Map();
  const unique = [...new Set(walletAddresses.filter(Boolean).map((a) => String(a).toLowerCase()))];

  // Parallel lookups (bounded to avoid hammering the RPC)
  const BATCH = 10;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const promises = batch.map(async (addr) => {
      const humanId = await lookupAgentBook(addr);
      results.set(addr, humanId);
    });
    await Promise.allSettled(promises);
  }

  return results;
};

// ==================== Verification Status ====================

/**
 * Get the World AgentKit verification status for an agent.
 * Returns the DB record with world_verified, human_backed, etc.
 */
export const getVerificationStatus = async (agentId) => {
  try {
    const { data, error } = await supabase
      .from('ai_agents')
      .select('agent_id, wallet_address, world_verified, agent_book_id, world_verified_at, human_backed, verification_method, agentbook_tx_hash')
      .eq('agent_id', agentId)
      .single();

    if (error || !data) return null;

    // If wallet is registered in AgentBook but DB flag not yet set, sync
    if (!data.world_verified && data.wallet_address) {
      const humanId = await lookupAgentBook(data.wallet_address);
      if (humanId) {
        // Sync DB — wallet is registered but flag wasn't set
        await supabase
          .from('ai_agents')
          .update({
            world_verified: true,
            agent_book_id: humanId,
            human_backed: true,
            verification_method: 'agentbook',
            world_verified_at: new Date().toISOString()
          })
          .eq('agent_id', agentId);
        data.world_verified = true;
        data.agent_book_id = humanId;
        data.human_backed = true;
        data.verification_method = 'agentbook';
        data.world_verified_at = new Date().toISOString();
      }
    }

    return data;
  } catch (err) {
    logger.warn('[WORLD] getVerificationStatus error:', err.message);
    return null;
  }
};

/**
 * Verify an agent wallet against AgentBook and update the database.
 * This is the "POST /world/verify" handler.
 *
 * Flow:
 * 1. Look up the wallet address in AgentBook
 * 2. If registered → set world_verified=true, human_backed=true
 * 3. If not registered → return { verified: false }
 */
export const verifyAgent = async (agentId) => {
  const status = await getVerificationStatus(agentId);
  if (!status) throw new Error('Agent not found');
  if (status.world_verified) {
    return { verified: true, agentBookId: status.agent_book_id, alreadyVerified: true };
  }

  const humanId = await lookupAgentBook(status.wallet_address);
  if (!humanId) {
    return { verified: false, reason: 'Wallet not registered in AgentBook. Register with: npx @worldcoin/agentkit-cli register <address>' };
  }

  // Persist verification
  const { error } = await supabase
    .from('ai_agents')
    .update({
      world_verified: true,
      agent_book_id: humanId,
      human_backed: true,
      verification_method: 'agentbook',
      world_verified_at: new Date().toISOString()
    })
    .eq('agent_id', agentId);

  if (error) logger.error('[WORLD] DB update failed:', error.message);

  return { verified: true, agentBookId: humanId, alreadyVerified: false };
};

/**
 * Check verification status for multiple agents (for marketplace display).
 * Returns a Map<agentId, { verified, humanBacked }>.
 */
export const getBulkVerificationStatus = async (agentIds) => {
  const results = new Map();
  if (!agentIds?.length) return results;

  try {
    const { data } = await supabase
      .from('ai_agents')
      .select('agent_id, wallet_address, world_verified, human_backed, agent_book_id')
      .in('agent_id', agentIds);

    for (const row of data || []) {
      results.set(row.agent_id, {
        verified: Boolean(row.world_verified),
        humanBacked: Boolean(row.human_backed),
        agentBookId: row.agent_book_id || null,
        walletAddress: row.wallet_address
      });
    }
  } catch (err) {
    logger.warn('[WORLD] Bulk verification query failed:', err.message);
  }

  return results;
};

/**
 * Enrich a marketplace service list with World verification badges.
 * Adds `humanBacked: true/false` and `worldVerified: true/false` to each service.
 */
export const enrichServicesWithVerification = async (services) => {
  const agentIds = [...new Set(services.map((s) => s.provider?.agentId || s.agentId).filter(Boolean))];
  if (!agentIds.length) return services;

  const verification = await getBulkVerificationStatus(agentIds);
  return services.map((s) => {
    const agentId = s.provider?.agentId || s.agentId;
    const vStatus = verification.get(agentId);
    return {
      ...s,
      humanBacked: vStatus?.humanBacked || false,
      worldVerified: vStatus?.verified || false,
      agentBookId: vStatus?.agentBookId || null
    };
  });
};
