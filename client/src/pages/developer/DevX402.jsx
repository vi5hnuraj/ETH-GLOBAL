import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiDollarSign, FiShield, FiCheckCircle, FiXCircle, FiZap, FiRefreshCw,
  FiPlay, FiTrendingUp, FiLock, FiUnlock
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import StatusBadge from '../../components/dev/StatusBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const PREMIUM_ENDPOINTS = [
  { id: 'provider-insights', label: 'Provider Insights', desc: 'Full Graph provider intelligence & trust scores' },
  { id: 'trust-analysis', label: 'Trust Analysis', desc: 'Graph sync state + top-provider recommendation' },
  { id: 'market-data', label: 'Market Data', desc: 'Live marketplace listings + Arc network status' }
];

const DevX402 = () => {
  const { data, loading, error, refresh } = useApi({ fetcher: () => developerApi.x402Overview() });

  // Live demo state: call → 402 → pay → retry
  const [endpoint, setEndpoint] = useState('provider-insights');
  const [serviceId, setServiceId] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [demo, setDemo] = useState(null); // { stage, status, body, payment }
  const [busy, setBusy] = useState(false);

  const protectedServices = data?.protectedServices || [];
  const visibleServices = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    if (!query) return protectedServices;
    return protectedServices.filter((service) => `${service.title} ${service.service_id}`.toLowerCase().includes(query));
  }, [protectedServices, serviceSearch]);

  const runDemo = async () => {
    setBusy(true);
    setDemo({ stage: 'calling', status: null, body: null });
    try {
      // Step 1 — call without payment
      const scopedEndpoint = serviceId ? `${endpoint}?serviceId=${encodeURIComponent(serviceId)}` : endpoint;
      const first = await developerApi.x402Raw(scopedEndpoint);
      if (first.status !== 402) {
        setDemo({ stage: 'done-free', status: first.status, body: first.body });
        return;
      }
      setDemo({ stage: 'challenged', status: 402, body: first.body });

      // Step 2 — pay with the first funded agent wallet (existing MPC path)
      const p = first.body?.payment;
      if (!p?.recipientAddress) throw new Error('Server challenge missing recipient — x402 not configured.');

      const agentsState = await developerApi.agents({ perPage: 25 });
      const agents = agentsState?.agents || [];
      let paid = null;
      let payerName = null;
      for (const a of agents) {
        try {
          const bal = await developerApi.agentBalance(a.agentId);
          const balNum = parseFloat(bal?.balance) || 0;
          if (balNum >= Number(p.amount)) {
            paid = { agentId: a.agentId, wallet: a.wallet };
            payerName = a.name || a.agentId;
            break;
          }
        } catch { /* skip agents whose balance can't be read */ }
      }
      if (!paid) {
        setDemo({ stage: 'no-funds', status: 402, body: first.body });
        toast.error('No agent wallet has enough USDC to pay. Fund an agent first.');
        return;
      }
      setDemo((d) => ({ ...d, stage: 'paying', payer: payerName }));

      // Real MPC settlement through the backend agent payment path
      const payRes = await developerApi.post(`/developers/agents/${paid.agentId}/pay`, {
        destination: p.recipientAddress,
        amount: Number(p.amount),
        token: 'USDC',
        note: `x402 ${p.paymentId}`
      });
      setDemo((d) => ({ ...d, stage: 'verifying', payment: payRes }));

      // Step 3 — retry with payment proof
      const second = await developerApi.x402Raw(scopedEndpoint, {
        paymentId: p.paymentId,
        txHash: payRes.txHash,
        payer: paid.wallet
      });
      setDemo({ stage: second.ok ? 'done-paid' : 'retry-failed', status: second.status, body: second.body, payment: payRes });
      if (second.ok) toast.success('Paid & verified — premium data delivered');
      else toast.error(second.body?.message || 'Retry failed after payment');
    } catch (err) {
      toast.error(err.message || 'x402 demo failed');
      setDemo((d) => ({ ...d, stage: 'error', error: err.message }));
    } finally {
      setBusy(false);
      refresh({ background: true });
    }
  };

  const stageLabel = {
    calling: 'Calling premium endpoint…',
    challenged: '402 received — payment required',
    paying: 'Paying from agent MPC wallet…',
    verifying: 'Settled — retrying with payment proof…',
    'done-paid': 'Success — paid request completed',
    'done-free': 'Endpoint returned data without payment',
    'no-funds': 'No funded agent wallet available',
    'retry-failed': 'Payment retry was rejected',
    error: 'Demo failed'
  };

  return (
    <div className="pb-12">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">x402 APIs</h1>
          <p className="text-sm text-zinc-500 mt-1">HTTP 402-native premium endpoints — AI agents pay automatically in USDC on Arc.</p>
        </div>
        <button type="button" onClick={() => refresh({ background: true })} className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2.5 rounded-lg">
          <FiRefreshCw size={14} /> Refresh
        </button>
      </header>

      {error && !loading && <ErrorBanner message={error.message} onRetry={refresh} />}

      {/* Revenue strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Price per call', value: `${data?.price ?? '0.01'} USDC`, icon: FiDollarSign, color: 'text-cyan-400' },
          { label: 'x402 payments', value: data?.revenue?.count ?? 0, icon: FiZap, color: 'text-violet-400' },
          { label: 'Revenue earned', value: `${Number(data?.revenue?.totalUsdc ?? 0).toFixed(4)} USDC`, icon: FiTrendingUp, color: 'text-emerald-400' }
        ].map((s) => (
          <div key={s.label} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={13} className={s.color} />
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</p>
            </div>
            <p className={`text-xl font-bold font-mono ${s.color}`}>{loading && !data ? '…' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Protected APIs */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">Protected APIs</h2>
          <div className="space-y-2">
            {PREMIUM_ENDPOINTS.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEndpoint(e.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  endpoint === e.id ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-700'}`}
              >
                <div className="flex items-center gap-2">
                  <FiLock size={12} className="text-amber-400" />
                  <span className="text-xs font-semibold text-white">GET /api/x402/{e.id}</span>
                  <span className="ml-auto text-[10px] font-mono text-cyan-400">{data?.price ?? '0.01'} USDC</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">{e.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-zinc-800/60 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor="x402-service-search" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Analyze a specific service</label>
              <span className="text-[10px] text-zinc-600">{protectedServices.length} available</span>
            </div>
            <input
              id="x402-service-search"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              placeholder="Search x402 services…"
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none"
            />
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
              <option value="">All providers</option>
              {visibleServices.map((service) => <option key={service.service_id} value={service.service_id}>{service.title} · {service.x402_price || service.unit_price} USDC</option>)}
            </select>
            <p className="mt-1 text-[10px] text-zinc-600">Search and choose any active x402 service so Provider Insights analyzes that service’s provider wallet.</p>
          </div>
        </div>

        {/* Live demo */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-zinc-200 mb-1">Live Demo — autonomous payment</h2>
          <p className="text-[11px] text-zinc-500 mb-4">Call the endpoint, receive 402, the agent wallet pays on Arc, the request retries automatically.</p>

          <button
            type="button"
            onClick={runDemo}
            disabled={busy}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl inline-flex items-center justify-center gap-2 text-sm transition-colors"
          >
            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiPlay size={14} />}
            {busy ? 'Running…' : `Call /api/x402/${endpoint}`}
          </button>

          {demo && (
            <div className="mt-4 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <StatusBadge status={demo.stage === 'done-paid' ? 'confirmed' : demo.stage === 'retry-failed' || demo.stage === 'error' ? 'failed' : 'pending'} />
                <span className="text-[11px] text-zinc-400">{stageLabel[demo.stage] || demo.stage}</span>
              </div>

              {demo.body?.payment && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mb-3 text-[11px] space-y-1">
                  <p className="font-semibold text-amber-300 flex items-center gap-1.5"><FiLock size={10} /> 402 Payment Required</p>
                  <div className="flex justify-between"><span className="text-zinc-500">Amount</span><span className="font-mono text-white">{demo.body.payment.amount} USDC</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Recipient</span><span className="font-mono text-zinc-400">{String(demo.body.payment.recipientAddress || '—').slice(0, 12)}…</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Network</span><span className="text-zinc-400">{demo.body.payment.network} · {demo.body.payment.currency}</span></div>
                </div>
              )}

              {demo.payment?.txHash && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 text-[11px] space-y-1">
                  <p className="font-semibold text-emerald-300 flex items-center gap-1.5"><FiCheckCircle size={10} /> Arc settlement</p>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-zinc-500 shrink-0">Tx</span>
                    <code className="font-mono text-zinc-300 truncate">{demo.payment.txHash.slice(0, 22)}…</code>
                  </div>
                  {demo.payment.explorerUrl && (
                    <a href={demo.payment.explorerUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline text-[10px]">View on ArcScan ↗</a>
                  )}
                </div>
              )}

              {demo.body && (demo.stage === 'done-paid' || demo.stage === 'done-free') && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 flex-1 overflow-auto max-h-56">
                  <p className="text-[10px] text-zinc-500 mb-1.5 flex items-center gap-1.5"><FiUnlock size={9} /> Premium response</p>
                  <pre className="text-[10px] font-mono text-zinc-400 whitespace-pre-wrap break-all">{JSON.stringify(demo.body, null, 2).slice(0, 2000)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent payments */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mt-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Recent x402 Payments</h2>
        {loading && !data ? (
          <Skeleton lines={3} />
        ) : !data?.payments?.length ? (
          <p className="text-xs text-zinc-500 py-4 text-center">No x402 payments yet. Run the live demo to make the first one.</p>
        ) : (
          <div className="space-y-1.5">
            {data.payments.map((p) => (
              <div key={p.payment_id} className="flex items-center gap-3 rounded-lg bg-zinc-950/40 border border-zinc-800/40 px-3 py-2">
                <FiShield size={12} className="text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-zinc-300 font-mono truncate">{p.tx_hash.slice(0, 26)}…</p>
                  <p className="text-[10px] text-zinc-600">{p.endpoint} · block {p.block_number ?? '—'} · {new Date(p.created_at).toLocaleString()}</p>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 shrink-0">{Number(p.amount).toFixed(4)} USDC</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DevX402;
