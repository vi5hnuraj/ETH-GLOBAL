import React, { useEffect, useRef, useState } from 'react';
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiChevronRight, FiClock, FiCreditCard, FiDollarSign, FiExternalLink, FiRefreshCw, FiSearch, FiSend, FiShield, FiUser, FiZap } from 'react-icons/fi';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const ACTION_GROUPS = [
  { label: 'Discover', icon: FiSearch, modes: ['ask', 'act'], actions: ['Find the safest OCR provider', 'Compare providers by trust'] },
  { label: 'Execute', icon: FiDollarSign, modes: ['act'], actions: ['Buy the safest OCR provider', 'Run my document workflow'] },
  { label: 'Monitor', icon: FiActivity, modes: ['ask', 'act'], actions: ['Verify my latest payment', 'Show my spending this month'] },
  { label: 'Control', icon: FiShield, modes: ['ask', 'act'], actions: ['Am I verified?', "Why can't I publish?"] }
];

const PHASES = {
  observe: { label: 'Observe', color: 'text-cyan-300', line: 'bg-cyan-400', icon: FiSearch },
  decide: { label: 'Decide', color: 'text-violet-300', line: 'bg-violet-400', icon: FiShield },
  act: { label: 'Act', color: 'text-amber-300', line: 'bg-amber-400', icon: FiDollarSign },
  verify: { label: 'Verify', color: 'text-emerald-300', line: 'bg-emerald-400', icon: FiCheckCircle },
  error: { label: 'Error', color: 'text-rose-300', line: 'bg-rose-400', icon: FiAlertTriangle }
};

const shortValue = (value) => {
  const text = String(value || '');
  return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-8)}` : text;
};

const TrustBadge = ({ score }) => score == null ? <span className="text-zinc-500">Not available</span> : (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${score >= 70 ? 'bg-emerald-500/15 text-emerald-300' : score >= 40 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
    Trust {score}/100
  </span>
);

const formatTime = (value) => {
  if (!value) return null;
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const ExecutionTimeline = ({ steps }) => !steps?.length ? null : (
  <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500"><FiActivity size={13} /> Execution timeline</div>
    <div className="space-y-3">
      {steps.map((step, index) => {
        const phase = PHASES[step.phase] || PHASES.observe;
        const Icon = phase.icon;
        const failed = step.status === 'failed' || step.status === 'error';
        return (
          <div key={index} className="relative flex gap-3">
            {index < steps.length - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%+0.75rem)] w-px bg-zinc-800" />}
            <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 ${failed ? 'text-rose-400' : phase.color}`}><Icon size={12} /></span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${failed ? 'text-rose-300' : phase.color}`}>{failed ? 'Error' : phase.label}</span>
                <span className="text-sm font-medium text-zinc-200">{step.label || step.name || 'Execution step'}</span>
                {step.status && <span className="text-[10px] uppercase text-zinc-600">{step.status}</span>}
                {formatTime(step.timestamp || step.time || step.createdAt) && <span className="ml-auto text-[10px] text-zinc-600"><FiClock className="mr-1 inline" size={10} />{formatTime(step.timestamp || step.time || step.createdAt)}</span>}
              </div>
              {step.detail && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const DataCards = ({ data = {} }) => {
  data = data || {};
  const provider = data.provider;
  const settlement = data.settlement;
  const verification = data.verification;
  const invoice = data.invoice;
  const credits = data.credits;
  if (data.action === 'workflow_handoff') return <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Workflow Builder</p><p className="mt-2 text-sm text-zinc-300">Select the document workflow steps and paying agent before execution.</p><a href={data.href} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">Open Workflow Builder <FiExternalLink size={11} /></a></div>;
  if (!provider && !settlement && !verification && !invoice && credits == null) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {provider && <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Provider evidence</p>
        <div className="mt-2 flex items-center justify-between gap-2"><span className="text-sm text-zinc-200">Trust</span><TrustBadge score={provider.trustScore} /></div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-500"><span>Successful<br /><b className="text-zinc-200">{provider.successfulPayments ?? '—'}</b></span><span>Payments<br /><b className="text-zinc-200">{provider.paymentCount ?? '—'}</b></span><span>Buyers<br /><b className="text-zinc-200">{provider.uniqueBuyers ?? provider.uniquePayers ?? '—'}</b></span></div>
        {provider.risk != null && <p className="mt-2 text-xs text-zinc-400">Risk: <span className="text-zinc-200">{provider.risk}</span></p>}
      </div>}
      {settlement && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300"><FiDollarSign className="mr-1 inline" size={12} /> Arc settlement</p>
        {settlement.amount != null && <p className="mt-2 text-sm text-zinc-200">{settlement.amount} USDC</p>}
        {settlement.txHash && <p className="mt-1 text-xs text-zinc-500">TX <a title={settlement.txHash} href={settlement.explorerUrl || settlement.arcScanUrl} target="_blank" rel="noreferrer" className="font-mono text-cyan-300 hover:text-cyan-200">{shortValue(settlement.txHash)} <FiExternalLink className="inline" size={10} /></a></p>}
      </div>}
      {verification && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300"><FiCheckCircle className="mr-1 inline" size={12} /> Graph verification</p>
        <p className="mt-2 text-sm text-zinc-200">{verification.status || (verification.verified ? 'Verified' : 'Not verified')}</p>
        {verification.block != null && <p className="mt-1 text-xs text-zinc-500">Block #{verification.block}</p>}
        {verification.entityId && <p className="mt-1 truncate font-mono text-[11px] text-zinc-500" title={verification.entityId}>Entity {verification.entityId}</p>}
      </div>}
      {(invoice || credits != null) && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300"><FiCreditCard className="mr-1 inline" size={12} /> Invoice & credits</p>
        {invoice?.invoiceId && <p className="mt-2 truncate font-mono text-xs text-zinc-300" title={invoice.invoiceId}>Invoice {invoice.invoiceId}</p>}
        {credits != null && <p className="mt-1 text-xs text-zinc-400">Credits granted: <span className="text-zinc-200">{credits}</span></p>}
      </div>}
    </div>
  );
};

const ProviderDiscoveryCard = ({ providers, intent }) => {
  if (!providers?.length) return null;
  const title = intent === 'find_earners' ? 'Top earning providers' : intent === 'find_risky' ? 'Risk review' : intent === 'find_success_rate' ? 'Reliable providers' : 'Provider recommendation';
  return <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">{title}</p><p className="mt-1 text-xs text-zinc-500">Compared using live Graph settlement evidence</p></div><FiShield className="text-violet-300" size={16} /></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {providers.slice(0, 5).map((provider, index) => {
        const success = provider.paymentCount ? `${((Number(provider.successfulPayments || 0) / Number(provider.paymentCount)) * 100).toFixed(0)}%` : '—';
        return <div key={provider.providerId} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 transition-colors hover:border-zinc-700">
          <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400">{index + 1}</span><span className="truncate font-mono text-xs text-zinc-200" title={provider.providerId}>{shortValue(provider.providerId)}</span></div><TrustBadge score={provider.trustScore} /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-zinc-600">Success</p><p className="mt-0.5 text-emerald-400">{success}</p></div><div><p className="text-zinc-600">Volume</p><p className="mt-0.5 font-mono text-cyan-300">{Number(provider.settlementVolume || 0).toFixed(4)}</p></div><div><p className="text-zinc-600">Buyers</p><p className="mt-0.5 text-zinc-200">{provider.uniquePayers ?? 0}</p></div></div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800/70 pt-2"><span className={`text-[10px] font-semibold uppercase ${provider.riskLevel === 'high' ? 'text-rose-400' : provider.riskLevel === 'medium' ? 'text-amber-400' : 'text-emerald-400'}`}>{provider.riskLevel || 'low'} risk</span><span className="text-[10px] text-violet-400">Graph evidence</span></div>
        </div>;
      })}
    </div>
    <p className="mt-3 text-xs leading-5 text-violet-100/70">Trust and earnings are different dimensions. GlobalPay ranks providers using settlement reliability and risk, not volume alone.</p>
  </div>;
};

const PurchaseResultCard = ({ data }) => {
  if (!data?.service && !data?.settlement) return null;
  const trust = data.provider?.trustScore;
  const paymentCount = Number(data.provider?.paymentCount || 0);
  const success = paymentCount ? `${((Number(data.provider?.successfulPayments || 0) / paymentCount) * 100).toFixed(0)}% success` : 'Limited evidence';
  return <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Purchase result</p><h3 className="mt-1 text-base font-semibold text-white">{data.service?.title || 'Service purchase'}</h3><p className="text-xs text-zinc-500">Payment completed · credit reserved</p></div><FiCheckCircle className="text-emerald-400" size={18} /></div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><div><p className="text-[10px] text-zinc-500">Paid</p><p className="mt-1 font-mono text-sm text-white">{Number(data.settlement?.amount || 0).toFixed(4)} USDC</p></div><div><p className="text-[10px] text-zinc-500">Trust</p><p className="mt-1 text-sm text-violet-300">{trust ?? '—'}/100</p></div><div><p className="text-[10px] text-zinc-500">Provider evidence</p><p className="mt-1 text-sm text-emerald-400">{success}</p></div><div><p className="text-[10px] text-zinc-500">Credits</p><p className="mt-1 text-sm text-white">{data.credits ?? '—'}</p></div><div><p className="text-[10px] text-zinc-500">Graph</p><p className={`mt-1 text-sm ${data.verification?.verified ? 'text-emerald-400' : 'text-amber-400'}`}>{data.verification?.verified ? 'Verified' : 'Pending'}</p></div></div>
    {data.settlement?.txHash && <a href={data.settlement.explorerUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">View Arc transaction <FiExternalLink size={11} /></a>}
    <p className="mt-3 text-[11px] text-zinc-500">The provider service was not invoked by this request. Only payment, credit reservation, and settlement verification were performed.</p>
  </div>;
};

const Message = ({ message }) => {
  const user = message.role === 'user';
  return <div className={`flex gap-3 ${user ? 'justify-end' : ''}`}>
    {!user && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300"><FiZap size={14} /></div>}
    <div className={`max-w-[92%] rounded-2xl border px-4 py-3 text-sm ${user ? 'border-violet-500/30 bg-violet-600 text-white' : 'border-zinc-800 bg-zinc-900/80 text-zinc-200'}`}>
      {user ? <p>{message.text}</p> : <>
        {message.answer && !message.data?.providers && !message.data?.service && !message.data?.settlement && <div className="whitespace-pre-wrap leading-relaxed text-zinc-200">{message.answer}</div>}
        <ExecutionTimeline steps={message.steps} />
        <ProviderDiscoveryCard providers={message.data?.providers} intent={message.data?.intent} />
        <PurchaseResultCard data={message.data} />
        <DataCards data={message.data} />
      </>}
    </div>
    {user && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-zinc-300"><FiUser size={14} /></div>}
  </div>;
};

export default function DevAiAssistant() {
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 50 }) });
  const agents = agentsState.data?.agents || [];
  const [selectedAgent, setSelectedAgent] = useState('');
  const [mode, setMode] = useState('ask');
  const [messages, setMessages] = useState([{ role: 'assistant', answer: 'I am your GlobalPay AI Operator. Give me a goal and I will discover services, evaluate providers with Graph evidence, pay with USDC on Arc, and verify settlement.', steps: [], data: null }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { if (!selectedAgent && agents[0]?.agentId) setSelectedAgent(agents[0].agentId); }, [agents, selectedAgent]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text) => {
    if (!text?.trim() || busy) return;
    const message = text.trim();
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput(''); setBusy(true); setError(null);
    try {
      const result = await developerApi.assistantChat({ message, consumerAgentId: selectedAgent, mode });
      setMessages((current) => [...current, { role: 'assistant', answer: result.answer || result.message || 'Done.', steps: result.steps || [], data: result.data || {} }]);
    } catch (err) {
      setError(err.message || 'Request failed');
      setMessages((current) => [...current, { role: 'assistant', answer: `Unable to complete that request: ${err.message}`, steps: [], data: null }]);
    } finally { setBusy(false); }
  };

  const runDemo = async () => {
    if (busy) return;
    setBusy(true); setError(null); setMessages((current) => [...current, { role: 'user', text: 'Try autonomous purchase' }]);
    try {
      const result = await developerApi.runDemo();
      const report = result.report || {};
      setMessages((current) => [...current, { role: 'assistant', answer: report.success ? 'Autonomous purchase completed.' : 'Autonomous purchase completed with some stages requiring attention.', steps: report.stages || [], data: report }]);
    } catch (err) { setError(err.message || 'Demo failed'); setMessages((current) => [...current, { role: 'assistant', answer: `Demo failed: ${err.message}`, steps: [], data: null }]); }
    finally { setBusy(false); }
  };

  const resetChat = () => {
    if (busy) return;
    setMessages([{ role: 'assistant', answer: 'I am your GlobalPay AI Operator. Give me a goal and I will discover services, evaluate providers with Graph evidence, pay with USDC on Arc, and verify settlement.', steps: [], data: null }]);
    setInput('');
    setError(null);
  };

  return <div className="mx-auto max-w-7xl space-y-5 pb-6">
    <header>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-white">GlobalPay AI Operator</h1><span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300"><FiZap size={12} /> Graph → Arc → Verify</span></div>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">Give your agent a goal. It discovers services, evaluates providers using on-chain evidence, pays with USDC on Arc, and verifies settlement.</p>
    </header>
    <div className="grid gap-3 border-y border-zinc-800/80 py-3 sm:grid-cols-3">
      <div><p className="text-[10px] uppercase tracking-widest text-zinc-500">Consumer agents</p><p className="mt-1 text-sm font-semibold text-white">{selectedAgent ? '1 selected' : 'None selected'} <span className="font-normal text-zinc-500">/ {agents.length} available</span></p></div>
      <div><p className="text-[10px] uppercase tracking-widest text-zinc-500">Graph status</p><p className="mt-1 text-sm font-semibold text-emerald-300"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />Live Graph evidence</p></div>
      <div><p className="text-[10px] uppercase tracking-widest text-zinc-500">Autonomy controls</p><p className="mt-1 text-sm font-semibold text-zinc-200">Policy enforced before payment</p></div>
    </div>
    {error && <ErrorBanner message={error} />}
    <div className="grid min-h-[600px] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-[600px] min-w-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4 sm:p-5">
       <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Conversation & execution</h2><p className="text-xs text-zinc-500">The operator reports what it actually discovered and executed.</p></div><div className="flex items-center gap-3"><button type="button" onClick={resetChat} disabled={busy} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white disabled:opacity-50"><FiRefreshCw size={12} /> Reset chat</button><button type="button" onClick={runDemo} disabled={busy} title="Runs the guided lifecycle demo and requires a funded Arc MPC wallet" className="text-xs text-zinc-500 hover:text-violet-300 disabled:opacity-50">Run guided demo <FiChevronRight className="inline" size={12} /></button></div></div>
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">{messages.map((message, index) => <Message key={index} message={message} />)}{busy && <div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/15 text-violet-300"><FiActivity className="animate-pulse" size={14} /></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-500">Operator is working…</div></div>}<div ref={bottomRef} /></div>
        <div className="mt-4 border-t border-zinc-800 pt-4"><div className="mb-2 flex items-center gap-2 text-xs"><span className="font-semibold text-violet-300">{mode === 'ask' ? 'Ask & Analyze' : 'Act & Execute'}</span><span className="text-zinc-600">{mode === 'ask' ? 'Explore evidence without initiating an action.' : 'Execute through the active policy and report every step.'}</span></div><form onSubmit={(event) => { event.preventDefault(); send(input); }} className="flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} placeholder="Give your operator a goal…" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 disabled:opacity-50" /><button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-violet-600 px-4 text-white hover:bg-violet-500 disabled:opacity-50"><FiSend size={16} /></button></form></div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><h2 className="text-sm font-semibold text-white">Agent control center</h2><label className="mt-4 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Consumer agent</label><select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)} disabled={agentsState.loading} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"><option value="">Select an agent</option>{agents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name || agent.agentId}</option>)}</select><p className="mt-2 truncate text-[11px] text-zinc-500" title={selectedAgent}>{selectedAgent || 'No consumer agent selected'}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><h2 className="text-sm font-semibold text-white">Autonomy mode</h2><div className="mt-3 grid grid-cols-2 rounded-lg bg-zinc-950 p-1"><button type="button" onClick={() => setMode('ask')} className={`rounded-md px-2 py-2 text-xs font-semibold ${mode === 'ask' ? 'bg-violet-600 text-white' : 'text-zinc-500'}`}>Ask / Analyze</button><button type="button" onClick={() => setMode('act')} className={`rounded-md px-2 py-2 text-xs font-semibold ${mode === 'act' ? 'bg-amber-600 text-white' : 'text-zinc-500'}`}>Act / Execute</button></div><div className="mt-4 space-y-2 text-xs text-zinc-400"><p><FiCheckCircle className="mr-2 inline text-emerald-400" />Policy checked before payment</p><p><FiShield className="mr-2 inline text-violet-400" />Approval required when policy blocks</p></div></div>
         <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><h2 className="text-sm font-semibold text-white">Quick actions</h2><p className="mt-1 text-xs text-zinc-500">Showing actions available in {mode === 'ask' ? 'Ask & Analyze' : 'Act & Execute'} mode.</p>{ACTION_GROUPS.filter(({ modes }) => modes.includes(mode)).map(({ label, icon: Icon, actions }) => <div key={label} className="mt-4"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><Icon size={12} />{label}</p><div className="space-y-1">{actions.map((action) => <button key={action} type="button" onClick={() => send(action)} disabled={busy} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-violet-300 disabled:opacity-50">{action}<FiChevronRight className="float-right mt-0.5 text-zinc-600" size={12} /></button>)}</div></div>)}</div>
      </aside>
    </div>
    <footer className="flex items-center gap-2 text-xs text-zinc-600"><FiShield size={13} />Automatic actions remain subject to the active procurement policy.</footer>
  </div>;
}
