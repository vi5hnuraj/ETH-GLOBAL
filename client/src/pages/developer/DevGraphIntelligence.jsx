import React, { useState } from 'react';
import { FiActivity, FiCheckCircle, FiClock, FiExternalLink, FiSearch, FiShield, FiZap } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const suggestions = [
  'Which provider is safest for my next purchase?',
  'Who earned the most USDC this week?',
  'Show providers with success rate above 80%.',
  'Are there any fraud signals in provider history?'
];

const TrustBadge = ({ score, confidence, paymentCount }) => (
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
        <FiShield size={11} />{score}/100
      </span>
    )}
    {confidence != null && <span className="text-[10px] text-zinc-500">{Math.round(confidence * 100)}% conf</span>}
  </div>
);

const RiskBadge = ({ level }) => {
  if (!level || level === 'low') return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${level === 'high' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{level === 'high' ? '⚠ High Risk' : '● Medium'}</span>;
};

export default function DevGraphIntelligence() {
  const status = useApi({ fetcher: developerApi.graphStatus });
  const [question, setQuestion] = useState(suggestions[0]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ask = async (event) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await developerApi.graphAsk(question));
    } catch (err) {
      setError(err.message || 'Trust Engine request failed.');
    } finally {
      setLoading(false);
    }
  };

  const providers = result?.providers || [];
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Trust Engine</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300"><FiZap size={12} /> Powered by The Graph</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Compare provider settlement activity before an agent spends USDC on Arc.</p>
      </header>

      {status.loading ? <Skeleton className="h-16 rounded-xl" /> : (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Data source</p><p className="mt-1 text-sm text-white">{status.data?.provider || 'The Graph'}</p></div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Synced</p><p className={`mt-1 text-sm ${status.data?.live ? 'text-emerald-400' : 'text-amber-400'}`}>{status.data?.live ? `Block #${status.data?.indexedBlock ?? '?'}` : 'Offline'}</p>{status.data?.lagBlocks != null && <p className="text-[10px] text-zinc-500">Head #${status.data?.headBlock ?? '?'} · lag {status.data?.lagBlocks} blocks</p>}</div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-500">Payments</p><p className="mt-1 text-sm text-white">{status.data?.paymentCount ?? 0} indexed</p>{status.data?.settlementCount != null && <p className="text-[10px] text-zinc-500">{status.data?.settlementCount} settlements · {status.data?.invoiceReferenceCount ?? 0} invoices</p>}</div>
        </div>
      )}

      <Card title="Ask before you pay" subtitle="Provider selection is part of the autonomous commerce flow.">
        <form onSubmit={ask} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><FiSearch className="absolute left-3 top-3 text-zinc-500" size={16} /><input value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-500" placeholder="Which OCR provider is safest?" /></div>
          <button disabled={loading || !question.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{loading ? <FiActivity className="animate-spin" /> : <FiShield />} Analyze providers</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-violet-500/50 hover:text-violet-300">{item}</button>)}</div>
      </Card>

      {error && <ErrorBanner message={error} />}
      {result && <>
        {result.answer && <Card title="Trust Engine Answer" subtitle={`Intent: ${result.intent} · Source: ${result.source}`}>
          <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 text-sm text-zinc-200 font-mono border border-zinc-800">{result.answer}</pre>
        </Card>}
        <Card title="Provider Ranking" subtitle={`${providers.length} provider(s) analyzed from live Graph evidence`}>
        {providers.length === 0 ? <p className="text-sm text-zinc-500">No live indexed provider data is available yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="pb-3">Provider</th><th className="pb-3">Trust</th><th className="pb-3">Volume</th><th className="pb-3">Buyers</th><th className="pb-3">Risk</th><th className="pb-3">Latest</th></tr></thead><tbody>{providers.map((provider, index) => <tr key={provider.providerId} className="border-t border-zinc-800/70"><td className="py-3 text-white">{index === 0 && <FiCheckCircle className="mr-2 inline text-emerald-400" size={14} />}{provider.providerId}</td><td className="py-3"><TrustBadge score={provider.trustScore} confidence={provider.confidence} paymentCount={provider.paymentCount ?? 0} /></td><td className="py-3 font-mono text-cyan-300">{Number(provider.settlementVolume || 0).toFixed(4)} USDC</td><td className="py-3 text-zinc-300">{provider.uniquePayers || 0}</td><td className="py-3"><RiskBadge level={provider.riskLevel} />{provider.riskFlags?.length > 0 && <span className="ml-1 text-[10px] text-zinc-500">{provider.riskFlags.length} flag(s)</span>}</td><td className="py-3 text-zinc-500">{provider.lastSettlement ? new Date(provider.lastSettlement).toLocaleString() : 'No indexed payment'}</td></tr>)}</tbody></table></div>}
        {providers[0]?.reasoning?.length > 0 && <div className="mt-4 border-t border-zinc-800 pt-4"><p className="mb-2 text-xs font-semibold text-zinc-400">Decision Evidence (The Graph)</p><ul className="space-y-1">{providers[0].reasoning.map((line, i) => <li key={i} className="text-xs text-zinc-400">{line}</li>)}</ul></div>}
        {providers[0]?.settlements?.length > 0 && <div className="mt-5 border-t border-zinc-800 pt-4"><p className="mb-2 text-xs font-semibold text-zinc-400">Recent indexed settlements</p>{providers[0].settlements.map((settlement) => <div key={settlement.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="flex items-center gap-2 text-zinc-400"><FiClock size={13} />{settlement.timestamp ? new Date(settlement.timestamp).toLocaleString() : 'Settlement'}</span>{settlement.transactionHash && <a className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300" href={`https://testnet.arcscan.app/tx/${settlement.transactionHash}`} target="_blank" rel="noreferrer">ArcScan <FiExternalLink size={12} /></a>}</div>)}</div>}
      </Card>
      </>}
    </div>
  );
}
