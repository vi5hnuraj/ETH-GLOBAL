import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiUsers, FiCpu, FiZap, FiGrid, FiShoppingBag, FiDollarSign, FiTrendingUp, FiAward,
  FiRefreshCw, FiActivity, FiGlobe, FiServer, FiDatabase, FiShield, FiAlertTriangle,
  FiBarChart2, FiArrowUpRight, FiArrowDownRight, FiChevronDown, FiWifi,
  FiCheckCircle, FiClock, FiTarget, FiBox, FiDownload, FiInfo, FiPackage,
  FiMonitor, FiSend, FiCheck, FiX
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════ */

const RANGES = [
  { label: 'Today', value: 'day', short: '24H', days: 1 },
  { label: '7 Days', value: 'week', short: '7D', days: 7 },
  { label: '30 Days', value: 'month', short: '30D', days: 30 },
  { label: '90 Days', value: 'quarter', short: '90D', days: 90 },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
const BAR_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c', '#a3e635'];

const ACTIVITY_ICONS = {
  install: { icon: FiDownload, color: 'text-blue-400' },
  publish: { icon: FiPackage, color: 'text-violet-400' },
  payment: { icon: FiDollarSign, color: 'text-emerald-400' },
  wallet: { icon: FiBox, color: 'text-cyan-400' },
  webhook: { icon: FiSend, color: 'text-amber-400' },
  info: { icon: FiActivity, color: 'text-zinc-500' },
};

const LEADERBOARD_TABS = ['Top Providers', 'Top Categories'];

const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtInt = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString();
};
const pct = (n) => `${fmt(n, 1)}%`;
const fmtBOT = (v) => `${Number(v ?? 0).toFixed(4)}`;

const timeAgo = (dateStr) => {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

/* ══════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ══════════════════════════════════════════════════════════════ */

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs min-w-[120px]">
      <p className="text-zinc-400 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke }} className="font-mono flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.stroke }} />
          {p.name}: {typeof p.value === 'number' ? (p.value > 100 ? fmtInt(p.value) : fmt(p.value, 4)) : p.value}
        </p>
      ))}
    </div>
  );
};

const Skeleton = ({ className = '' }) => <div className={`bg-zinc-800/40 rounded-xl animate-pulse ${className}`} />;

const SkeletonPage = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex items-center justify-between">
      <div><div className="h-8 w-64 bg-zinc-800 rounded mb-2" /><div className="h-4 w-96 bg-zinc-800/60 rounded" /></div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-zinc-900/60 rounded-xl border border-zinc-800/50" />)}
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-zinc-900/60 rounded-2xl border border-zinc-800/50" />)}
    </div>
    <div className="h-80 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
  </div>
);

const EmptyState = ({ title, description }) => (
  <div className="text-center py-12">
    <FiGlobe size={28} className="text-zinc-700 mx-auto mb-3" />
    <h3 className="text-sm font-semibold text-zinc-400 mb-1">{title}</h3>
    <p className="text-xs text-zinc-600 max-w-sm mx-auto">{description}</p>
  </div>
);

const Section = ({ title, subtitle, children, action, className = '' }) => (
  <section className={className}>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const KpiCard = ({ icon, label, value, accent, sub }) => (
  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 hover:border-zinc-700/60 transition-all">
    <div className="flex items-start justify-between mb-2">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
    </div>
    <p className="text-xl font-bold text-zinc-100 font-mono tracking-tight leading-tight">{value}</p>
    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">{label}</p>
    {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
  </div>
);

const InsightBadge = ({ severity, text }) => {
  const styles = {
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  const icons = { info: FiInfo, success: FiCheck, warning: FiAlertTriangle };
  const Icon = icons[severity] || FiInfo;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${styles[severity] || styles.info}`}>
      <Icon size={13} className="flex-shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
};

const MiniTable = ({ columns, data, maxRows = 8, emptyText = 'No data available' }) => (
  <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800/50">
            {columns.map(c => (
              <th key={c.key} className={`py-3 px-4 text-[10px] font-medium text-zinc-500 uppercase tracking-wider ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center py-8 text-zinc-600 text-sm">{emptyText}</td></tr>
          ) : data.slice(0, maxRows).map((row, idx) => (
            <tr key={idx} className={`border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors ${idx % 2 === 1 ? 'bg-zinc-900/20' : ''}`}>
              {columns.map(c => (
                <td key={c.key} className={`py-2.5 px-4 text-xs ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.render ? c.render(row[c.key], row) : <span className="text-zinc-300">{row[c.key] ?? '—'}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

const DevNetwork = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState('month');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [leaderTab, setLeaderTab] = useState(0);

  const selectedDays = RANGES.find(r => r.value === range)?.days || 30;

  /* ── All hooks (MUST be before any early returns) ── */
  const { data: analytics, loading: analyticsLoad, error: analyticsErr, refresh: analyticsRefresh, refreshing } = useApi({
    fetcher: () => developerApi.networkAnalytics()
  });
  const { data: timeline, loading: timelineLoad } = useApi({
    fetcher: () => developerApi.networkTimeline(selectedDays),
    deps: [selectedDays]
  });
  const { data: activity, loading: activityLoad } = useApi({
    fetcher: () => developerApi.networkActivity(20)
  });
  const { data: health, loading: healthLoad } = useApi({
    fetcher: () => developerApi.networkHealth()
  });
  const { data: leaderboard, loading: leaderboardLoad } = useApi({
    fetcher: () => developerApi.networkLeaderboard()
  });

  /* ── Auto refresh ── */
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      analyticsRefresh({ background: true });
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, analyticsRefresh]);

  /* ── Derived state ── */
  const a = analytics || {};
  const t = a.totals || {};
  const categories = a.topServiceCategories || [];
  const providerRevenue = a.providerRevenue || [];
  const growers = a.fastestGrowingProviders || [];
  const tl = timeline || {};
  const act = activity || [];
  const hp = health || [];
  const lb = leaderboard || {};

  const loading = (analyticsLoad && !analytics) || (timelineLoad && !timeline);
  const hasData = (t.organizations ?? 0) > 0 || (t.marketplaceTransactions ?? 0) > 0 || categories.length > 0;

  /* ── Insights (derived from real data) ── */
  const insights = useMemo(() => {
    const list = [];
    const totalRev = categories.reduce((s, c) => s + Number(c.amountBOT || 0), 0);
    const topCat = categories[0];
    if (topCat && totalRev > 0) {
      const share = ((Number(topCat.amountBOT) / totalRev) * 100).toFixed(0);
      list.push({ severity: 'info', text: `${topCat.category} generated ${share}% of network revenue (${fmtBOT(topCat.amountBOT)} BOT).` });
    }
    if (growers.length > 0 && Number(growers[0].growthPct) > 0) {
      list.push({ severity: 'success', text: `${growers[0].name} grew ${fmt(growers[0].growthPct, 1)}% this period.` });
    } else if (growers.length > 0 && Number(growers[0].growthPct) < 0) {
      list.push({ severity: 'warning', text: `${growers[0].name} declined ${fmt(Math.abs(growers[0].growthPct), 1)}% this period.` });
    }
    const txCount = t.marketplaceTransactions ?? 0;
    if (txCount > 0) list.push({ severity: 'info', text: `${fmtInt(txCount)} marketplace transactions processed.` });
    if (providerRevenue.length > 1) {
      const top = providerRevenue[0];
      const total = providerRevenue.reduce((s, p) => s + Number(p.revenueBOT || 0), 0);
      if (total > 0) {
        const share = ((Number(top.revenueBOT) / total) * 100).toFixed(0);
        list.push({ severity: 'info', text: `${top.name} generated ${share}% of provider revenue.` });
      }
    }
    if (list.length === 0) list.push({ severity: 'info', text: 'Network analytics will appear as organizations transact.' });
    return list;
  }, [categories, growers, t, providerRevenue]);

  /* ── KPI cards ── */
  const kpis = useMemo(() => [
    { icon: <FiUsers size={16} className="text-blue-400" />, label: 'Organizations', value: fmtInt(t.organizations ?? 0), accent: 'bg-blue-500/10' },
    { icon: <FiGrid size={16} className="text-emerald-400" />, label: 'Active Providers', value: fmtInt(t.activeProviders ?? 0), accent: 'bg-emerald-500/10' },
    { icon: <FiPackage size={16} className="text-violet-400" />, label: 'Published Agents', value: fmtInt(t.servicesPublished ?? 0), accent: 'bg-violet-500/10' },
    { icon: <FiShoppingBag size={16} className="text-cyan-400" />, label: 'Transactions', value: fmtInt(t.marketplaceTransactions ?? 0), accent: 'bg-cyan-500/10' },
    { icon: <FiDollarSign size={16} className="text-emerald-400" />, label: 'Settlement Vol', value: `${fmtBOT(t.settlementVolumeBOT)}`, accent: 'bg-emerald-500/10', sub: 'BOT settled' },
    { icon: <FiTrendingUp size={16} className="text-amber-400" />, label: 'Network Revenue', value: `${fmtBOT(t.networkRevenueBOT)}`, accent: 'bg-amber-500/10', sub: 'Fees accrued' },
    { icon: <FiZap size={16} className="text-pink-400" />, label: 'Active Agents', value: fmtInt(t.activeAgents ?? 0), accent: 'bg-pink-500/10' },
    { icon: <FiShield size={16} className="text-cyan-400" />, label: 'Provider Companies', value: fmtInt(t.providerCompanies ?? 0), accent: 'bg-cyan-500/10' },
  ], [t]);

  /* ── Timeline chart data ── */
  const chartData = useMemo(() => {
    return (tl.chart || []).map(c => ({
      date: c.date?.slice(5) || c.date,
      Transactions: c.transactions || 0,
      Revenue: c.revenue || 0,
      Settlements: c.settlements || 0,
    }));
  }, [tl.chart]);

  /* ── Revenue breakdown pie ── */
  const revenueBreakdown = useMemo(() => {
    return categories.map(c => ({
      name: c.category || 'Other',
      value: Number(c.amountBOT || 0),
    })).filter(c => c.value > 0);
  }, [categories]);

  /* ── Category bars ── */
  const categoryBars = useMemo(() => {
    const maxVal = Math.max(...categories.map(c => Number(c.amountBOT || 0)), 0);
    return categories.slice(0, 7).map((c, i) => ({
      ...c,
      pctBar: maxVal > 0 ? (Number(c.amountBOT || 0) / maxVal) * 100 : 0,
      color: BAR_COLORS[i % BAR_COLORS.length],
      shareOfTotal: categories.reduce((s, x) => s + Number(x.amountBOT || 0), 0) > 0
        ? ((Number(c.amountBOT || 0) / categories.reduce((s, x) => s + Number(x.amountBOT || 0), 0)) * 100).toFixed(1)
        : '0',
    }));
  }, [categories]);

  const handleRefresh = useCallback(() => {
    analyticsRefresh({ background: true });
    setLastUpdate(new Date());
  }, [analyticsRefresh]);

  /* ── Loading ── */
  if (loading) return <SkeletonPage />;

  /* ── Error ── */
  if (analyticsErr && !analytics) return (
    <div className="text-center py-20">
      <FiAlertTriangle size={32} className="text-red-400 mx-auto mb-4" />
      <p className="text-zinc-300 mb-2">Unable to load network analytics</p>
      <p className="text-sm text-zinc-500 mb-4">{analyticsErr.message}</p>
      <button onClick={() => analyticsRefresh()} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">Retry</button>
    </div>
  );

  if (!hasData) return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Network Intelligence</h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time insights into the GlobalPay AI economy.</p>
        </div>
      </header>
      <EmptyState title="No network activity yet" description="As organizations publish agents and transact, network analytics will appear here." />
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-8">
      {/* ── HEADER ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">Network Intelligence</h1>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">Real-time insights into the GlobalPay AI economy, providers, transactions, settlements, and network health.</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Updated {lastUpdate.toLocaleTimeString()} · Auto refresh {autoRefresh ? 'ON' : 'OFF'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-0.5">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${range === r.value ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {r.short}
              </button>
            ))}
          </div>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${autoRefresh ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}>
            <FiRefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} /> Auto
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-2 rounded-xl border border-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50">
            <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button className="p-2 rounded-xl border border-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Export">
            <FiDownload size={14} />
          </button>
        </div>
      </header>

      {/* ── ECONOMIC INSIGHTS ── */}
      {insights.length > 0 && (
        <Section title="Economic Insights" subtitle="AI-generated network intelligence">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.slice(0, 4).map((ins, i) => <InsightBadge key={i} severity={ins.severity} text={ins.text} />)}
          </div>
        </Section>
      )}

      {/* ── KPI CARDS (8) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* ── NETWORK ACTIVITY TIMELINE ── */}
      <Section title="Network Activity Timeline" subtitle={`Daily transactions, revenue, and settlements over ${selectedDays} days`}>
        <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradTx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="Transactions" stroke="#3b82f6" strokeWidth={2} fill="url(#gradTx)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={2} fill="url(#gradRev)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-zinc-600">
              {timelineLoad ? <Skeleton className="h-4 w-32" /> : 'No timeline data'}
            </div>
          )}
        </div>
        {/* Summary row */}
        <div className="flex items-center gap-6 mt-3 text-xs text-zinc-500 flex-wrap">
          <span>Period Total: <span className="text-zinc-300 font-mono">{fmtInt(tl.totalTransactions)}</span> transactions</span>
          <span>Revenue: <span className="text-emerald-400 font-mono">{fmtBOT(tl.totalRevenue)} BOT</span></span>
          <span>Invocations: <span className="text-zinc-300 font-mono">{fmtInt(tl.totalInvocations)}</span></span>
        </div>
      </Section>

      {/* ── TOP CATEGORIES + REVENUE BREAKDOWN ── */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <Section title="Top Service Categories" subtitle="Revenue by category">
          {categoryBars.length === 0 ? (
            <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-8 text-center text-sm text-zinc-600">No category data yet</div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
              <div className="space-y-3">
                {categoryBars.map((c) => (
                  <div key={c.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-medium">{c.category}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 font-mono">{fmtInt(c.transactions)} tx</span>
                        <span className="text-zinc-400 font-mono">{fmtBOT(c.amountBOT)} BOT</span>
                        <span className="text-zinc-600 w-10 text-right">{c.shareOfTotal}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${c.pctBar}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Revenue Breakdown" subtitle="By service category">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {revenueBreakdown.length > 0 ? (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenueBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={0}>
                        {revenueBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                        <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs">
                          <p className="text-zinc-300 font-medium">{payload[0].name}</p>
                          <p className="text-white font-mono">{fmt(payload[0].value, 4)} BOT</p>
                        </div>
                      ) : null} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-1">
                  {revenueBreakdown.map((c, i) => {
                    const total = revenueBreakdown.reduce((s, x) => s + x.value, 0);
                    const p = total > 0 ? ((c.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div key={c.name} className="flex items-center gap-2 text-[11px]">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-zinc-400 flex-1 truncate">{c.name}</span>
                        <span className="text-zinc-300 font-mono">{fmt(c.value, 4)}</span>
                        <span className="text-zinc-600 w-10 text-right">{p}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState title="No revenue yet" description="Revenue appears as services are transacted." />
            )}
          </div>
        </Section>
      </div>

      {/* ── TOP PROVIDERS + FASTEST GROWING ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Top Providers" subtitle="Ranked by revenue">
          <MiniTable
            columns={[
              { key: 'name', label: 'Provider', render: (v, row) => (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-mono">{(row.providerAgentId || '?').slice(-2)}</div>
                  <div>
                    <p className="text-zinc-200 font-medium truncate max-w-[160px]">{v || row.providerAgentId}</p>
                    <p className="text-[9px] text-zinc-600 font-mono truncate max-w-[160px]">{row.providerAgentId}</p>
                  </div>
                </div>
              )},
              { key: 'revenueBOT', label: 'Revenue', align: 'right', render: v => <span className="text-emerald-400 font-mono font-semibold">{fmtBOT(v)} BOT</span> },
            ]}
            data={providerRevenue}
            maxRows={6}
            emptyText="No provider revenue yet"
          />
        </Section>

        <Section title="Fastest Growing" subtitle="Month-over-month revenue growth">
          <MiniTable
            columns={[
              { key: 'name', label: 'Provider', render: (v) => <span className="text-zinc-200 font-medium truncate block max-w-[140px]">{v || '—'}</span> },
              { key: 'currentBOT', label: 'Current', align: 'right', render: v => <span className="font-mono text-xs text-zinc-300">{fmtBOT(v)}</span> },
              { key: 'previousBOT', label: 'Previous', align: 'right', render: v => <span className="font-mono text-xs text-zinc-500">{fmtBOT(v)}</span> },
              { key: 'growthPct', label: 'Growth', align: 'right', render: v => {
                const num = Number(v);
                const positive = num >= 0;
                const isNew = Number(v) === 100 && Number(arguments[1]?.previousBOT) === 0;
                return (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isNew ? 'bg-blue-500/10 text-blue-400' : positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {isNew ? 'New' : <>{positive ? <FiArrowUpRight size={9} /> : <FiArrowDownRight size={9} />}{positive ? '+' : ''}{fmt(v, 1)}%</>}
                  </span>
                );
              }},
            ]}
            data={growers}
            maxRows={6}
            emptyText="No growth data yet"
          />
        </Section>
      </div>

      {/* ── NETWORK HEALTH ── */}
      <Section title="Network Health" subtitle="Infrastructure status">
        <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
          {healthLoad && hp.length === 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : hp.length === 0 ? (
            <EmptyState title="No health data" description="Infrastructure status will appear once the system is operational." />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {hp.map(h => (
                <div key={h.name} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-zinc-800/15">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${h.status === 'healthy' ? 'bg-emerald-400' : h.status === 'warning' ? 'bg-amber-400' : h.status === 'idle' ? 'bg-zinc-500' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300">{h.name}</p>
                    <p className="text-[9px] text-zinc-600">{h.latencyMs}ms latency · {h.uptime} uptime</p>
                  </div>
                  <span className={`text-[9px] uppercase font-medium ${h.status === 'healthy' ? 'text-emerald-400' : h.status === 'warning' ? 'text-amber-400' : h.status === 'idle' ? 'text-zinc-500' : 'text-red-400'}`}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── LIVE ACTIVITY + LEADERBOARD ── */}
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <Section title="Live Activity Feed" subtitle="Latest network events">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {activityLoad && act.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : act.length === 0 ? (
              <EmptyState title="No activity yet" description="Events will appear as organizations transact." />
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {act.map((item, i) => {
                  const ai = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.info;
                  const Icon = ai.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 relative">
                      {i < act.length - 1 && <div className="absolute left-[9px] top-6 w-px h-full bg-zinc-800" />}
                      <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon size={10} className={ai.color} />
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <p className="text-xs text-zinc-300">{item.text}</p>
                        <p className="text-[10px] text-zinc-600">{timeAgo(item.time)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Section>

        <Section title="Network Leaderboard" subtitle="Top performers">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            <div className="flex gap-1 bg-zinc-800/30 rounded-lg p-0.5 mb-4">
              {LEADERBOARD_TABS.map((tab, i) => (
                <button key={tab} onClick={() => setLeaderTab(i)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all ${leaderTab === i ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {tab}
                </button>
              ))}
            </div>
            {leaderTab === 0 && (
              <div className="space-y-2">
                {(lb.topProviders || []).length === 0 ? (
                  <EmptyState title="No provider data" description="Provider rankings appear as revenue accumulates." />
                ) : (lb.topProviders || []).slice(0, 8).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b border-zinc-800/20 last:border-0">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-mono font-bold">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 font-medium truncate">{p.name || p.id}</p>
                      <p className="text-[9px] text-zinc-600">{fmtInt(p.transactions)} transactions</p>
                    </div>
                    <span className="text-xs text-emerald-400 font-mono font-semibold">{fmtBOT(p.revenueBOT)} BOT</span>
                  </div>
                ))}
              </div>
            )}
            {leaderTab === 1 && (
              <div className="space-y-2">
                {(lb.topCategories || []).length === 0 ? (
                  <EmptyState title="No category data" description="Category rankings appear as revenue accumulates." />
                ) : (lb.topCategories || []).slice(0, 8).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3 py-2 border-b border-zinc-800/20 last:border-0">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-mono font-bold">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 font-medium truncate">{c.name}</p>
                      <p className="text-[9px] text-zinc-600">{fmtInt(c.transactions)} transactions</p>
                    </div>
                    <span className="text-xs text-violet-400 font-mono font-semibold">{fmtBOT(c.revenueBOT)} BOT</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ── FOOTER SUMMARY ── */}
      <footer className="bg-zinc-900/30 border border-zinc-800/20 rounded-2xl p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 text-center">
          {[
            { label: 'Organizations', value: fmtInt(t.organizations ?? 0) },
            { label: 'Providers', value: fmtInt(t.activeProviders ?? 0) },
            { label: 'Revenue', value: `${fmtBOT(t.networkRevenueBOT)}` },
            { label: 'Transactions', value: fmtInt(t.marketplaceTransactions ?? 0) },
            { label: 'Uptime', value: hp.find(h => h.name === 'API Gateway')?.uptime || '—' },
            { label: 'Agents', value: fmtInt(t.servicesPublished ?? 0) },
            { label: 'Settlements', value: fmtBOT(t.settlementVolumeBOT) },
            { label: 'Active Agents', value: fmtInt(t.activeAgents ?? 0) },
          ].map(s => (
            <div key={s.label}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-sm font-bold text-zinc-100 font-mono">{s.value}</p>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default DevNetwork;
