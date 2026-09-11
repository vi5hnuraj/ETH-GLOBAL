import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FiShield, FiCheckCircle, FiXCircle, FiActivity, FiUsers, FiDollarSign,
  FiTrendingUp, FiAlertTriangle, FiClock, FiCpu, FiRefreshCw, FiZap,
  FiGlobe, FiBookOpen, FiAward, FiLink, FiArrowLeft, FiBarChart2
} from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Pill from '../../components/dev/Pill';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const fmtUsd = (v, d = 4) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '0.0000');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

const RISK_TONE = { low: 'emerald', medium: 'amber', high: 'red', unknown: 'zinc' };
const TRUST_TONE = (t) => (t == null ? 'zinc' : t >= 75 ? 'emerald' : t >= 45 ? 'amber' : 'red');
const PRICING_LABELS = {
  per_unit: 'Per Unit',
  per_request: 'Per Request',
  per_hour: 'Per Hour',
  per_char: 'Per Character',
  per_mb_day: 'Per MB / Day',
  flat: 'Flat Fee',
  subscription: 'Subscription'
};

/* ─────────────── Identity badge row (World layer) ─────────────── */
const IdentityBadges = ({ passport }) => (
  <div className="flex flex-wrap gap-2">
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${passport.humanVerified
      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
      : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>
      {passport.humanVerified ? <FiCheckCircle size={12} /> : <FiXCircle size={12} />}
      Verified Human
      {passport.humanVerified && <span className="text-[10px] font-normal text-violet-400/70">World ID</span>}
    </span>
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${passport.agentBookRegistered
      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
      : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>
      <FiGlobe size={12} />
      AgentBook {passport.agentBookRegistered ? 'Registered' : 'Not registered'}
      {passport.agentBookRegistered && <span className="text-[10px] font-normal text-violet-400/70">World Chain</span>}
    </span>
    {passport.continuity?.active && (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300"
        title={passport.continuity.explanation}>
        <FiLink size={12} /> Publisher continuity
      </span>
    )}
  </div>
);

/* ─────────────── Trust metric tile ─────────────── */
const TrustTile = ({ icon, label, value, sub, tone = 'text-white' }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
      {icon} {label}
    </div>
    <p className={`mt-1.5 text-lg font-black ${tone}`}>{value}</p>
    {sub && <p className="text-[10px] text-zinc-600">{sub}</p>}
  </div>
);

/* ─────────────── Main page ─────────────── */
const DevAgentProfile = () => {
  const [params] = useSearchParams();
  const agentId = params.get('agentId');
  const serviceId = params.get('serviceId');

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.agentPassportProfile({ agentId, serviceId }),
    deps: [agentId, serviceId]
  });

  const passport = data?.passport || null;
  const overview = data?.trustOverview || null;

  const riskTone = RISK_TONE[passport?.riskLevel] || 'zinc';

  if (loading && !passport) {
    return (
      <div className="space-y-4">
        <Skeleton lines={2} />
        <Skeleton className="h-40 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error && !passport) {
    return <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />;
  }

  if (!passport) {
    return (
      <Card>
        <p className="text-center text-sm text-zinc-500">
          Provider not found. Open a marketplace service and click the provider to view its Agent Profile.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link to="/developer/marketplace" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
              <FiArrowLeft size={12} /> Back to Marketplace
            </Link>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
                <FiCpu size={17} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-white">{passport.agentName || 'Agent Passport'}</h1>
                <p className="truncate text-xs text-zinc-500">
                  {data?.service ? <>Agent Passport · provider for <span className="text-zinc-300">{data.service.title}</span></> : 'Human-backed agent identity and trust record'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={TRUST_TONE(passport.trustScore)} dot>Trust {passport.trustScore}/100</Pill>
            <Pill tone={riskTone}>Risk: {passport.riskLevel}</Pill>
            <button type="button" onClick={refresh} aria-label="Refresh passport" title="Refresh passport" className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800">
              <FiRefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800/70 pt-3 text-[10px] text-zinc-600">
          <span className="font-mono">Agent ID · {passport.agentId}</span>
          <span title={passport.passportId}>Passport ID · {passport.passportId}</span>
        </div>
      </div>

      {/* Identity — the World layer */}
      <Card dense className="border-violet-900/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <FiShield size={14} className="text-violet-400" /> Human-Backed Agent Identity
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">World ID verifies the publisher. AgentBook links this wallet to that human.</p>
          </div>
          <IdentityBadges passport={passport} />
        </div>

        <div className="mt-3 grid overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-b border-zinc-800 px-3 py-2.5 sm:border-r lg:border-b-0">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Wallet</p>
            <p className="truncate font-mono text-xs text-zinc-300" title={passport.walletAddress || ''}>
              {passport.walletAddress ? `${passport.walletAddress.slice(0, 10)}…${passport.walletAddress.slice(-8)}` : '—'}
            </p>
          </div>
          <div className="border-b border-zinc-800 px-3 py-2.5 lg:border-b-0 lg:border-r">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Publisher</p>
            <p className="truncate text-xs text-zinc-300">{passport.publisher?.name || 'Verified publisher'}</p>
          </div>
          <div className="border-b border-zinc-800 px-3 py-2.5 sm:border-r lg:border-b-0">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">AgentBook ID</p>
            <p className="truncate font-mono text-xs text-zinc-400">{passport.agentBookId ? `${String(passport.agentBookId).slice(0, 14)}…` : 'Not registered'}</p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Verified since</p>
            <p className="truncate text-xs text-zinc-400">{passport.verifiedAt ? fmtDate(passport.verifiedAt) : 'Not verified'}</p>
          </div>
        </div>

        {passport.agentBookTxHash && (
          <p className="mt-3 font-mono text-[10px] text-zinc-600">
            Registration tx: {String(passport.agentBookTxHash).slice(0, 20)}…{String(passport.agentBookTxHash).slice(-10)}
          </p>
        )}
      </Card>

      {/* Trust metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TrustTile icon={<FiAward size={11} />} label="Trust Score" value={`${passport.trustScore}/100`} tone={TRUST_TONE(passport.trustScore) === 'emerald' ? 'text-emerald-400' : TRUST_TONE(passport.trustScore) === 'amber' ? 'text-amber-400' : 'text-white'} sub={`source: ${passport.trustSource}`} />
        <TrustTile icon={<FiDollarSign size={11} />} label="Settlement Volume" value={`${fmtUsd(passport.intelligence?.settlementVolume)} USDC`} sub="indexed on The Graph" />
        <TrustTile icon={<FiCheckCircle size={11} />} label="Successful Payments" value={passport.intelligence?.successfulPayments ?? 0} sub={`of ${passport.intelligence?.paymentCount ?? 0} indexed payments`} />
        <TrustTile icon={<FiUsers size={11} />} label="Unique Buyers" value={passport.intelligence?.uniqueBuyers ?? 0} sub={`${passport.intelligence?.repeatBuyers ?? 0} repeat buyer(s)`} />
      </div>

      {/* The Graph — Evidence */}
      <Card dense className="mt-4" title={
        <span className="flex items-center gap-2">
          <FiActivity size={15} className="text-indigo-400" />
          <span>The Graph <span className="text-zinc-600 font-normal">— Evidence</span></span>
          {passport.trustSource?.includes('Graph') ? (
            <span className="ml-1 flex items-center gap-1 text-[10px] font-normal text-emerald-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
              Live
            </span>
          ) : (
            <span className="ml-1 text-[10px] font-normal text-amber-400">Pending</span>
          )}
        </span>
      } subtitle="Live indexed settlement data from The Graph">
        <div className="space-y-1 text-xs text-zinc-400">
          <p>Settlements Indexed: <span className="text-zinc-200 font-semibold">{passport.intelligence?.successfulPayments ?? '—'}</span> · <span className="text-zinc-200 font-semibold">{passport.intelligence?.paymentCount ?? '—'}</span> payments</p>
          <p>Volume on Arc: <span className="text-zinc-200 font-semibold">{fmtUsd(passport.intelligence?.settlementVolume)}</span> USDC</p>
          <p>Success Rate: <span className="text-zinc-200 font-semibold">{passport.successRate != null ? `${(Number(passport.successRate) * 100).toFixed(1)}%` : '—'}</span></p>
          <p>Last Active: <span className="text-zinc-200 font-semibold">{passport.intelligence?.lastSettlement ? new Date(passport.intelligence.lastSettlement).toLocaleDateString() : '—'}</span></p>
        </div>
        <div className="mt-3 border-t border-zinc-800 pt-2 text-[10px] text-zinc-700 text-right">Powered by The Graph</div>
      </Card>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        {/* Risk analysis */}
        <Card dense className="h-fit self-start" title="Risk Analysis" subtitle="Graph-derived fraud signals">
          <div className="space-y-2">
            {(passport.riskFlags || []).length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-emerald-400">
                <FiCheckCircle size={13} /> No risk signals detected in the indexed settlement history.
              </p>
            ) : (
              passport.riskFlags.map((f, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <FiAlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-300">{f.code}</p>
                    <p className="text-[11px] text-zinc-400">{f.detail}</p>
                  </div>
                </div>
              ))
            )}
            <p className="pt-1 text-[10px] text-zinc-600">Risk level: <span className={`font-semibold ${riskTone === 'emerald' ? 'text-emerald-400' : riskTone === 'amber' ? 'text-amber-400' : riskTone === 'red' ? 'text-rose-400' : 'text-zinc-400'}`}>{passport.riskLevel}</span> · The Graph</p>
          </div>
        </Card>

        {/* Explainable trust reasoning */}
        <Card dense className="h-fit self-start" title="Why this trust score?" subtitle="Evidence behind the score">
          <ul className="space-y-1.5">
            {(passport.trustReasoning || []).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-400">
                <span className="mt-0.5 text-zinc-600">•</span> {r}
              </li>
            ))}
            {(passport.trustReasoning || []).length === 0 && (
              <li className="text-xs text-zinc-600">No reasoning available yet.</li>
            )}
          </ul>
        </Card>

        {/* Publisher continuity */}
        <Card dense className="h-fit self-start" title="Publisher Continuity" subtitle="Publisher-level identity across wallets">
          {passport.continuity?.active ? (
            <div className="space-y-2.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                <FiLink size={12} /> This wallet inherits the publisher record
              </p>
              <p className="text-xs leading-relaxed text-zinc-400">{passport.continuity.explanation}</p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Publisher wallets</p>
                  <p className="text-sm font-bold text-zinc-200">{passport.continuity.publisherWalletCount}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <p className="text-[10px] text-zinc-500">Aggregated volume</p>
                  <p className="text-sm font-bold text-zinc-200">{fmtUsd(passport.continuity.aggregatedSettlementVolume)} USDC</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <p className="text-[10px] text-zinc-500">First settlement</p>
                  <p className="text-sm font-bold text-zinc-200">{passport.continuity.firstSettlement ? new Date(passport.continuity.firstSettlement).toLocaleDateString() : '—'}</p>
                </div>
              </div>
            </div>
           ) : (
             <div className="space-y-2">
               <p className="flex items-center gap-2 text-xs text-zinc-400">
                 <FiLink size={12} className="text-zinc-500" /> {passport.agentBookRegistered ? 'Publisher-level identity across AgentBook-linked wallets' : 'Publisher-level identity across wallets'}
               </p>
               {passport.publisher?.agentBookCount > 0 ? (
                 <p className="text-xs text-zinc-500">
                   {passport.publisher.agentBookCount} AgentBook-linked wallet(s) share this publisher profile — reputation and settlement history are aggregated at the publisher level.
                 </p>
               ) : (
                 <p className="text-xs text-zinc-500">
                   No wallets registered through AgentBook yet. Register wallets to enable publisher-level identity and reputation continuity.
                 </p>
               )}
             </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card dense className="h-fit self-start" title="Recent Activity" subtitle="Latest indexed settlements · auditable on Arc">
          {(passport.paymentHistory || []).length === 0 ? (
            <p className="text-xs text-zinc-600">No indexed settlements yet — trust becomes measurable after the first verified Graph settlement.</p>
          ) : (
            <div className="space-y-1.5">
              {passport.paymentHistory.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-zinc-400" title={p.transactionHash}>
                      {p.transactionHash ? `${String(p.transactionHash).slice(0, 14)}…${String(p.transactionHash).slice(-8)}` : p.id}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {p.timestamp ? new Date(Number(p.timestamp) * 1000).toLocaleString() : ''} · block {p.blockNumber ?? '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-zinc-200">{fmtUsd(p.amount)} USDC</p>
                    <p className={`text-[10px] ${String(p.status).toUpperCase() === 'RELEASED' ? 'text-emerald-400' : 'text-zinc-500'}`}>{p.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Capabilities */}
      <Card dense title="Supported Capabilities" subtitle="Published marketplace services">
        {(passport.capabilities || []).length === 0 ? (
          <p className="text-xs text-zinc-600">No published services yet.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {passport.capabilities.map((c) => (
              <Link
                key={c.serviceId}
                to={`/developer/marketplace/service/${c.serviceId}`}
                className="group rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 transition-colors hover:border-zinc-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-200 group-hover:text-white">{c.title}</p>
                  <Pill tone={c.isActive ? 'emerald' : 'zinc'}>{c.isActive ? 'live' : 'paused'}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">{c.category} · {PRICING_LABELS[c.pricingModel] || String(c.pricingModel || '').replace(/_/g, ' ')}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {fmtUsd(c.unitPrice)} USDC / {c.unitLabel || 'unit'}
                  {c.requireX402 && <span className="ml-2 text-amber-400">⚡ x402 {fmtUsd(c.x402Price || 0.01, 2)}</span>}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Reputation & activity metrics (platform-level) */}
      {(passport.reputation || passport.activityMetrics) && (
        <Card title="Platform Reputation & Activity" subtitle="GlobalPay ledger — complements the on-chain Graph record">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {passport.reputation && (
              <>
                <TrustTile icon={<FiBarChart2 size={11} />} label="Platform Trust" value={`${passport.reputation.trustScore}/100`} />
                <TrustTile icon={<FiCheckCircle size={11} />} label="Completed Jobs" value={passport.reputation.completedJobs} sub={`${passport.reputation.failedJobs} failed`} />
                <TrustTile icon={<FiActivity size={11} />} label="Payment Success" value={`${Number(passport.reputation.paymentSuccessRate || 0) > 1 ? Number(passport.reputation.paymentSuccessRate).toFixed(1) : (Number(passport.reputation.paymentSuccessRate || 0) * 100).toFixed(1)}%`} />
                <TrustTile icon={<FiUsers size={11} />} label="Repeat Customers" value={passport.reputation.repeatCustomers} />
              </>
            )}
            {!passport.reputation && passport.activityMetrics && (
              <TrustTile icon={<FiActivity size={11} />} label="Platform Invoices" value={passport.activityMetrics.platformInvoices} sub={`${passport.activityMetrics.platformPaidInvoices} paid`} />
            )}
            {passport.activityMetrics && (
              <TrustTile icon={<FiClock size={11} />} label="Last Paid Invoice" value={passport.activityMetrics.lastPaidInvoiceAt ? new Date(passport.activityMetrics.lastPaidInvoiceAt).toLocaleDateString() : '—'} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default DevAgentProfile;
