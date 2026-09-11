/**
 * AgentBook Registration Service — registers agent wallets with World ID-verified humans.
 *
 * Uses the OFFICIAL @worldcoin/agentkit-cli register flow (docs.world.org/agents/agent-kit/integrate):
 *   1. Spawn `agentkit-cli register <wallet>` — it looks up the nonce, creates the
 *      registration payload, and prints a `https://world.org/verify?t=wld&...` link
 *      that must be opened in the World App (sandbox app works for staging).
 *   2. Surface that link to the frontend (rendered as a QR / clickable link).
 *   3. Poll: when the human approves in the World App, the CLI submits the
 *      registration transaction on World Chain and exits; we confirm independently
 *      through the AgentBook canonical contract (createAgentBookVerifier.lookupHuman).
 *   4. Persist: agent_book_id (humanId), human_backed, verification_method,
 *      world_verified + agentbook_tx_hash on the ai_agents row.
 *
 * Sessions are in-memory (single-process dev/staging). Production would persist
 * the session + child PID in Redis — see WORLD_AGENTKIT_FEEDBACK.md.
 */
import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { supabase } from '../config/supabaseClient.js';

const sessions = new Map(); // sessionId -> { agentId, wallet, url, proc, status, startedAt, humanId, txHash, error }

// Keep the local session longer than the CLI process so delayed approval can
// still be detected. This does not extend the World-issued QR itself.
const SESSION_TTL_MS = 30 * 60 * 1000;

const gcSessions = () => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.status === 'completed' || now - s.startedAt > SESSION_TTL_MS) {
      if (s.proc && !s.proc.killed && ['pending', 'cli_submitted', 'awaiting_confirmation'].includes(s.status)) {
        try { s.proc.kill(); } catch { /* already dead */ }
      }
      sessions.delete(id);
    }
  }
};

const runStatusCheck = async (wallet) => {
  // Independent on-chain confirmation via the SDK (canonical World Chain AgentBook).
  const { createAgentBookVerifier } = await import('@worldcoin/agentkit');
  const verifier = createAgentBookVerifier();
  const humanId = await verifier.lookupHuman(wallet);
  return humanId || null;
};

/**
 * Start a registration session for an agent wallet.
 * Returns { sessionId, verifyUrl } once the CLI prints the verify link.
 */
export const startRegistration = async ({ agentId, wallet }) => {
  gcSessions();

  return new Promise((resolve, reject) => {
    const sessionId = `abreg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const proc = spawn('npx', ['-y', '@worldcoin/agentkit-cli', 'register', wallet], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const session = {
      sessionId, agentId, wallet, proc,
      status: 'pending', url: null, humanId: null, txHash: null,
      error: null, startedAt: Date.now()
    };
    sessions.set(sessionId, session);

    let stdoutBuf = '';

    const extractUrl = (text) => {
      const m = text.match(/https:\/\/world\.org\/verify\?[^\s"]+/);
      return m ? m[0] : null;
    };

    proc.stdout.on('data', (d) => {
      stdoutBuf += d.toString();
      const url = extractUrl(stdoutBuf);
      if (url && !session.url) {
        session.url = url;
        logger.info(`[AGENTBOOK] verify link ready for ${wallet} (session ${sessionId})`);
        resolve({ sessionId, verifyUrl: url });
      }
    });

    proc.stderr.on('data', (d) => {
      logger.warn(`[AGENTBOOK cli] ${d.toString().slice(0, 200)}`);
    });

    proc.on('error', (err) => {
      session.status = 'failed';
      session.error = err.message;
      if (!session.url) reject(err);
    });

    proc.on('close', async (code) => {
      session.exitCode = code;
      if (code === 0) {
        session.status = 'cli_submitted';
        try {
          const humanId = await runStatusCheck(wallet);
          if (humanId) {
            session.status = 'completed';
            session.humanId = humanId;
            const tx = (stdoutBuf.match(/0x[a-fA-F0-9]{64}/) || [])[0] || null;
            session.txHash = tx;
            await persistRegistration({ agentId, wallet, humanId, txHash: tx });
            logger.info(`[AGENTBOOK] registration CONFIRMED for ${wallet} humanId=${humanId}`);
          } else {
            session.status = 'awaiting_confirmation';
            session.error = 'World App approval was received, but AgentBook indexing is still pending. Keep this session open while GlobalPay checks again.';
          }
        } catch (err) {
          session.status = 'awaiting_confirmation';
          session.error = `AgentBook confirmation is temporarily unavailable: ${err.message}`;
        }
      } else if (session.status === 'pending') {
        session.status = session.url ? 'awaiting_confirmation' : 'failed';
        session.error = session.url
          ? 'The CLI stopped before confirmation. GlobalPay will continue checking AgentBook; if World expired the request, generate a new QR.'
          : `agentkit-cli exited with code ${code} before producing a verification request. Output: ${stdoutBuf.slice(-300)}`;
      }
    });

    // Safety: never leave the promise unresolved if the link never prints.
    setTimeout(() => {
      if (!session.url && session.status === 'pending') {
        try { proc.kill(); } catch { /* noop */ }
        reject(new Error('agentkit-cli did not produce a verify link within 120s.'));
      }
    }, 120_000);
  });
};

/** Persist a confirmed AgentBook registration onto the agent row. */
export const persistRegistration = async ({ agentId, wallet, humanId, txHash }) => {
  const { error } = await supabase
    .from('ai_agents')
    .update({
      world_verified: true,
      human_backed: true,
      verification_method: 'agentbook',
      agent_book_id: humanId,
      agentbook_tx_hash: txHash,
      world_verified_at: new Date().toISOString()
    })
    .eq('agent_id', agentId);
  if (error) throw new Error(`Failed to persist AgentBook registration: ${error.message}`);
  return true;
};

/**
 * Poll a session: status, verify link, and (independently of CLI exit)
 * whether AgentBook already resolves the wallet — so the UI can complete
 * even if the CLI process lingers.
 */
export const getSessionStatus = async (sessionId) => {
  gcSessions();
  const s = sessions.get(sessionId);
  if (!s) return { found: false };

  // Independent check — catches the case where the human approved and the
  // chain indexed while the CLI is still finishing up.
    if (s.status === 'pending' || s.status === 'cli_submitted' || s.status === 'awaiting_confirmation') {
    try {
      const humanId = await runStatusCheck(s.wallet);
      if (humanId && s.status !== 'completed') {
        s.status = 'completed';
        s.humanId = humanId;
        await persistRegistration({ agentId: s.agentId, wallet: s.wallet, humanId, txHash: s.txHash });
        try { s.proc.kill(); } catch { /* noop */ }
      }
    } catch (err) {
      logger.debug(`[AGENTBOOK] status poll for ${s.wallet}: ${err.message}`);
    }
  }

  return {
    found: true,
    sessionId: s.sessionId,
    agentId: s.agentId,
    wallet: s.wallet,
    status: s.status,           // pending | cli_submitted | awaiting_confirmation | completed | failed
    verifyUrl: s.url,
    humanId: s.humanId,
    txHash: s.txHash,
    error: s.error,
    elapsedMs: Date.now() - s.startedAt
  };
};

/** Cancel a pending session (user closed the QR). */
export const cancelRegistration = (sessionId) => {
  const s = sessions.get(sessionId);
  if (!s) return false;
  try { s.proc.kill(); } catch { /* noop */ }
  sessions.delete(sessionId);
  return true;
};
