import React, { useState, useEffect } from 'react';
import { FiShield, FiCheckCircle, FiAlertTriangle, FiClock, FiExternalLink, FiRefreshCw, FiUser, FiGlobe } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const StatusBadge = ({ verified, humanBacked }) => {
  if (verified && humanBacked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
        <FiCheckCircle size={12} /> Verified Human-backed Agent
      </span>
    );
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-400">
        <FiShield size={12} /> AgentBook Registered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/20 px-3 py-1 text-xs font-semibold text-zinc-400">
      <FiAlertTriangle size={12} /> Unverified
    </span>
  );
};

const AgentCard = ({ agent, onVerify }) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await developerApi.worldVerify(agent.agentId);
      setVerifyResult(result);
      if (result.verified) onVerify?.();
    } catch (err) {
      setVerifyResult({ verified: false, reason: err.message });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{agent.name || agent.agentId}</h3>
          <p className="mt-1 font-mono text-xs text-zinc-500">{agent.agentId}</p>
        </div>
        <StatusBadge verified={agent.worldVerified} humanBacked={agent.humanBacked} />
      </div>

      <div className="mt-4 space-y-2 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <FiGlobe size={12} className="text-zinc-500" />
          <span>Wallet:</span>
          <span className="font-mono text-zinc-300">{agent.walletAddress?.slice(0, 10)}…{agent.walletAddress?.slice(-8)}</span>
        </div>
        {agent.worldVerified && (
          <>
            <div className="flex items-center gap-2">
              <FiShield size={12} className="text-emerald-400" />
              <span>AgentBook ID:</span>
              <span className="font-mono text-emerald-300">{agent.agentBookId?.slice(0, 20)}…</span>
            </div>
            <div className="flex items-center gap-2">
              <FiClock size={12} className="text-zinc-500" />
              <span>Verified:</span>
              <span className="text-zinc-300">{agent.verifiedAt ? new Date(agent.verifiedAt).toLocaleDateString() : 'N/A'}</span>
            </div>
          </>
        )}
      </div>

      {!agent.worldVerified && (
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {verifying ? <FiRefreshCw className="animate-spin" size={14} /> : <FiShield size={14} />}
          {verifying ? 'Verifying with World AgentKit…' : 'Verify Human-backed Agent'}
        </button>
      )}

      {verifyResult && (
        <div className={`mt-3 rounded-lg p-3 text-xs ${verifyResult.verified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
          {verifyResult.verified
            ? `✅ Agent verified — registered in AgentBook`
            : `❌ ${verifyResult.reason || 'Not registered in AgentBook. Register with: npx @worldcoin/agentkit-cli register <address>'}`
          }
        </div>
      )}
    </div>
  );
};

export default function DevWorldVerification() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const result = await developerApi.worldAgents();
      setAgents(result.agents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAgents(); }, []);

  const verifiedCount = agents.filter((a) => a.worldVerified).length;
  const totalCount = agents.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Agent Identity</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
            <FiShield size={12} /> World AgentKit
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Verify your identity with World ID before publishing AI services.
          Verified providers display a "Human Verified" badge in the marketplace, proving they are backed by a real human.
        </p>
      </header>

      {error && <ErrorBanner message={error} />}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{totalCount}</p>
            <p className="mt-1 text-xs text-zinc-500">Total Agents</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-400">{verifiedCount}</p>
            <p className="mt-1 text-xs text-zinc-500">Verified Human-backed</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-violet-400">🔓</p>
            <p className="mt-1 text-xs text-zinc-500">Publish Unlocked</p>
          </div>
        </Card>
      </div>

      {/* How it works */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">How World AgentKit Works</h2>
        <div className="space-y-2 text-xs text-zinc-400">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-[10px] font-bold text-violet-300">1</span>
            <p>Verify your identity using World App (World ID proof of personhood).</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-[10px] font-bold text-violet-300">2</span>
            <p>Your agent wallet is registered in AgentBook on World Chain.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-[10px] font-bold text-violet-300">3</span>
            <p>Unlocks the ability to publish AI services in the marketplace.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-[10px] font-bold text-violet-300">4</span>
            <p>Buyers see a "✓ Human Verified" badge — proof you are a real person, not a bot.</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-zinc-950 p-3 text-xs text-zinc-500">
          <p className="font-semibold text-zinc-400">Registration command:</p>
          <code className="mt-1 block font-mono text-violet-300">npx @worldcoin/agentkit-cli register {'<agent-wallet-address>'}</code>
        </div>
      </Card>

      {/* Agent list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Your Agents</h2>
          <button onClick={fetchAgents} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
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
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} onVerify={fetchAgents} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
