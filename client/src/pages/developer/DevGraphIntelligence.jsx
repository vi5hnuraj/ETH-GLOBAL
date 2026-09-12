import React, { useEffect, useRef, useState } from 'react';
import { FiActivity, FiAlertTriangle, FiArrowUpRight, FiAward, FiBarChart2, FiCheckCircle, FiClock, FiCopy, FiExternalLink, FiSearch, FiShield, FiZap } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const promptGroups = [
  { label: 'Reliability', prompts: ['Which provider is safest for my next purchase?', 'Show providers with success rate above 80%.'] },
  { label: 'Earnings', prompts: ['Who earned the most USDC this week?'] },
  { label: 'Risk', prompts: ['Are there any fraud signals in provider history?'] }
];

const defaultQuestion = promptGroups[0].prompts[0];

const shortAddress = (value) => {
  const address = String(value || '');
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address || 'Unknown provider';
};

const formatDate = (value) => {
  if (value == null || value === '') return 'Unknown';
  const raw = typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : value;
  const date = typeof raw === 'number' && raw < 1e12 ? new Date(raw * 1000) : new Date(raw);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

const formatUsdc = (value) => `${Number.isFinite(Number(value)) ? Number(value).toFixed(4) : '0.0000'} USDC`;

const successPercent = (provider) => {
  const value = provider?.successRate != null
    ? Number(provider.successRate) * 100
    : Number(provider?.paymentCount) > 0
      ? (Number(provider.successfulPayments || 0) / Number(provider.paymentCount)) * 100
      : null;
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'Unknown';
};

const copyValue = async (value) => {
  if (value && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(String(value));
};

const TrustBadge = ({ score, paymentCount }) => (
  <div className="flex items-center gap-1.5">
    {paymentCount === 0 || score == null ? (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[11px] font-semibold text-zinc-400"
        title="No indexed settlements yet — trust becomes measurable after the first verified Graph settlement"
      >
        <FiShield size={11} />Unknown
      </span>
    ) : (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${score >= 70 ? 'bg-emerald-500/20 text-emerald-400' : score >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
        <FiShield size={11} />Trust {score}/100
      </span>
    )}
    {paymentCount > 0 && <span className="text-[10px] text-zinc-500">{paymentCount >= 10 ? 'High evidence' : paymentCount >= 3 ? 'Moderate evidence' : 'Limited evidence'}</span>}
  </div>
);

const RiskBadge = ({ level }) => {
  if (!level || level === 'low') return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${level === 'high' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{level === 'high' ? '⚠ High Risk' : '● Medium'}</span>;
};

export default function DevGraphIntelligence() {
  const status = useApi({ fetcher: developerApi.graphStatus });
  const [question, setQuestion] = useState(defaultQuestion);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const autoAskedRef = useRef(false);

  const askQuestion = async (value) => {
    setQuestion(value);
    setLoading(true);
    setError(null);
    try {
      setResult(await developerApi.graphAsk(value));
    } catch (err) {
      setError(err.message || 'Trust Engine request failed.');
    } finally {
      setLoading(false);
    }
  };

  const ask = async (event) => {
    event?.preventDefault();
    await askQuestion(question);
  };

  useEffect(() => {
    if (!status.loading && status.data?.live && !autoAskedRef.current) {
      autoAskedRef.current = true;
      askQuestion(defaultQuestion);
    }
  }, [status.loading, status.data?.live]);

  const providers = result?.providers || [];
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Trust Engine</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300"><FiZap size={12} /> Powered by The Graph</span>
        </div>
         <p className="mt-1 text-sm text-zinc-500">Compare provider settlement activity before an agent spends USDC on Arc.</p>
         <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-zinc-300"><span className="font-medium text-violet-200">World ID proves identity.</span> The Graph measures settlement reliability.</div>
      </header>

      {status.loading ? <Skeleton className="h-16 rounded-xl" /> : (
         <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
           <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Graph status</p><p className={`mt-1 text-sm font-semibold ${status.data?.live ? 'text-emerald-400' : 'text-amber-400'}`}>{status.data?.live ? 'Live' : 'Offline'}</p><p className="text-[10px] text-zinc-500">{status.data?.provider || 'The Graph'}</p></div>
           <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Indexed block</p><p className="mt-1 text-sm font-semibold text-white">#{status.data?.indexedBlock ?? '?'}</p><p className="text-[10px] text-zinc-500">Head #{status.data?.headBlock ?? '?'}</p></div>
           <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Payments / settlements</p><p className="mt-1 text-sm font-semibold text-white">{status.data?.paymentCount ?? 0} / {status.data?.settlementCount ?? 0}</p><p className="text-[10px] text-zinc-500">Indexed evidence</p></div>
           <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Sync lag</p><p className="mt-1 text-sm font-semibold text-white">{status.data?.lagBlocks ?? '?'} blocks</p><p className="text-[10px] text-zinc-500">Behind chain head</p></div>
        </div>
      )}

      <Card title="Ask before you pay" subtitle="Provider selection is part of the autonomous commerce flow.">
        <form onSubmit={ask} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><FiSearch className="absolute left-3 top-3 text-zinc-500" size={16} /><input value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-500" placeholder="Which OCR provider is safest?" /></div>
          <button disabled={loading || !question.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{loading ? <FiActivity className="animate-spin" /> : <FiShield />} Analyze providers</button>
        </form>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{promptGroups.map((group) => <div key={group.label}><p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{group.label}</p><div className="flex flex-col items-start gap-2">{group.prompts.map((item) => <button key={item} type="button" onClick={() => askQuestion(item)} className="rounded-full border border-zinc-800 px-3 py-1.5 text-left text-xs text-zinc-400 hover:border-violet-500/50 hover:text-violet-300">{item}</button>)}</div></div>)}</div>
      </Card>

      {error && <ErrorBanner message={error} />}
      {result && <>
        {providers.length > 0 && (() => {
           const topProvider = result.intent === 'earnings'
             ? [...providers].sort((a, b) => Number(b.settlementVolume || 0) - Number(a.settlementVolume || 0))[0]
             : result.intent === 'risk_audit'
               ? [...providers].sort((a, b) => Number(b.riskFlags?.length || 0) - Number(a.riskFlags?.length || 0) || Number(a.trustScore || 0) - Number(b.trustScore || 0))[0]
               : result.intent === 'reliability'
                 ? [...providers].sort((a, b) => Number(b.successRate || 0) - Number(a.successRate || 0) || Number(b.trustScore || 0) - Number(a.trustScore || 0))[0]
                 : result.intent === 'recency'
                   ? [...providers].sort((a, b) => Date.parse(b.lastSettlement || 0) - Date.parse(a.lastSettlement || 0))[0]
                   : providers[0];
          const safestProvider = [...providers].sort((a, b) => Number(b.trustScore || 0) - Number(a.trustScore || 0))[0];
          const topEarner = [...providers].sort((a, b) => Number(b.settlementVolume || 0) - Number(a.settlementVolume || 0))[0];
          const differs = topProvider.providerId !== safestProvider.providerId;
           const highEarningsWarning = result.intent === 'earnings' && topEarner.providerId !== safestProvider.providerId;
           return <Card title={<span className="flex items-center gap-2">Trust Engine recommendation <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">The Graph</span></span>} subtitle={`Intent: ${result.intent} · Source: ${result.source}`}>
            <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-zinc-950/40 to-cyan-500/5 p-4">
              <p className="text-xs uppercase tracking-widest text-violet-300">Question</p>
              <p className="mt-1 text-sm text-white">{question}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                 <div><p className="text-[10px] uppercase text-zinc-500">Top provider</p><p className="mt-1 font-mono text-lg font-semibold text-cyan-300">{shortAddress(topProvider.providerId)}</p></div>
                <div><p className="text-[10px] uppercase text-zinc-500">Settlement volume</p><p className="mt-1 text-sm text-white">{formatUsdc(topProvider.settlementVolume)}</p></div>
                <div><p className="text-[10px] uppercase text-zinc-500">Successful payments</p><p className="mt-1 text-sm text-white">{topProvider.successfulPayments ?? 0}/{topProvider.paymentCount ?? 0}</p></div>
                <div><p className="text-[10px] uppercase text-zinc-500">Unique buyers</p><p className="mt-1 text-sm text-white">{topProvider.uniquePayers ?? 0}</p></div>
                 <div><p className="text-[10px] uppercase text-zinc-500">Trust score</p><p className="mt-1 text-2xl font-bold text-white">{topProvider.trustScore != null ? `${topProvider.trustScore}/100` : 'Unknown'}</p></div>
                <div><p className="text-[10px] uppercase text-zinc-500">Risk</p><p className="mt-1"><RiskBadge level={topProvider.riskLevel} />{(!topProvider.riskLevel || topProvider.riskLevel === 'low') && <span className="text-xs text-emerald-400">Low</span>}</p></div>
              </div>
              {highEarningsWarning && <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200"><FiAlertTriangle className="mt-0.5 shrink-0" />Highest earnings do not necessarily indicate highest reliability. The top earner differs from the safest provider by trust.</div>}
              {differs && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs"><span className="text-zinc-400">Reliability recommendation</span><span className="inline-flex items-center gap-1 font-mono text-emerald-300"><FiAward size={13} />{shortAddress(safestProvider.providerId)} · Trust {safestProvider.trustScore ?? 'Unknown'}/100</span></div>}
            </div>
          </Card>;
        })()}
        {providers.length === 0 && result.answer && <Card title="Trust Engine Answer" subtitle={`Intent: ${result.intent} · Source: ${result.source}`}><p className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-300">{result.answer}</p></Card>}
         {providers.length > 0 && (
            <Card title="Provider Trust Map" subtitle="Trust score from indexed settlement evidence">
             <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500"><FiBarChart2 size={13} className="text-violet-400" /> Each bar is derived from indexed Graph settlement data.</div>
             <div className="h-64 w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={providers.slice(0, 8).map((provider) => ({ name: shortAddress(provider.providerId), trust: Number.isFinite(Number(provider.trustScore)) ? Number(provider.trustScore) : null }))} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                   <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} />
                   <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                   <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10 }} formatter={(value) => [`${value}/100`, 'Trust']} />
                   <Bar dataKey="trust" name="Trust" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
             </div>
           </Card>
         )}
          <Card title="Provider ranking" subtitle="Volume and trust are separate dimensions of provider performance.">
        {providers.length === 0 ? <p className="text-sm text-zinc-500">No live indexed provider data is available yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="pb-3">Provider</th><th className="pb-3">Trust</th><th className="pb-3">Success</th><th className="pb-3">Settlements</th><th className="pb-3">Volume</th><th className="pb-3">Buyers</th><th className="pb-3">Risk</th><th className="pb-3">Evidence</th></tr></thead><tbody>{providers.map((provider, index) => { const validWallet = /^0x[0-9a-fA-F]{40}$/.test(String(provider.providerId || '')); return <tr key={provider.providerId} className="border-t border-zinc-800/70"><td className="py-3 text-white">{index === 0 && <FiCheckCircle className="mr-2 inline text-emerald-400" size={14} />}<span className="font-mono">{shortAddress(provider.providerId)}</span><button type="button" title="Copy provider address" onClick={() => copyValue(provider.providerId)} className="ml-2 text-zinc-500 hover:text-white"><FiCopy size={12} /></button></td><td className="py-3"><TrustBadge score={provider.trustScore} paymentCount={provider.paymentCount ?? 0} /></td><td className="py-3 text-zinc-300">{provider.successfulPayments ?? 0}/{provider.paymentCount ?? 0}<span className="ml-1 text-[10px] text-zinc-500">{successPercent(provider)}</span></td><td className="py-3 text-zinc-300">{provider.paymentCount ?? 0}</td><td className="py-3 font-mono text-cyan-300">{formatUsdc(provider.settlementVolume)}</td><td className="py-3 text-zinc-300">{provider.uniquePayers ?? 0}</td><td className="py-3"><RiskBadge level={provider.riskLevel} />{(!provider.riskLevel || provider.riskLevel === 'low') && <span className="text-[10px] text-emerald-400">Low</span>}</td><td className="py-3">{validWallet ? <a className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300" href={`https://testnet.arcscan.app/address/${provider.providerId}`} target="_blank" rel="noreferrer">ArcScan <FiArrowUpRight size={12} /></a> : <a href="#graph-evidence" className="text-violet-400 hover:text-violet-300">Evidence</a>}</td></tr>; })}</tbody></table></div>}
        {providers[0] && <div id="graph-evidence" className="mt-5 border-t border-zinc-800 pt-4"><p className="mb-3 text-xs font-semibold text-zinc-400">Decision Evidence (The Graph)</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-[10px] text-zinc-500">Successful settlements</p><p className="mt-1 text-sm font-semibold text-white">{providers[0].successfulPayments ?? 0}</p></div><div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-[10px] text-zinc-500">Success rate</p><p className="mt-1 text-sm font-semibold text-white">{successPercent(providers[0])}</p></div><div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-[10px] text-zinc-500">Settlement volume</p><p className="mt-1 text-sm font-semibold text-white">{formatUsdc(providers[0].settlementVolume)}</p></div><div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-[10px] text-zinc-500">Unique buyers</p><p className="mt-1 text-sm font-semibold text-white">{providers[0].uniquePayers ?? 0}</p></div><div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-[10px] text-zinc-500">Repeat buyers</p><p className="mt-1 text-sm font-semibold text-white">{providers[0].repeatCustomers ?? 0}</p></div><div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-[10px] text-zinc-500">Recent activity</p><p className="mt-1 text-sm font-semibold text-white">{providers[0].recentActivity ? 'Active' : 'No'}</p></div></div><p className="mt-3 text-xs leading-relaxed text-zinc-400">{Number(providers[0].successfulPayments || 0) === Number(providers[0].paymentCount || 0) && Number(providers[0].uniquePayers || 0) > 1 ? 'Strong reliability and buyer diversity are supported by the indexed settlements.' : Number(providers[0].settlementVolume || 0) > 0 && (providers[0].riskLevel === 'high' || Number(providers[0].trustScore || 0) < 40) ? 'Earnings exceed the available reliability evidence; review the risk signals before spending.' : 'Graph evidence is limited.'}</p></div>}
        {providers[0]?.settlements?.length > 0 && <div className="mt-5 border-t border-zinc-800 pt-4"><p className="mb-2 text-xs font-semibold text-zinc-400">Recent indexed settlements</p><div className="divide-y divide-zinc-800/70">{providers[0].settlements.map((settlement) => { const failed = /fail|cancel|revert/i.test(String(settlement.status || '')); return <div key={settlement.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"><div className="flex min-w-0 items-center gap-2"><span className={failed ? 'text-rose-400' : 'text-emerald-400'}>{failed ? 'Failed' : 'Released'}</span><span className="font-mono text-cyan-300">{formatUsdc(settlement.amount)}</span><span className="text-zinc-500">{formatDate(settlement.timestamp)}</span></div>{settlement.transactionHash && <a className="inline-flex items-center gap-1 font-mono text-violet-400 hover:text-violet-300" href={`https://testnet.arcscan.app/tx/${settlement.transactionHash}`} target="_blank" rel="noreferrer">{shortAddress(settlement.transactionHash)} <FiExternalLink size={12} /></a>}</div>; })}</div></div>}
       </Card>
         <Card title="How the Trust Engine works" subtitle="Identity context and settlement evidence work together before payment.">
           <div className="grid gap-2 sm:grid-cols-2">
             {['The Graph indexes Arc settlements', 'GlobalPay calculates reliability and risk', 'Providers are ranked before an agent spends USDC', 'World ID/AgentBook provides identity context'].map((step, index) => <div key={step} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300"><span className="mr-2 font-mono text-violet-400">{index + 1}.</span>{step}</div>)}
           </div>
         </Card>
       </>}
    </div>
  );
}
