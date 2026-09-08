import React, { useState, useRef, useEffect } from 'react';
import { FiActivity, FiCheckCircle, FiClock, FiDollarSign, FiExternalLink, FiSearch, FiSend, FiShield, FiUser, FiZap, FiAlertTriangle, FiCreditCard } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const SUGGESTIONS = [
  'Am I verified?',
  "Why can't I publish?",
  'What do I need before selling?',
  'Find the safest OCR provider',
  'Buy the safest OCR provider',
  'Show my published services',
  'How much have I earned?'
];

const PHASE_ICONS = {
  observe: FiSearch,
  decide: FiShield,
  act: FiDollarSign,
  verify: FiCheckCircle,
  error: FiAlertTriangle
};

const PHASE_COLORS = {
  observe: 'text-cyan-400',
  decide: 'text-violet-400',
  act: 'text-amber-400',
  verify: 'text-emerald-400',
  error: 'text-rose-400'
};

const TrustBadge = ({ score }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${score >= 70 ? 'bg-emerald-500/20 text-emerald-400' : score >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
    <FiShield size={11} />{score}/100
  </span>
);

const StepProgress = ({ steps }) => {
  if (!steps?.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {steps.map((step, i) => {
        const Icon = PHASE_ICONS[step.phase] || FiActivity;
        const color = PHASE_COLORS[step.phase] || 'text-zinc-400';
        return (
          <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${step.status === 'failed' ? 'bg-rose-500/10' : 'bg-zinc-900/50'}`}>
            <Icon className={`mt-0.5 shrink-0 ${step.status === 'failed' ? 'text-rose-400' : color}`} size={13} />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-zinc-200">{step.label}</span>
              <p className="mt-0.5 text-zinc-500">{step.detail}</p>
            </div>
            {step.status === 'complete' && <FiCheckCircle className="shrink-0 text-emerald-400" size={13} />}
            {step.status === 'failed' && <FiAlertTriangle className="shrink-0 text-rose-400" size={13} />}
          </div>
        );
      })}
    </div>
  );
};

const ArcTransactionCard = ({ settlement }) => {
  if (!settlement?.txHash) return null;
  return (
    <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300"><FiDollarSign size={13} />Arc Settlement</div>
      <div className="mt-2 space-y-1 text-xs text-zinc-400">
        <p>Amount: <span className="font-mono text-white">{settlement.amount} USDC</span></p>
        <p>TX: <a className="font-mono text-cyan-400 hover:text-cyan-300" href={settlement.explorerUrl} target="_blank" rel="noreferrer">{settlement.txHash.slice(0, 18)}… <FiExternalLink size={10} className="inline" /></a></p>
      </div>
    </div>
  );
};

const GraphEvidenceCard = ({ verification, provider }) => {
  if (!verification && !provider) return null;
  return (
    <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-violet-300"><FiZap size={13} />The Graph Evidence</div>
      <div className="mt-2 space-y-1 text-xs text-zinc-400">
        {verification?.verified && <p>Status: <span className="text-emerald-400">✅ Verified at block #{verification.block}</span></p>}
        {verification?.entityId && <p>Entity: <span className="font-mono text-violet-300">{verification.entityId}</span></p>}
        {provider && <p>Trust: <TrustBadge score={provider.trustScore} /> <span className="ml-1 text-zinc-500">({provider.successfulPayments}/{provider.paymentCount} successful, {provider.uniquePayers} buyers)</span></p>}
      </div>
    </div>
  );
};

const InvoiceCard = ({ invoice, credits }) => {
  if (!invoice?.invoiceId && !credits) return null;
  return (
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><FiCreditCard size={13} />Invoice & Credits</div>
      <div className="mt-2 space-y-1 text-xs text-zinc-400">
        {invoice?.invoiceId && <p>Invoice: <span className="font-mono text-emerald-300">{invoice.invoiceId}</span></p>}
        {credits && <p>Credits granted: <span className="font-mono text-white">{credits}</span></p>}
      </div>
    </div>
  );
};

const MessageBubble = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-400"><FiZap size={14} /></div>}
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${isUser ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-200 border border-zinc-800'}`}>
        {isUser ? (
          <p>{msg.text}</p>
        ) : (
          <div>
            {msg.answer && <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-200">{msg.answer}</pre>}
            <StepProgress steps={msg.steps} />
            {msg.data?.settlement && <ArcTransactionCard settlement={msg.data.settlement} />}
            {msg.data?.verification && <GraphEvidenceCard verification={msg.data.verification} provider={msg.data.provider} />}
            {msg.data?.invoice && <InvoiceCard invoice={msg.data.invoice} credits={msg.data.credits} />}
            {msg.data?.providerSummary && (
              <div className="mt-3 rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">{msg.data.providerSummary}</div>
            )}
          </div>
        )}
      </div>
      {isUser && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-zinc-300"><FiUser size={14} /></div>}
    </div>
  );
};

export default function DevAiAssistant() {
  const agents = useApi({ fetcher: () => developerApi.agents({ perPage: 50 }) });
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: 'Welcome to the GlobalPay AI Assistant. I can discover providers, execute purchases, verify payments, and more — all backed by The Graph.',
    answer: '🤖 Welcome to the GlobalPay AI Assistant\n\nI can help you with:\n\n🔍 Provider Discovery — "Who is the safest OCR provider?"\n🛒 Purchases — "Buy the safest OCR provider"\n✅ Verification — "Verify my last payment"\n💰 Wallet — "Show my balance"\n\nEvery decision is backed by live settlement data from The Graph.',
    steps: [],
    data: null
  }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const list = agents.data?.agents || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    if (!text?.trim() || busy) return;
    const userMsg = { role: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const consumerAgentId = list[0]?.agentId || '';
      const result = await developerApi.assistantChat({ message: text.trim(), consumerAgentId });
      const data = result.data || {};
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: result.message || result.answer || 'Done.',
        answer: result.answer || result.message,
        steps: result.steps || [],
        data
      }]);
    } catch (err) {
      setError(err.message || 'Request failed');
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err.message}`, answer: `❌ ${err.message}`, steps: [], data: null }]);
    } finally {
      setBusy(false);
    }
  };

  const runDemo = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', text: 'Run Autonomous Demo' }]);

    try {
      const result = await developerApi.runDemo();
      const report = result.report || {};
      const stagesText = (report.stages || []).map((s) => {
        const icon = s.status === 'complete' ? '✅' : s.status === 'failed' ? '❌' : s.status === 'pending' ? '⏳' : '🔄';
        return `${icon} ${s.name}: ${s.detail}`;
      }).join('\n');

      const answer = [
        '🚀 Autonomous Demo Complete',
        '',
        stagesText,
        '',
        report.success ? '✅ All stages passed!' : '⚠️ Some stages failed — check details above.',
        '',
        'Sponsors:',
        `• World AgentKit: ${report.summary?.world?.verified ? '✅ Verified' : '⏳ Pending'}`,
        `• The Graph: ${report.summary?.graph?.paymentCount || 0} payments indexed`,
        `• Arc: ${report.summary?.arc?.chainId ? `Chain ${report.summary.arc.chainId}` : 'Not connected'}`,
        report.summary?.settlement ? `• Settlement: ${report.summary.settlement.txHash?.slice(0, 18)}...` : ''
      ].filter(Boolean).join('\n');

      setMessages((prev) => [...prev, {
        role: 'assistant', text: `Demo ${report.success ? 'passed' : 'completed'}`,
        answer,
        steps: report.stages || [],
        data: report
      }]);
    } catch (err) {
      setError(err.message || 'Demo failed');
      setMessages((prev) => [...prev, { role: 'assistant', text: `Demo error: ${err.message}`, answer: `❌ Demo failed: ${err.message}`, steps: [], data: null }]);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col">
      <header className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">AI Assistant</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300"><FiZap size={12} /> Graph → Arc → Verify</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-zinc-500">Type a natural-language request. The assistant uses The Graph for every decision.</p>
          <button
            onClick={runDemo}
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50"
          >
            <FiZap size={12} className="inline mr-1" /> Run Autonomous Demo
          </button>
        </div>
      </header>

      {/* Suggested prompts */}
      {messages.length <= 1 && (
        <div className="mb-4 flex flex-wrap gap-2 shrink-0">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-50">{s}</button>
          ))}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Message area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {busy && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-400"><FiZap size={14} className="animate-pulse" /></div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
              <FiActivity className="mr-2 inline animate-spin" size={14} />Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-2 flex shrink-0 gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about GlobalPay…"
          disabled={busy}
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? <FiActivity className="animate-spin" size={16} /> : <FiSend size={16} />}
        </button>
      </form>
    </div>
  );
}
