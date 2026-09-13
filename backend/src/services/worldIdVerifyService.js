/**
 * World ID v4 Verification Service — RP signing + server-side proof verification.
 *
 * Flow (docs.world.org/world-id/idkit/integrate):
 *   1. Client asks backend for an RP signature (POST /developers/world/idkit/sign)
 *   2. Client opens IDKitRequestWidget with the signature → user proves in World App
 *   3. Client sends the IDKit result to POST /developers/world/idkit/verify
 *   4. Backend forwards the proof byte-for-byte to developer.world.org/api/v4/verify/{rp_id}
 *   5. On success, backend stores the nullifier (UNIQUE per action) — anti-replay
 *
 * Env:
 *   WORLD_APP_ID        — app_xxx from the Developer Portal
 *   WORLD_RP_ID         — rp_xxx from the Developer Portal
 *   WORLD_RP_SIGNING_KEY — hex private key returned once at RP creation/rotation
 *   WORLD_ENVIRONMENT   — "staging" (simulator/sandbox app) | "production"
 */
import crypto from 'node:crypto';
import { signRequest } from '@worldcoin/idkit-core/signing';
import logger from '../utils/logger.js';
import { supabase } from '../config/supabaseClient.js';
import { getPool } from '../utils/db.js';

const APP_ID = process.env.WORLD_APP_ID || '';
const RP_ID = process.env.WORLD_RP_ID || '';
const RP_SIGNING_KEY = process.env.WORLD_RP_SIGNING_KEY || '';
const ENVIRONMENT = process.env.WORLD_ENVIRONMENT || 'staging';

export const worldIdConfigured = () => Boolean(APP_ID && RP_ID && RP_SIGNING_KEY);

export const worldIdConfig = () => ({ appId: APP_ID, rpId: RP_ID, environment: ENVIRONMENT, configured: worldIdConfigured() });

/**
 * Step 3 — RP signature. The signing key NEVER leaves the server.
 */
export const createRpSignature = (action) => {
  if (!worldIdConfigured()) {
    throw Object.assign(new Error('World ID is not configured on the server (WORLD_APP_ID / WORLD_RP_ID / WORLD_RP_SIGNING_KEY).'), { status: 503 });
  }
  const signed = signRequest({ signingKeyHex: RP_SIGNING_KEY, action });
  return {
    sig: signed.sig,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt
  };
};

const nullifierToDecimal = (hex) => {
  const raw = typeof hex === 'string' ? hex.replace(/^0x/i, '') : hex;
  return BigInt(`0x${raw}`).toString(10);
};

// world_id_nullifiers.developer_id / agent_id are uuid columns — local dev
// identities (e.g. the X-Developer-Id fallback "dev_local") are not UUIDs,
// so store NULL rather than failing the whole verification.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuidOrNull = (value) => (typeof value === 'string' && UUID_RE.test(value) ? value : null);

/**
 * Steps 4–6 — verify the IDKit result with World, then persist the nullifier.
 * The proof payload is forwarded exactly as received (no remapping).
 */
export const verifyIdkitProof = async ({ idkitResponse, expectedAction, developerId, agentId }) => {
  if (!worldIdConfigured()) {
    throw Object.assign(new Error('World ID is not configured on the server.'), { status: 503 });
  }
  if (!idkitResponse || typeof idkitResponse !== 'object') {
    throw Object.assign(new Error('Missing IDKit proof payload.'), { status: 400 });
  }
  if (expectedAction && idkitResponse.action && idkitResponse.action !== expectedAction) {
    throw Object.assign(new Error('Proof action mismatch.'), { status: 400 });
  }
  if (idkitResponse.environment && idkitResponse.environment !== ENVIRONMENT) {
    throw Object.assign(new Error(`Proof environment mismatch: got '${idkitResponse.environment}', server expects '${ENVIRONMENT}'.`), { status: 400 });
  }

  // Step 5 — server-to-server verification with World. Forward as-is.
  const verifyRes = await fetch(`https://developer.world.org/api/v4/verify/${RP_ID}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(idkitResponse)
  });

  if (!verifyRes.ok) {
    const detail = await verifyRes.text().catch(() => '');
    logger.warn('[WORLD_ID] verify failed:', verifyRes.status, detail.slice(0, 500));
    throw Object.assign(new Error(`World proof verification failed (${verifyRes.status}).`), { status: 400 });
  }

  // Step 6 — extract the nullifier and enforce one-verification-per-human per action.
  const responses = Array.isArray(idkitResponse.responses) ? idkitResponse.responses : [];
  const nullifierHex = responses[0]?.nullifier || responses[0]?.session_nullifier?.[0] || null;
  if (!nullifierHex) {
    throw Object.assign(new Error('Proof verified but no nullifier was returned.'), { status: 400 });
  }
  const nullifier = nullifierToDecimal(nullifierHex);
  const action = idkitResponse.action || expectedAction;

  const nullifierRow = {
    nullifier,
    action,
    developer_id: asUuidOrNull(developerId),
    agent_id: asUuidOrNull(agentId)
  };
  const { error: dupError } = await supabase
    .from('world_id_nullifiers')
    .insert(nullifierRow);

  if (dupError) {
    if (dupError.code === '23505') {
      throw Object.assign(new Error('This World ID has already verified this action. One verification per human.'), { status: 409 });
    }
    // Supabase can expose the table through anon/RLS even when the backend
    // service role is degraded. Use the existing direct DB path to persist the
    // proof instead of rejecting a valid World verification.
    try {
      await getPool().query(
        `INSERT INTO world_id_nullifiers (nullifier, action, developer_id, agent_id)
         VALUES ($1, $2, $3, $4)`,
        [nullifier, action, nullifierRow.developer_id, nullifierRow.agent_id]
      );
    } catch (directError) {
      if (directError.code === '23505') {
        throw Object.assign(new Error('This World ID has already verified this action. One verification per human.'), { status: 409 });
      }
      logger.error('[WORLD_ID] nullifier insert failed:', directError.message);
      throw Object.assign(new Error('Failed to record verification. Please try again.'), { status: 500 });
    }
  }

  return { verified: true, nullifier, action, environment: idkitResponse.environment || ENVIRONMENT };
};

/**
 * Mark the USER (profile) as World-verified after a successful IDKit proof.
 * Verification is once per user — every agent they own inherits it on read.
 * Also flips the flag on all of the user's existing agents for compatibility
 * with read paths that still check the agent-level column.
 */
export const markUserVerified = async ({ developerId, nullifier }) => {
  if (!developerId) return null;
  const now = new Date().toISOString();
  const pool = getPool();

  // Real users: persist on the profile. Local dev identities (non-UUID like
  // "dev_local") have no profile row — they are derived from agent flags below.
  let profile = null;
  if (UUID_RE.test(developerId)) {
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .update({
          world_verified: true,
          world_verified_at: now,
          world_nullifier: nullifier ?? null
        })
        .eq('id', developerId)
        .select('id, world_verified')
        .single();

      if (profileError) throw profileError;
      profile = data;
    } catch (gatewayErr) {
      // Gateway RLS issue — try direct DB
      try {
        const { rows } = await pool.query(
          `UPDATE profiles SET world_verified = true, world_verified_at = $1, world_nullifier = $2
           WHERE id = $3 RETURNING id, world_verified`,
          [now, nullifier ?? null, developerId]
        );
        profile = rows[0] || null;
      } catch (directErr) {
        logger.error('[WORLD_ID] profile update failed (gateway + direct):', gatewayErr.message, directErr.message);
      }
    }
  } else {
    logger.debug(`[WORLD_ID] non-UUID developer identity '${developerId}' — skipping profile persistence (agent-derived status).`);
  }

  // Keep agent-level flags in sync so every read path sees the inheritance.
  // ai_agents.developer_id is TEXT, so dev identities of any shape match.
  try {
    await supabase
      .from('ai_agents')
      .update({
        world_verified: true,
        human_backed: true,
        verification_method: 'worldid_v4',
        world_verified_at: now
      })
      .eq('developer_id', developerId);
  } catch {
    // Gateway issue — try direct DB
    try {
      await pool.query(
        `UPDATE ai_agents SET world_verified = true, human_backed = true,
         verification_method = 'worldid_v4', world_verified_at = $1
         WHERE developer_id = $2`,
        [now, developerId]
      );
    } catch (directErr) {
      logger.warn('[WORLD_ID] agent flags update failed:', directErr.message);
    }
  }

  return profile;
};

/**
 * User-level verification status. The user is verified if the PROFILE flag is
 * set — agent flags are treated as legacy/derived state only.
 */
export const getUserVerificationStatus = async (developerId) => {
  if (!developerId) return { verified: false };
  const pool = getPool();

  // Direct DB is the most reliable path — check profiles first
  if (UUID_RE.test(developerId)) {
    try {
      const { rows } = await pool.query(
        'SELECT world_verified, world_verified_at, world_nullifier FROM profiles WHERE id = $1',
        [developerId]
      );
      if (rows[0]?.world_verified) {
        return { verified: true, verifiedAt: rows[0].world_verified_at || null, nullifier: rows[0].world_nullifier || null };
      }
    } catch { /* fall through */ }
    // Also try gateway
    try {
      const { data } = await supabase
        .from('profiles')
        .select('world_verified, world_verified_at, world_nullifier')
        .eq('id', developerId)
        .maybeSingle();
      if (data?.world_verified) {
        return { verified: true, verifiedAt: data.world_verified_at || null, nullifier: data.world_nullifier || null };
      }
    } catch { /* fall through */ }
  }

  // Fallback: derive verification from agent-level flags
  try {
    const { rows } = await pool.query(
      'SELECT world_verified_at FROM ai_agents WHERE developer_id = $1 AND world_verified = true LIMIT 1',
      [developerId]
    );
    if (rows[0]) return { verified: true, verifiedAt: rows[0].world_verified_at || null };
  } catch { /* fall through */ }
  try {
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('world_verified_at')
      .eq('developer_id', developerId)
      .eq('world_verified', true)
      .limit(1)
      .maybeSingle();
    if (agent) return { verified: true, verifiedAt: agent.world_verified_at || null };
  } catch { /* fall through */ }
  return { verified: false };
};
