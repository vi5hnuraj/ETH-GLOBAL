import React, { useState } from 'react';
import { FiActivity, FiCheckCircle, FiClock, FiDollarSign, FiSearch, FiShield, FiZap } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const stages = [
  ['observe', 'Observe', FiSearch],
  ['decide', 'Decide', FiShield],
  ['act', 'Act on Arc', FiDollarSign],
  ['verify', 'Verify', FiCheckCircle]
];

export default function DevAutonomousCommerce() {
  const agents = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const [goal, setGoal] = useState('Find the safest OCR provider and purchase one credit.');
  const [consumerAgentId, setConsumerAgentId] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const list = agents.data?.agents || [];

  const run = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await developerApi.autonomousCommerce({ goal, consumerAgentId, quantity: '1', invoke: false }));
    } catch (err) {
      setError(err.message || 'Autonomous commerce failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Autonomous Commerce</h1><span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300"><FiZap size={12} /> Graph → Arc → Verify</span></div>
        <p className="mt-1 text-sm text-zinc-500">One prompt: discover providers, reason over live Graph evidence, settle USDC on Arc, and verify the result.</p>
      </header>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{stages.map(([id, label, Icon], index) => <div key={id} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300"><Icon className="text-violet-400" size={15} /><span>{index + 1}. {label}</span></div>)}</div>
      <Card title="Give the agent a goal" subtitle="The agent uses only live The Graph evidence before creating the existing prepaid Arc purchase.">
        <form onSubmit={run} className="space-y-3">
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-white outline-none focus:border-cyan-500" />
          <div className="flex flex-col gap-3 sm:flex-row"><select value={consumerAgentId} onChange={(e) => setConsumerAgentId(e.target.value)} required className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white"><option value="">Select consumer agent</option>{list.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name || agent.agentId}</option>)}</select><button disabled={busy || !consumerAgentId || !goal.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">{busy ? <FiActivity className="animate-spin" /> : <FiZap />} Run autonomous workflow</button></div>
        </form>
      </Card>
      {error && <ErrorBanner message={error} />}
      {result && <div className="space-y-4">
        <Card title="Decision" subtitle={result.decisionReason}><p className="text-sm text-zinc-300">Selected provider: <strong className="text-white">{result.providerChosen?.title || result.providerChosen?.serviceId}</strong></p><p className="mt-2 text-xs text-violet-300">Evidence source: {result.graphEvidence?.source} · {result.graphEvidence?.successfulPayments} successful payments · {Number(result.graphEvidence?.settlementVolume || 0).toFixed(4)} USDC indexed volume</p></Card>
        <div className="grid gap-4 md:grid-cols-2"><Card title="Arc settlement"><p className="text-sm text-zinc-300">{result.arcSettlement?.success ? 'USDC payment confirmed.' : result.arcSettlement?.message || 'Payment failed.'}</p>{result.arcSettlement?.txHash && <a className="mt-2 block break-all text-xs text-cyan-400" href={`https://testnet.arcscan.app/tx/${result.arcSettlement.txHash}`} target="_blank" rel="noreferrer">{result.arcSettlement.txHash}</a>}</Card><Card title="The Graph verification"><p className="text-sm text-zinc-300">{result.verification?.verified ? 'Settlement indexed and verified.' : result.verification?.reason || 'Awaiting indexed settlement.'}</p>{result.verification?.settlement?.timestamp && <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500"><FiClock size={12} />{new Date(Number(result.verification.settlement.timestamp) * 1000).toLocaleString()}</p>}</Card></div>
      </div>}
    </div>
  );
}
