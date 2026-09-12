import React, { useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiSearch,
  FiShield,
  FiZap
} from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const stages = [
  { id: 'observe', label: 'Observe', description: 'Find providers and evidence', Icon: FiSearch },
  { id: 'decide', label: 'Decide', description: 'Rank by trust and risk', Icon: FiShield },
  { id: 'pay', label: 'Pay on Arc', description: 'Settle within policy', Icon: FiDollarSign },
  { id: 'verify', label: 'Verify', description: 'Confirm the on-chain result', Icon: FiCheckCircle }
];

const stageState = (id, { busy, result }) => {
  if (busy) return id === 'observe' || id === 'decide' ? 'active' : 'pending';
  if (!result) return 'pending';
  if (id === 'observe' || id === 'decide') return 'complete';
  if (id === 'pay') return result.executionMode === 'approval' || result.arcSettlement?.success ? 'complete' : 'active';
  return result.verification?.verified ? 'complete' : 'active';
};

const displayProvider = (provider) => provider?.title || provider?.serviceId || provider?.name || 'Provider not available';

const formatTrust = (result) => result?.trustScore ?? result?.graphEvidence?.trustScore ?? 'Unknown';

export default function DevAutonomousCommerce() {
  const agents = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const [goal, setGoal] = useState('Find the safest OCR provider and purchase one credit.');
  const [consumerAgentId, setConsumerAgentId] = useState('');
  const [executionMode, setExecutionMode] = useState('automatic');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const list = agents.data?.agents || [];

  const run = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await developerApi.autonomousCommerce({
        goal,
        consumerAgentId,
        quantity: '1',
        invoke: false,
        executionMode
      }));
    } catch (err) {
      setError(err.message || 'Autonomous commerce failed.');
    } finally {
      setBusy(false);
    }
  };

  const automatic = executionMode === 'automatic';
  const settlement = result?.arcSettlement;
  const verification = result?.verification;
  const evidence = result?.graphEvidence;

  const approvePurchase = async () => {
    if (!result?.pendingSession?.sessionId) return;
    setApprovalBusy(true);
    setError(null);
    try {
      const payment = await developerApi.confirmPrepaidPurchase(result.pendingSession.sessionId);
      setResult((current) => ({
        ...current,
        executionMode: 'automatic',
        arcSettlement: payment,
        verification: payment.verification || payment.settlementVerification || null,
        pendingSession: null
      }));
    } catch (err) {
      setError(err.message || 'Approval payment failed.');
    } finally {
      setApprovalBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-zinc-900/70 to-cyan-500/10 p-6 sm:p-8">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-violet-300">Developer workflow</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300"><FiZap size={12} /> Graph → Decide → Arc → Verify</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Autonomous Commerce</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Give an agent a goal. It evaluates providers, pays within policy, and verifies the result on-chain.</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map(({ id, label, description, Icon }, index) => {
          const state = stageState(id, { busy, result });
          return (
            <div key={id} className={`relative rounded-2xl border p-4 transition-colors ${state === 'active' ? 'border-cyan-500/50 bg-cyan-500/10' : state === 'complete' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${state === 'complete' ? 'bg-emerald-500/15 text-emerald-400' : state === 'active' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-zinc-800 text-zinc-500'}`}>
                  <Icon size={17} />
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${state === 'complete' ? 'text-emerald-400' : state === 'active' ? 'text-cyan-300' : 'text-zinc-600'}`}>
                  {state === 'complete' ? 'Complete' : state === 'active' ? 'In progress' : `0${index + 1}`}
                </span>
              </div>
              <h2 className="mt-4 text-sm font-semibold text-white">{label}</h2>
              <p className="mt-1 text-xs text-zinc-500">{description}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Card title="Give the agent a goal" subtitle="The agent uses live provider and Graph evidence before creating a purchase.">
          <form onSubmit={run} className="space-y-5">
            <div>
              <label htmlFor="commerce-goal" className="mb-2 block text-xs font-medium text-zinc-400">Purchase goal</label>
              <textarea id="commerce-goal" value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm leading-6 text-white outline-none transition focus:border-cyan-500" placeholder="What should the agent purchase?" />
            </div>
            <div>
              <label htmlFor="consumer-agent" className="mb-2 block text-xs font-medium text-zinc-400">Consumer agent</label>
              <select id="consumer-agent" value={consumerAgentId} onChange={(event) => setConsumerAgentId(event.target.value)} required className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500">
                <option value="">Select consumer agent</option>
                {list.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name || agent.agentId}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-400">Execution mode</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`cursor-pointer rounded-xl border p-3 transition ${automatic ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
                  <input type="radio" name="execution-mode" value="automatic" checked={automatic} onChange={() => setExecutionMode('automatic')} className="sr-only" />
                  <span className="flex items-center gap-2 text-sm font-medium text-white"><FiZap className="text-cyan-300" /> Automatic</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">AI pays within policy limits</span>
                </label>
                <label className={`cursor-pointer rounded-xl border p-3 transition ${!automatic ? 'border-violet-500/60 bg-violet-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
                  <input type="radio" name="execution-mode" value="approval" checked={!automatic} onChange={() => setExecutionMode('approval')} className="sr-only" />
                  <span className="flex items-center gap-2 text-sm font-medium text-white"><FiShield className="text-violet-300" /> Approval required</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">AI prepares purchase, does not pay</span>
                </label>
              </div>
            </div>
            <button type="submit" disabled={busy || !consumerAgentId || !goal.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <FiActivity className="animate-spin" /> : <FiArrowRight />}
              {busy ? 'Evaluating providers...' : automatic ? 'Let AI purchase automatically' : 'Prepare purchase for approval'}
            </button>
          </form>
        </Card>

        <Card title="Policy guardrails" subtitle="Applied to this purchase before any payment decision.">
          <div className="space-y-1">
            <PolicyRow label="Per-purchase policy" value="Checked before payment" />
            <PolicyRow label="Monthly budget policy" value="Active policy" />
            <PolicyRow label="Network" value="Arc Testnet" />
            <PolicyRow label="Payment mode" value={automatic ? 'Automatic within policy' : 'Approval required'} />
          </div>
          <div className="mt-5 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200/80"><FiAlertTriangle className="mt-0.5 shrink-0 text-amber-400" />No service invocation is requested by this workflow. It evaluates and prepares or settles the purchase only.</div>
        </Card>
      </div>

      {error && <ErrorBanner message={error} />}

      {result && (
        <section className="space-y-4" aria-label="Autonomous commerce result">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">Workflow result</h2><p className="text-xs text-zinc-500">The response below reflects the actions actually taken.</p></div><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">Decision returned</span></div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Decision" subtitle="Provider selected from Graph evidence.">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Selected provider</p>
              <p className="mt-1 text-lg font-semibold text-white">{displayProvider(result.providerChosen)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Trust score" value={`${formatTrust(result)}/100`} /><Metric label="Risk" value={result.riskLevel || evidence?.riskLevel || 'Unknown'} /></div>
              <GraphEvidence evidence={evidence} />
            </Card>
            <Card title="Payment" subtitle="Arc settlement status.">
              {automatic && settlement?.success ? <StatusLine icon={FiCheckCircle} tone="success" title="Payment settled on Arc" detail="The purchase was settled within the active policy." /> : automatic ? <StatusLine icon={FiAlertTriangle} tone="warning" title="Payment failed" detail={settlement?.message || 'The Arc payment did not settle.'} /> : <StatusLine icon={FiClock} tone="info" title="Purchase prepared — payment not sent" detail="Approval mode created the purchase preparation without settling funds." />}
              {!automatic && result.pendingSession?.sessionId && (
                <button type="button" onClick={approvePurchase} disabled={approvalBusy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                  {approvalBusy ? <FiActivity className="animate-spin" /> : <FiCheckCircle />} {approvalBusy ? 'Approving payment…' : 'Approve and pay on Arc'}
                </button>
              )}
              {settlement?.txHash && <a className="mt-4 inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" href={`https://testnet.arcscan.app/tx/${settlement.txHash}`} target="_blank" rel="noreferrer">View transaction on ArcScan <FiArrowRight size={12} /></a>}
            </Card>
            <Card title="Verification" subtitle="On-chain evidence status.">
              {verification?.verified ? <StatusLine icon={FiCheckCircle} tone="success" title="Graph verified" detail="The settlement is indexed and verified." /> : <StatusLine icon={FiClock} tone="info" title="Graph pending" detail={verification?.reason || 'Verification is pending indexed settlement evidence.'} />}
              {verification?.settlement?.timestamp && <p className="mt-4 flex items-center gap-1 text-xs text-zinc-500"><FiClock size={12} />{new Date(Number(verification.settlement.timestamp) * 1000).toLocaleString()}</p>}
            </Card>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-5 text-zinc-400"><FiShield className="mt-0.5 shrink-0 text-cyan-400" />{automatic && settlement?.success ? 'Payment completed · Credit reserved' : 'Payment prepared · No service invocation requested'}</div>
        </section>
      )}
    </div>
  );
}

function PolicyRow({ label, value }) {
  return <div className="flex items-center justify-between gap-3 border-b border-zinc-800/70 py-3 text-sm last:border-0"><span className="text-zinc-400">{label}</span><span className="text-right text-xs font-medium text-zinc-200">{value}</span></div>;
}

function Metric({ label, value }) {
  return <div><p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-white">{value}</p></div>;
}

function StatusLine({ icon: Icon, tone, title, detail }) {
  const colors = { success: 'text-emerald-400', warning: 'text-amber-400', info: 'text-cyan-300' };
  return <div className="flex gap-3"><Icon className={`mt-0.5 shrink-0 ${colors[tone]}`} size={18} /><div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p></div></div>;
}

function GraphEvidence({ evidence }) {
  const total = Number(evidence?.paymentCount || 0);
  const successful = Number(evidence?.successfulPayments || 0);
  const rate = total ? `${((successful / total) * 100).toFixed(1)}%` : '—';
  const volume = Number(evidence?.settlementVolume || 0).toFixed(4);
  const buyers = Number(evidence?.uniquePayers || 0);
  const repeat = Number(evidence?.repeatCustomers || 0);
  const recent = Number(evidence?.paymentsLast7d || 0);
  const interpretation = total === 0
    ? 'The provider has no indexed settlement history yet.'
    : successful === total && buyers > 1
      ? 'Strong reliability and buyer diversity are supported by the indexed settlement history.'
      : `${successful} of ${total} indexed payments succeeded; review the evidence before relying on this provider.`;

  return (
    <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-violet-200">Graph evidence</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">Live indexed settlement history</p>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> The Graph</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <EvidenceMetric label="Success" value={`${successful}/${total}`} sub={rate} />
        <EvidenceMetric label="Volume" value={`${volume} USDC`} sub="settled" />
        <EvidenceMetric label="Buyers" value={buyers} sub={`${repeat} repeat`} />
        <EvidenceMetric label="Recent" value={recent} sub="last 7 days" />
        <EvidenceMetric label="Risk" value={evidence?.riskLevel || '—'} sub="Graph signals" />
        <EvidenceMetric label="Evidence" value={total >= 10 ? 'High' : total >= 3 ? 'Moderate' : 'Limited'} sub={`${total} payments`} />
      </div>
      <p className="mt-3 border-t border-violet-500/10 pt-2 text-[11px] leading-4 text-violet-100/70">{interpretation}</p>
    </div>
  );
}

function EvidenceMetric({ label, value, sub }) {
  return <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-2.5 py-2"><p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p><p className="text-[10px] text-zinc-600">{sub}</p></div>;
}
