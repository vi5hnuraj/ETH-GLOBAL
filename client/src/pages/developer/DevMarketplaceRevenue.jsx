import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiDollarSign, FiClock, FiUsers, FiAward, FiTrendingUp, FiLayers,
  FiShoppingCart, FiCheckCircle, FiAlertCircle, FiActivity, FiBarChart2, FiCopy, FiFileText
} from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import RangeSelect from '../../components/dev/RangeSelect';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import { initials, fmtBot } from '../../utils/present';

const CHART_TOOLTIP = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 };
const HOUR_MS = 3600000;

const RANGES = [
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '6M', label: '6M' },
  { id: '12M', label: '12M' }
];

const MONTHS = { '30d': 1, '90d': 3, '6M': 6, '12M': 12 };

const settleHours = (i) => {
  if (i.status !== 'paid' || !i.createdAt || !i.paidAt) return null;
  const a = new Date(i.createdAt).getTime();
  const b = new Date(i.paidAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, (b - a) / HOUR_MS);
};

const fmtSettleTime = (hours) => {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1 / 60) return '<1s';
  if (hours < 1) return `${Math.round(hours * 60)}s`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24 * 10) / 10}d`;
};

const DevMarketplaceRevenue = () => {
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: developerApi.marketplaceRevenue });
  const invoiceState = useApi({
    fetcher: () => developerApi.invoices({ role: 'provider', perPage: 100 }),
    enabled: (data?.analytics?.paidCount ?? 0) > 0
  });
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const marketState = useApi({ fetcher: () => developerApi.marketplace({ perPage: 100 }) });
  const [range, setRange] = useState('30d');

  // ── All derived state BEFORE any early return ──
  const revenue = data?.revenue || {};
  const analytics = data?.analytics || {};
  const paidInvoices = (invoiceState.data?.invoices || []).filter((i) => i.status === 'paid');
  const hours = paidInvoices.map(settleHours).filter((h) => h !== null);
  const settlementHours = hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : null;
  const fastest = hours.length ? Math.min(...hours) : null;
  const slowest = hours.length ? Math.max(...hours) : null;

  const totalPaidBOT = Number(revenue.totalPaidBOT ?? 0);
  const totalPendingBOT = Number(revenue.totalPendingBOT ?? 0);

  const months = (revenue.monthlyRevenue || []).map((m) => ({ month: m.month, revenue: Number(m.revenueBOT) }));
  const windowed = months.slice(-(MONTHS[range] || 1));
  const chartData = windowed.map((m) => ({ name: m.month, revenue: m.revenue }));
  const chartTotal = chartData.reduce((s, d) => s + d.revenue, 0);

  const growth = useMemo(() => {
    if (windowed.length >= 2 && windowed[windowed.length - 2].revenue > 0) {
      return Math.round(((windowed[windowed.length - 1].revenue - windowed[windowed.length - 2].revenue) / windowed[windowed.length - 2].revenue) * 1000) / 10;
    }
    if (windowed.length === 1 && windowed[0].revenue > 0) return 100;
    return null;
  }, [windowed]);

  const totalAll = totalPaidBOT + totalPendingBOT;
  const paidPct = totalAll > 0 ? Math.round((totalPaidBOT / totalAll) * 100) : 0;
  const pendingPct = totalAll > 0 ? Math.round((totalPendingBOT / totalAll) * 100) : 0;

  // Name resolution maps
  const serviceMap = useMemo(() => Object.fromEntries((marketState.data?.services || []).map((s) => [s.serviceId, s])), [marketState.data]);
  const agentMap = useMemo(() => Object.fromEntries((agentsState.data?.agents || []).map((a) => [a.agentId, a])), [agentsState.data]);

  const topServices = (analytics.topServices || []).map((s, idx) => {
    const svc = serviceMap[s.serviceId];
    return {
      ...s, rank: idx + 1,
      displayName: svc?.title || null,
      providerName: svc?.provider?.name || null,
      category: svc?.category || null,
      pct: totalPaidBOT > 0 ? Math.round((Number(s.revenueBOT) / totalPaidBOT) * 100) : 0
    };
  });
  const topCustomers = (analytics.topCustomers || []).map((c, idx) => {
    const agent = agentMap[c.agentId];
    return {
      ...c, rank: idx + 1,
      displayName: agent?.name || null,
      orgName: agent?.organizationId || null,
      wallet: agent?.wallet || null,
      pct: totalPaidBOT > 0 ? Math.round((Number(c.revenueBOT) / totalPaidBOT) * 100) : 0
    };
  });

  // Loading skeleton
  if (loading && !data) {
    return (
      <div>
        <Skeleton className="h-8 w-56 rounded mb-4" />
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[80px] rounded-xl" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-[320px] rounded-xl lg:col-span-2" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    );
  }

  // Error
  if (error && !data) {
    return (
      <div>
        <PageHeader title="Revenue" subtitle="Marketplace earnings and settlement analytics." />
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      </div>
    );
  }

  // Empty state
  if (analytics.paidCount === 0 && totalPendingBOT === 0) {
    return (
      <div>
        <PageHeader
          title="Revenue"
          subtitle="Track earnings, settlements, and marketplace performance."
          actions={<RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />}
        />
        <EmptyState
          icon={FiShoppingCart}
          title="No revenue yet"
          description="Publish a service and receive your first payment."
          benefits={[
            'Publish a service with a BOT price',
            'Consumer agents discover and purchase it',
            'Invoices settle automatically on-chain',
            'Revenue appears here after settlement'
          ]}
          primary={{ label: 'Browse Marketplace', href: '/developer/marketplace', icon: <FiShoppingCart size={14} /> }}
          secondary={{ label: 'My Services', href: '/developer/services', icon: <FiLayers size={14} /> }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Revenue</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Track earnings, settlements, and marketplace performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeSelect value={range} onChange={setRange} ranges={RANGES} />
          <RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />
        </div>
      </div>

      {/* ── KPI Cards — 6 compact metrics ──────────────── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
        {[
          {
            icon: <FiDollarSign size={14} />,
            label: 'Total Revenue',
            value: `${fmtBot(totalPaidBOT)} BOT`,
            sub: growth !== null
              ? <span className={growth >= 0 ? 'text-emerald-400' : 'text-red-400'}>{growth >= 0 ? '+' : ''}{growth}%</span>
              : null,
            accent: 'text-emerald-400'
          },
          {
            icon: <FiClock size={14} />,
            label: 'Pending',
            value: `${fmtBot(totalPendingBOT)} BOT`,
            sub: `${analytics.pendingCount ?? 0} invoice${(analytics.pendingCount ?? 0) === 1 ? '' : 's'}`,
            accent: 'text-amber-400'
          },
          {
            icon: <FiCheckCircle size={14} />,
            label: 'Paid',
            value: `${fmtBot(totalPaidBOT)} BOT`,
            sub: `${analytics.paidCount ?? 0} invoice${(analytics.paidCount ?? 0) === 1 ? '' : 's'}`,
            accent: 'text-blue-400'
          },
          {
            icon: <FiUsers size={14} />,
            label: 'Customers',
            value: analytics.activeCustomers ?? 0,
            sub: 'Consumer agents',
            accent: 'text-violet-400'
          },
          {
            icon: <FiLayers size={14} />,
            label: 'Services',
            value: analytics.activeServices ?? 0,
            sub: 'Published',
            accent: 'text-cyan-400'
          },
          {
            icon: <FiActivity size={14} />,
            label: 'Success Rate',
            value: `${analytics.paymentSuccessRate ?? 0}%`,
            sub: (analytics.paymentSuccessRate ?? 0) >= 95 ? 'Healthy' : 'Review',
            accent: (analytics.paymentSuccessRate ?? 0) >= 95 ? 'text-emerald-400' : 'text-amber-400'
          }
        ].map((kpi, i) => (
          <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2.5 min-h-[80px] flex flex-col justify-center">
            <div className={`${kpi.accent} mb-1`}>{kpi.icon}</div>
            <p className="font-mono text-sm font-bold text-white leading-tight truncate">{kpi.value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 mt-0.5">{kpi.label}</p>
            {kpi.sub && <p className="text-[10px] text-zinc-500 mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Chart + Revenue Breakdown (side-by-side) ──── */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">

        {/* Revenue Chart — area */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Revenue Trend</h3>
              <p className="text-[11px] text-zinc-600 mt-0.5">{fmtBot(chartTotal)} BOT this period</p>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-xs text-zinc-600">No revenue data in this window.</p>
            </div>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} width={50} />
                  <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => [`${fmtBot(v)} BOT`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Revenue Breakdown */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Revenue Breakdown</h3>
          <div className="space-y-3">
            {/* Paid */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-300">Paid Revenue</span>
                <span className="font-mono text-emerald-400 font-semibold">{paidPct}%</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
            {/* Pending */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-300">Pending</span>
                <span className="font-mono text-amber-400 font-semibold">{pendingPct}%</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pendingPct}%` }} />
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-2 mt-2">
              {/* Avg invoice */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] text-zinc-500">Avg Invoice</span>
                <span className="font-mono text-xs font-semibold text-white">{fmtBot(analytics.averageInvoiceBOT ?? 0)} BOT</span>
              </div>
              {/* Settlement */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] text-zinc-500">Settlement Time</span>
                <span className="font-mono text-xs font-semibold text-white">{fmtSettleTime(settlementHours)}</span>
              </div>
              {/* Growth */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[11px] text-zinc-500">Growth</span>
                {growth !== null ? (
                  <span className={`font-mono text-xs font-semibold ${growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {growth >= 0 ? '+' : ''}{growth}%
                  </span>
                ) : (
                  <span className="font-mono text-xs text-zinc-600">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Services + Top Customers ───────────────── */}
      <div className="grid lg:grid-cols-2 gap-4 mb-5">

        {/* Top Services */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Top Services</h3>
          {topServices.length === 0 ? (
            <p className="text-[11px] text-zinc-600">No paid services yet.</p>
          ) : (
            <div className="space-y-2.5">
              {topServices.map((s) => (
                <div key={s.serviceId} className="flex items-center gap-3 group">
                  <span className="text-[10px] font-bold text-zinc-600 w-4 text-right shrink-0">#{s.rank}</span>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white ${
                    s.category === 'ai-model' ? 'from-purple-500 to-purple-700' :
                    s.category === 'gpu' ? 'from-blue-500 to-blue-700' :
                    s.category === 'ocr' ? 'from-emerald-500 to-emerald-700' :
                    'from-zinc-600 to-zinc-800'
                  }`}>
                    <FiFileText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white truncate" title={s.displayName || s.serviceId}>
                        {s.displayName || 'Untitled Service'}
                      </p>
                      <span className="font-mono text-xs font-semibold text-white shrink-0">{fmtBot(s.revenueBOT)} BOT</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.providerName && (
                        <span className="text-[10px] text-zinc-500">{s.providerName}</span>
                      )}
                      <span className="text-[10px] text-zinc-600">·</span>
                      <span className="text-[10px] text-zinc-600">{s.pct}%</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(s.serviceId); }}
                        className="opacity-0 group-hover:opacity-100 text-[9px] text-zinc-600 hover:text-zinc-400 transition-opacity"
                        title={`Copy ${s.serviceId}`}
                      >
                        <FiCopy size={9} />
                      </button>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1.5">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Customers */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Top Customers</h3>
          {topCustomers.length === 0 ? (
            <p className="text-[11px] text-zinc-600">No customers yet.</p>
          ) : (
            <div className="space-y-2.5">
              {topCustomers.map((c) => (
                <div key={c.agentId} className="flex items-center gap-3 group">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 text-[10px] font-bold text-white">
                    {initials(c.displayName || c.agentId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white truncate" title={c.displayName || c.agentId}>
                        {c.displayName || 'Unknown Customer'}
                      </p>
                      <span className="font-mono text-xs font-semibold text-white shrink-0">{fmtBot(c.revenueBOT)} BOT</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.orgName && (
                        <span className="text-[10px] text-zinc-500">{c.orgName}</span>
                      )}
                      <span className="text-[10px] text-zinc-600">·</span>
                      <span className="text-[10px] text-zinc-600">{c.pct}%</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(c.agentId); }}
                        className="opacity-0 group-hover:opacity-100 text-[9px] text-zinc-600 hover:text-zinc-400 transition-opacity"
                        title={`Copy ${c.agentId}`}
                      >
                        <FiCopy size={9} />
                      </button>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1.5">
                      <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settlement Health + Recent Activity ─────────── */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">

        {/* Settlement Health */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Settlement Health</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Avg Time', value: fmtSettleTime(settlementHours), accent: 'text-white' },
              { label: 'Fastest', value: fmtSettleTime(fastest), accent: 'text-emerald-400' },
              { label: 'Slowest', value: fmtSettleTime(slowest), accent: 'text-amber-400' },
              { label: 'Pending Queue', value: `${analytics.pendingCount ?? 0}`, accent: (analytics.pendingCount ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400' }
            ].map((m, i) => (
              <div key={i} className="bg-zinc-950/50 border border-zinc-800/60 rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">{m.label}</p>
                <p className={`font-mono text-sm font-bold ${m.accent}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity (from paid invoices) */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Recent Activity</h3>
          {paidInvoices.length === 0 ? (
            <p className="text-[11px] text-zinc-600">No recent activity.</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {paidInvoices.slice(0, 8).map((inv) => {
                const ago = inv.paidAt || inv.createdAt;
                let timeAgo = '—';
                if (ago) {
                  const diff = Date.now() - new Date(ago).getTime();
                  if (diff < 60000) timeAgo = 'just now';
                  else if (diff < 3600000) timeAgo = `${Math.floor(diff / 60000)}m ago`;
                  else if (diff < 86400000) timeAgo = `${Math.floor(diff / 3600000)}h ago`;
                  else timeAgo = `${Math.floor(diff / 86400000)}d ago`;
                }
                return (
                  <div key={inv.invoiceId} className="flex items-center gap-2.5 py-1.5 border-b border-zinc-800/40 last:border-0">
                    <FiCheckCircle size={12} className="text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 truncate">Payment settled · {inv.serviceId}</p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-white shrink-0">{fmtBot(inv.amountBOT)} BOT</span>
                    <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer note ────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
        <FiTrendingUp size={11} /> Settlements follow the autonomous billing flow: session → usage → invoice → on-chain payment.
      </div>
    </div>
  );
};

export default DevMarketplaceRevenue;
