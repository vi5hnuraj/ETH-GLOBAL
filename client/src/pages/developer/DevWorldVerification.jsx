import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiShield, FiCheckCircle, FiAlertTriangle, FiClock, FiRefreshCw, FiGlobe, FiUsers, FiLink, FiX } from 'react-icons/fi';
import QRCode from 'qrcode';
import { IDKitRequestWidget, proofOfHuman } from '@worldcoin/idkit';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';
import developerApi from '../../utils/developerApi';

const WORLD_ACTION = 'publish-service';

/* Surface IDKit's internal diagnostics in the browser console */
if (typeof window !== 'undefined' && !window.IDKIT_DEBUG) {
  window.IDKIT_DEBUG = true;
}

/**
 * AgentBook registration card — the official agentkit-cli flow.
 *
 * Spawns `agentkit-cli register <wallet>` on the backend, shows the
 * world.org/verify link as a QR + clickable link, and polls until the
 * registration is confirmed on World Chain. Independent of the IDKit popup —
 * this is the path documented at docs.world.org/agents/agent-kit/integrate.
 */
function AgentBookRegistrationCard({ agents, onCompleted, autoStartAgentId, onAutoStartConsumed }) {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [session, setSession] = useState(null); // { sessionId, verifyUrl, status, humanId, txHash, error }
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!selectedAgent && agents.length > 0) setSelectedAgent(agents[0].agentId);
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (session?.verifyUrl) {
      QRCode.toDataURL(session.verifyUrl, { width: 220, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [session?.verifyUrl]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((sessionId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const s = await developerApi.agentBookSession(sessionId);
        setSession((prev) => ({ ...prev, ...s }));
        if (s.status === 'completed') {
          stopPolling();
          onCompleted?.();
        } else if (s.status === 'failed') {
          stopPolling();
        }
      } catch { /* transient — keep polling */ }
    }, 4000);
  }, [onCompleted, stopPolling]);

  const startRegistration = async (agentIdArg) => {
    const target = agentIdArg || selectedAgent;
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await developerApi.agentBookRegister(target);
      setSession({ sessionId: res.sessionId, verifyUrl: res.verifyUrl, status: 'pending' });
      startPolling(res.sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /* Triggered by the per-row Register button in the agents table below. */
  useEffect(() => {
    if (!autoStartAgentId) return;
    setSelectedAgent(autoStartAgentId);
    startRegistration(autoStartAgentId).finally(() => onAutoStartConsumed?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAgentId]);

  const cancel = async () => {
    stopPolling();
    if (session?.sessionId) {
      try { await developerApi.agentBookCancel(session.sessionId); } catch { /* noop */ }
    }
    setSession(null);
  };

  const completed = session?.status === 'completed';
  const failed = session?.status === 'failed';

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <FiGlobe size={14} className="text-violet-400" /> AgentBook Registration
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-normal text-zinc-500">official agentkit-cli flow</span>
      </h2>
      <p className="mt-1 text-xs text-zinc-400">
        Registers your agent's wallet in AgentBook on World Chain — the on-chain registry that proves an agent
        is backed by a real human. This is what the marketplace and x402 gate resolve at request time.
      </p>
      <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-300">
        Your GlobalPay World ID proof is complete. AgentBook still requires a wallet-specific World App approval to create the on-chain human-to-agent registration; the account proof cannot be silently reused for that transaction.
      </p>

      {!session && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200"
          >
            {agents.length === 0 && <option value="">No agents available</option>}
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>
            ))}
          </select>
          <button
            type="button"
             onClick={() => startRegistration()}
            disabled={!selectedAgent || busy}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Register in AgentBook'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400">{error}</p>}

      {session && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          {completed ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <FiCheckCircle size={16} /> Registered in AgentBook
              </p>
              <p className="font-mono text-[11px] text-zinc-400">humanId: {session.humanId}</p>
              {session.txHash && <p className="font-mono text-[11px] text-zinc-500">tx: {session.txHash.slice(0, 18)}…{session.txHash.slice(-8)}</p>}
              <button type="button" onClick={onCompleted} className="mt-1 text-xs text-violet-400 hover:text-violet-300">Refresh status →</button>
            </div>
          ) : failed ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-rose-300"><FiAlertTriangle size={14} /> Registration failed</p>
              <p className="text-xs text-zinc-400">{session.error || 'Unknown error'}</p>
              <button type="button" onClick={cancel} className="text-xs text-violet-400 hover:text-violet-300">Try again</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="Scan with World App" className="h-[220px] w-[220px] shrink-0 rounded-lg border border-zinc-700 bg-white p-2" />
              )}
              <div className="min-w-0 flex-1 space-y-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FiClock size={14} className="animate-pulse text-violet-400" /> Waiting for World App approval…
                </p>
                <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-400">
                   <li>Open the <strong className="text-zinc-200">World App</strong> on your phone</li>
                   <li>Complete the wallet-specific World ID approval in World App</li>
                   <li>Wait for the AgentBook transaction to confirm</li>
                </ol>
                <a
                  href={session.verifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 break-all font-mono text-[11px] text-violet-400 hover:text-violet-300"
                >
                  <FiLink size={11} className="shrink-0" /> {session.verifyUrl.slice(0, 60)}…
                </a>
                <button type="button" onClick={cancel} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
                  <FiX size={12} /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Agent Identity — World ID verification, ONCE PER USER.
 *
 * The user verifies a single time; every agent they own (current and future)
 * inherits "Human Verified". The button disappears after verification.
 */
export default function DevWorldVerification() {
  const [userStatus, setUserStatus] = useState(null); // { verified, verifiedAt }
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [widgetOpen, setWidgetOpen] = useState(false);
  const [rpContext, setRpContext] = useState(null);
  const [configState, setConfigState] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [autoStartAgentId, setAutoStartAgentId] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [statusRes, agentsRes, cfg] = await Promise.allSettled([
        developerApi.worldUserStatus(),
        developerApi.worldAgents(),
        developerApi.worldIdkitConfig()
      ]);
      if (statusRes.status === 'fulfilled') setUserStatus(statusRes.value);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.agents || []);
      if (cfg.status === 'fulfilled') setConfigState(cfg.value.config);
      if (statusRes.status === 'rejected' && agentsRes.status === 'rejected') {
        setError(statusRes.reason?.message || 'Failed to load verification status');
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  /* Step 3 — RP signature from our backend, then open the widget */
  const startVerification = async () => {
    setVerifyResult(null);
    try {
      const sig = await developerApi.worldIdkitSign(WORLD_ACTION);
      setRpContext({
        rp_id: configState?.rpId,
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig
      });
      setWidgetOpen(true);
    } catch (err) {
      setVerifyResult({ verified: false, reason: err.message });
    }
  };

  /* Steps 4–6 — proof → backend verifies with World → profile updated */
  const handleVerifyProof = async (result) => {
    const resp = await developerApi.worldIdkitVerify({
      idkitResponse: result,
      action: WORLD_ACTION
    });
    if (!resp?.verified) throw new Error(resp?.message || 'Backend verification failed');
    return resp;
  };

  const onSuccess = () => {
    setVerifyResult({ verified: true });
    setWidgetOpen(false);
    fetchAll(); // re-read user status + agents (all now inherit)
  };

  const verified = Boolean(userStatus?.verified);
  const widgetReady = configState?.configured && configState?.rpId;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Agent Identity</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
            <FiShield size={12} /> World AgentKit
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">Verify once with World ID. Then choose which individual agent wallets to register in AgentBook.</p>
        <div className="flex items-center gap-2 text-xs"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">{verified ? '✓ Human Verified' : '○ Verification Required'}</span><span className="rounded-full border border-zinc-800 px-3 py-1.5 text-zinc-400">{verified ? 'Publishing Enabled' : 'Publishing Locked'}</span></div>
      </header>

      {error && <ErrorBanner message={error} onRetry={fetchAll} />}

      <div className="grid gap-2 md:grid-cols-3">
        {[
          ['World ID Verification', verified],
          ['Publishing Unlocked', verified],
          ['AgentBook Registration', agents.some((agent) => Boolean(agent.agentBookId))]
        ].map(([label, done], index) => <div key={label} className={`rounded-lg border px-3 py-2.5 text-xs ${done ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'}`}><span className="mr-2 font-semibold">{done ? '✓' : '○'} Step {index + 1}</span>{label}</div>)}
      </div>

      {/* User-level status card */}
      <Card className={verified ? 'border-emerald-800/60 bg-emerald-950/20' : ''}>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">World ID Sandbox / Staging Proof</p>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {verified ? (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <FiCheckCircle size={16} /> You are World-verified
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {userStatus?.verifiedAt && <>Verified {new Date(userStatus.verifiedAt).toLocaleString()} · </>}
                  All <strong className="text-zinc-200">{agents.length}</strong> of your agents inherit Human-verified status.
                  Publishing is unlocked account-wide.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">One verification unlocks everything</p>
                <p className="mt-1 text-xs text-zinc-400">
                  World ID proves you are a real, unique human. It never shares personal data — GlobalPay only
                  receives an anonymous nullifier. Verify once; every agent you ever create inherits it.
                </p>
              </>
            )}
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${verified ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
            {verified ? '✓ Verified' : '○ Not verified'}
          </span>
        </div>

        {!verified && (
          <>
            <button
              type="button"
              onClick={startVerification}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              disabled={!widgetReady}
              title={widgetReady ? 'Opens the official World ID verification popup' : 'World ID not configured on the server'}
            >
              <FiShield size={14} />
              {widgetReady ? 'Verify with World ID' : 'World ID not configured'}
            </button>
            {!widgetReady && (
              <p className="mt-2 text-[11px] text-amber-400">
                Server env missing: WORLD_APP_ID / WORLD_RP_ID / WORLD_RP_SIGNING_KEY
              </p>
            )}
          </>
        )}

        {verified && (
          <button
            type="button"
            onClick={fetchAll}
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <FiRefreshCw size={12} /> Refresh
          </button>
        )}

        {verifyResult && (
          <div className={`mt-3 rounded-lg p-3 text-xs ${verifyResult.verified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {verifyResult.verified
              ? '✅ Verified — every agent you own is now Human-backed and publishing is unlocked.'
              : `❌ ${verifyResult.reason || 'Verification failed'}`}
          </div>
        )}

        {!verified && widgetReady && (
          <IDKitRequestWidget
            open={widgetOpen}
            onOpenChange={setWidgetOpen}
            app_id={configState.appId}
            action={WORLD_ACTION}
            rp_context={rpContext}
            allow_legacy_proofs={true}
            environment={configState.environment || 'staging'}
            preset={proofOfHuman({ signal: WORLD_ACTION })}
            handleVerify={handleVerifyProof}
            onSuccess={onSuccess}
            onError={(err) => {
              const detail = err?.message || err?.code || 'Verification cancelled or failed';
              console.error('[WorldID] error:', err);
              setVerifyResult({ verified: false, reason: detail });
            }}
          />
        )}
      </Card>

      {/* AgentBook registration — official agentkit-cli flow (per-agent wallet) */}
      <AgentBookRegistrationCard
        agents={agents}
        onCompleted={fetchAll}
        autoStartAgentId={autoStartAgentId}
        onAutoStartConsumed={() => setAutoStartAgentId(null)}
      />

      {/* AgentBook registration is per-agent; World ID is account-level. */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Registered Agents</h2>
          <button onClick={fetchAll} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
            <FiRefreshCw size={12} /> Refresh
          </button>
        </div>
        {loading ? (
          <Skeleton lines={3} />
        ) : agents.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-zinc-500">No agents found. Create an agent in the Agent Studio first.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-500"><tr><th className="px-4 py-3 font-medium">Agent</th><th className="px-4 py-3 font-medium">Wallet</th><th className="px-4 py-3 font-medium">World ID</th><th className="px-4 py-3 font-medium">AgentBook</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>{agents.map((agent) => { const registered = Boolean(agent.agentBookId); return <tr key={agent.agentId} className="border-t border-zinc-800 bg-zinc-950/30"><td className="px-4 py-3 font-medium text-zinc-200">{agent.name || agent.agentId}</td><td className="px-4 py-3 font-mono text-zinc-500">{agent.walletAddress ? `${agent.walletAddress.slice(0, 8)}…${agent.walletAddress.slice(-6)}` : '—'}</td><td className="px-4 py-3 text-emerald-400">{verified || agent.worldVerified ? '✓ Verified' : '○ Pending'}</td><td className={`px-4 py-3 ${registered ? 'text-emerald-400' : 'text-amber-400'}`}>{registered ? '✓ Registered' : 'Not registered'}</td><td className="px-4 py-3">{registered ? <span className="text-zinc-600">Ready</span> : <button type="button" onClick={() => setAutoStartAgentId(agent.agentId)} className="font-semibold text-violet-400 hover:text-violet-300">Register</button>}</td></tr>; })}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
