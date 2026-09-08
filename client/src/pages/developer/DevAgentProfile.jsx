import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCpu, FiDollarSign, FiShield, FiCheckCircle, FiClock, FiGlobe,
  FiPackage, FiTrendingUp, FiAlertTriangle, FiRefreshCw, FiExternalLink,
  FiZap, FiShoppingBag, FiBarChart2, FiArrowRight, FiLock, FiUnlock
} from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

/* ═══════════════ LIFELINE TIMELINE ═══════════════ */

const LIFECYCLE_STAGES = [
  { key: 'created', label: 'Agent Created', icon: FiCpu, color: 'text-violet-400', bg: 'bg-violet-500/20' },
  { key: 'wallet', label: 'Wallet Funded', icon: FiDollarSign, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  { key: 'verified', label: 'World Verified', icon: FiShield, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  { key: 'published', label: 'Service Published', icon: FiPackage, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { key: 'settlement', label: 'First Settlement', icon: FiZap, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  { key: 'reputation', label: 'Reputation Built', icon: FiTrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/20' },
  { key: 'top', label: 'Top Provider', icon: FiBarChart2, color: 'text-amber-400', bg: 'bg-amber-500/20' },
];

const TimelineStage = ({ stage, completed, current }) => {
  const Icon = stage.icon;
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        completed ? stage.bg : current ? 'bg-violet-600/30 animate-pulse' : 'bg-zinc-800'
      }`}>
        <Icon size={14} className={completed ? stage.color : current ? 'text-violet-400' : 'text-zinc-600'} />
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-medium ${completed ? 'text-white' : current ? 'text-violet-300' : 'text-zinc-500'}`}>
          {stage.label}
        </p>
      </div>
      {completed && <FiCheckCircle size={12} className="ml-auto text-emerald-400 shrink-0" />}
    </div>
  );
};

const LifecycleTimeline = ({ agent, balance, reputation, services, verification }) => {
  const stages = useMemo(() => {
    const hasBalance = Number(balance || 0) > 0;
    const hasServices = services?.length > 0;
    const hasReputation = reputation?.paymentCount > 0;
    const isTopProvider = reputation?.trustScore >= 80;

    const completed = {
      created: true,
      wallet: hasBalance,
      verified: verification?.verified || false,
      published: hasServices,
      settlement: hasReputation,
      reputation: reputation?.trustScore >= 50,
      top: isTopProvider
    };

    let currentStage = 'created';
    for (const s of LIFECYCLE_STAGES) {
      if (completed[s.key]) currentStage = s.key;
      else break;
    }

    return { completed, currentStage };
  }, [agent, balance, reputation, services, verification]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-200">Agent Lifecycle</h2>
        <span className="text-[10px] text-zinc-500">
          {Object.values(stages.completed).filter(Boolean).length}/{LIFECYCLE_STAGES.length} stages
        </span>
      </div>
      <div className="space-y-3">
        {LIFECYCLE_STAGES.map((stage) => (
          <TimelineStage
            key={stage.key}
            stage={stage}
            completed={stages.completed[stage.key]}
            current={stages.currentStage === stage.key && !stages.completed[stage.key]}
          />
        ))}
      </div>
    </Card>
  );
};

/* ═══════════════ SPONSOR CARDS ═══════════════ */

const SponsorCard = ({ title, sponsor, icon: Icon, color, children }) => (
  <div className={`rounded-xl border ${color} p-4`}>
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className={color.split(' ')[1]} />
      <h3 className="text-xs font-semibold text-zinc-300">{title}</h3>
      <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">{sponsor}</span>
    </div>
    {children}
  </div>
);

/* ═══════════════ MAIN COMPONENT ═══════════════ */

export default function DevAgentProfile() {
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState(null);

  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 50 }) });
  const agents = agentsState.data?.agents || [];

  useEffect(() => {
    if (agents.length && !selectedAgent) {
      setSelectedAgent(agents[0]);
    }
  }, [agents, selectedAgent]);

  const agentId = selectedAgent?.agentId;

  const verificationState = useApi({
    fetcher: () => agentId ? developerApi.worldStatus(agentId) : Promise.resolve(null),
    deps: [agentId]
  });

  const balanceState = useApi({
    fetcher: () => agentId ? developerApi.agentBalance(agentId) : Promise.resolve({ balance: '0' }),
    deps: [agentId]
  });

  const servicesState = useApi({
    fetcher: () => agentId ? developerApi.services() : Promise.resolve({ services: [] }),
    deps: [agentId]
  });

  const reputationState = useApi({
    fetcher: () => agentId ? developerApi.reputation(agentId) : Promise.resolve(null),
    deps: [agentId]
  });

  const agent = selectedAgent;
  const verification = verificationState.data;
  const balance = balanceState.data?.balance || '0';
  const services = (servicesState.data?.services || []).filter(s => s.agentId === agentId);
  const reputation = reputationState.data;

  if (agentsState.loading) return <Skeleton lines={5} />;
  if (agentsState.error) return <ErrorBanner message={agentsState.error.message} />;
  if (!agent) return (
    <div className="text-center py-20">
      <FiCpu size={48} className="mx-auto text-zinc-600 mb-4" />
      <h2 className="text-lg font-semibold text-white mb-2">No agents yet</h2>
      <p className="text-sm text-zinc-500 mb-4">Create your first AI agent to get started.</p>
      <button onClick={() => navigate('/developer/agents')} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">
        Create Agent
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{agent.name || agent.agentId}</h1>
          <p className="text-sm text-zinc-500">{agent.agentId}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={agent.agentId}
            onChange={(e) => {
              const a = agents.find(x => x.agentId === e.target.value);
              if (a) setSelectedAgent(a);
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"
          >
            {agents.map(a => <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>)}
          </select>
          <button onClick={() => navigate('/developer/agents')} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800">
            Manage Agents
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Timeline + Quick Stats */}
        <div className="col-span-4 space-y-4">
          <LifecycleTimeline
            agent={agent}
            balance={balance}
            reputation={reputation}
            services={services}
            verification={verification}
          />

          {/* Wallet Card */}
          <SponsorCard title="Arc Wallet" sponsor="Arc" icon={FiDollarSign} color="border-cyan-500/20 bg-cyan-500/5 text-cyan-400">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Balance</span>
                <span className="font-mono text-white">{Number(balance).toFixed(4)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Address</span>
                <span className="font-mono text-zinc-400">{agent.walletAddress?.slice(0, 8)}…</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Provider</span>
                <span className="text-zinc-400">{agent.walletProvider || 'MPC'}</span>
              </div>
            </div>
          </SponsorCard>

          {/* World Identity Card */}
          <SponsorCard title="Identity" sponsor="World AgentKit" icon={FiShield} color="border-violet-500/20 bg-violet-500/5 text-violet-400">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Status</span>
                {verification?.verified ? (
                  <span className="flex items-center gap-1 text-emerald-400"><FiCheckCircle size={11} /> Verified</span>
                ) : (
                  <span className="flex items-center gap-1 text-zinc-500"><FiLock size={11} /> Unverified</span>
                )}
              </div>
              {verification?.verified && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">AgentBook</span>
                    <span className="font-mono text-zinc-400">{verification.agentBookId?.slice(0, 12)}…</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Verified</span>
                    <span className="text-zinc-400">{verification.verifiedAt ? new Date(verification.verifiedAt).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </>
              )}
              {!verification?.verified && (
                <button
                  onClick={() => navigate('/developer/world-verification')}
                  className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  <FiShield size={12} className="inline mr-1" /> Verify with World
                </button>
              )}
            </div>
          </SponsorCard>
        </div>

        {/* Right: Reputation + Services */}
        <div className="col-span-8 space-y-4">
          {/* Trust Engine Card */}
          <SponsorCard title="Trust Engine" sponsor="The Graph" icon={FiShield} color="border-violet-500/20 bg-violet-500/5 text-violet-400">
            {reputation ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{reputation.trustScore ?? 'N/A'}</p>
                  <p className="text-[10px] text-zinc-500">Trust Score</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{reputation.paymentCount ?? 0}</p>
                  <p className="text-[10px] text-zinc-500">Settlements</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-cyan-400">{reputation.successRate != null ? `${(reputation.successRate * 100).toFixed(0)}%` : 'N/A'}</p>
                  <p className="text-[10px] text-zinc-500">Success Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{reputation.riskLevel || 'N/A'}</p>
                  <p className="text-[10px] text-zinc-500">Risk Level</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No settlement history yet. Receive your first payment to build reputation.</p>
            )}
          </SponsorCard>

          {/* Published Services */}
          <SponsorCard title="Published Services" sponsor="GlobalPay" icon={FiPackage} color="border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
            {services.length > 0 ? (
              <div className="space-y-2">
                {services.slice(0, 5).map(s => (
                  <div key={s.serviceId} className="flex items-center justify-between rounded-lg bg-zinc-900/50 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-white">{s.title}</p>
                      <p className="text-[10px] text-zinc-500">{s.category} · {s.pricingModel}</p>
                    </div>
                    <span className="text-xs font-mono text-emerald-400">{Number(s.unitPrice).toFixed(4)} USDC</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-zinc-500 mb-2">No services published yet</p>
                {!verification?.verified ? (
                  <button
                    onClick={() => navigate('/developer/world-verification')}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
                  >
                    <FiShield size={11} className="inline mr-1" /> Verify First
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/developer/marketplace/services/publish')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <FiPackage size={11} className="inline mr-1" /> Publish Service
                  </button>
                )}
              </div>
            )}
          </SponsorCard>

          {/* Recent Activity */}
          <SponsorCard title="Recent Activity" sponsor="GlobalPay" icon={FiClock} color="border-zinc-700/50 bg-zinc-900/30 text-zinc-400">
            <div className="space-y-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <FiCpu size={12} className="text-violet-400" />
                <span>Agent created</span>
                <span className="ml-auto text-zinc-600">{agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
              {verification?.verified && (
                <div className="flex items-center gap-2">
                  <FiShield size={12} className="text-emerald-400" />
                  <span>World verified</span>
                  <span className="ml-auto text-zinc-600">{verification.verifiedAt ? new Date(verification.verifiedAt).toLocaleDateString() : 'N/A'}</span>
                </div>
              )}
              {services.length > 0 && (
                <div className="flex items-center gap-2">
                  <FiPackage size={12} className="text-amber-400" />
                  <span>{services.length} service(s) published</span>
                </div>
              )}
              {reputation?.paymentCount > 0 && (
                <div className="flex items-center gap-2">
                  <FiZap size={12} className="text-cyan-400" />
                  <span>{reputation.paymentCount} settlement(s) received</span>
                </div>
              )}
            </div>
          </SponsorCard>
        </div>
      </div>
    </div>
  );
}
