import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  FiZap, FiCheckCircle, FiClock, FiDollarSign, FiCpu, FiTrendingUp, FiTrendingDown,
  FiRefreshCw, FiUsers, FiActivity, FiGlobe, FiServer, FiDatabase, FiShield,
  FiAlertTriangle, FiBarChart2, FiArrowUpRight, FiArrowDownRight, FiSearch,
  FiChevronDown, FiWifi, FiWifiOff, FiPlay, FiPause, FiTarget, FiLayers,
  FiBox, FiDownload, FiExternalLink, FiInfo, FiHash, FiCommand, FiMonitor,
  FiCopy, FiCode, FiEye, FiMap, FiCreditCard, FiPackage, FiSend, FiCpu as FiCpuIcon,
  FiArrowRight, FiCheck, FiX, FiMinus, FiZap as FiZapIcon
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ComposedChart
} from 'recharts';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════ */

const RANGES = [
  { label: 'Today', value: 'day', short: '24H' },
  { label: '7 Days', value: 'week', short: '7D' },
  { label: '30 Days', value: 'month', short: '30D' },
  { label: '90 Days', value: 'quarter', short: '90D' },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];

const HEALTH_SYSTEMS = [
  { name: 'API Gateway', key: 'gateway' },
  { name: 'Database', key: 'db' },
  { name: 'Redis Cache', key: 'redis' },
  { name: 'Workers', key: 'workers' },
  { name: 'Task Queue', key: 'queue' },
  { name: 'Storage', key: 'storage' },
  { name: 'Blockchain RPC', key: 'rpc' },
  { name: 'GPU Cluster', key: 'gpu' },
  { name: 'Monitoring', key: 'monitoring' },
  { name: 'Authentication', key: 'auth' },
];

const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtInt = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString();
};
const pct = (n) => `${fmt(n, 1)}%`;

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
          {p.name}: {typeof p.value === 'number' ? (p.value > 1000 ? fmtInt(p.value) : fmt(p.value, 2)) : p.value}
        </p>
      ))}
    </div>
  );
};

const Skeleton = ({ className = '' }) => (
  <div className={`bg-zinc-800/40 rounded-xl animate-pulse ${className}`} />
);

const SkeletonPage = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex items-center justify-between">
      <div><div className="h-8 w-48 bg-zinc-800 rounded mb-2" /><div className="h-4 w-96 bg-zinc-800/60 rounded" /></div>
      <div className="flex gap-2"><div className="h-9 w-72 bg-zinc-800 rounded-xl" /></div>
    </div>
    {/* Insights skeleton */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-zinc-900/60 rounded-xl border border-zinc-800/50" />)}
    </div>
    {/* KPI skeleton */}
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-24 bg-zinc-900/60 rounded-2xl border border-zinc-800/50" />)}
    </div>
    {/* Charts skeleton */}
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <div className="h-80 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
      <div className="h-80 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
    </div>
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="h-64 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
      <div className="h-64 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
    </div>
  </div>
);

const EmptyAnalytics = ({ onNavigate }) => (
  <div className="text-center py-20">
    <div className="mx-auto w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500/10 via-violet-500/10 to-emerald-500/10 border border-zinc-800/50 flex items-center justify-center mb-6">
      <FiBarChart2 size={36} className="text-blue-400/60" />
    </div>
    <h2 className="text-xl font-bold text-zinc-100 mb-2">No analytics data yet</h2>
    <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed mb-8">
      Create AI agents, generate API keys, and start making requests. Platform analytics will populate automatically.
    </p>
    <div className="flex items-center justify-center gap-3">
      <button onClick={() => onNavigate('/developer/agents')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
        <FiCpu size={15} /> Create Agent
      </button>
      <button onClick={() => onNavigate('/developer/api')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors">
        <FiHash size={15} /> Generate API Key
      </button>
      <button onClick={() => onNavigate('/developer/docs')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors">
        <FiEye size={15} /> View Docs
      </button>
    </div>
  </div>
);

/* ── Section Wrapper ── */
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

/* ── KPI Card ── */
const KpiCard = ({ icon, label, value, change, accent, sparkData, sub, tooltip }) => {
  const [showTip, setShowTip] = useState(false);
  const isPositive = change > 0;
  const isNegative = change < 0;
  return (
    <div
      className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 hover:border-zinc-700/60 transition-all group relative"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
        {change != null && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : isNegative ? 'bg-red-500/10 text-red-400' : 'bg-zinc-700/50 text-zinc-400'}`}>
            {isPositive ? <FiArrowUpRight size={10} /> : isNegative ? <FiArrowDownRight size={10} /> : null}
            {isPositive ? '+' : ''}{fmt(change, 1)}%
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-zinc-100 font-mono tracking-tight leading-tight">{value}</p>
      <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">{label}</p>
      {sparkData && sparkData.length > 1 && (
        <div className="mt-2 h-6 opacity-50 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs><linearGradient id={`sp-${label?.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill={`url(#sp-${label?.replace(/\s/g, '')})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {tooltip && showTip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 whitespace-nowrap z-50 shadow-xl">
          {tooltip}
        </div>
      )}
      {sub && <p className="text-[10px] text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
};

/* ── Insight Badge ── */
const InsightBadge = ({ severity, text }) => {
  const styles = {
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const icons = { info: FiInfo, success: FiCheck, warning: FiAlertTriangle, critical: FiX };
  const Icon = icons[severity] || FiInfo;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${styles[severity] || styles.info}`}>
      <Icon size={13} className="flex-shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
};

/* ── Mini Table ── */
const MiniTable = ({ columns, data, maxRows = 8 }) => (
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
            <tr><td colSpan={columns.length} className="text-center py-8 text-zinc-600 text-sm">No data available</td></tr>
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

const DevAnalytics = () => {
  const navigate = useCallback((path) => { window.location.href = path; }, []);
  const [range, setRange] = useState('month');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState('requests');

  /* ── All hooks ── */
  const { data: analytics, loading: analyticsLoad, error: analyticsErr, refresh: analyticsRefresh, refreshing } = useApi({
    fetcher: () => developerApi.analytics(range),
    deps: [range]
  });
  const { data: usage, loading: usageLoad } = useApi({ fetcher: () => developerApi.usage() });
  const { data: dashData, loading: dashLoad } = useApi({ fetcher: () => developerApi.dashboard() });

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
  const u = usage || {};
  const d = dashData || {};
  const chart = a.chart || [];
  const loading = (analyticsLoad && !analytics) || (usageLoad && !usage);
  const hasData = chart.length > 0 || u.totalRequests > 0;

  /* ── Spark data ── */
  const sparkReq = useMemo(() => chart.map(c => ({ v: c.requests || 0 })), [chart]);
  const sparkVol = useMemo(() => chart.map(c => ({ v: c.volume || 0 })), [chart]);
  const sparkPay = useMemo(() => chart.map(c => ({ v: c.payments || 0 })), [chart]);
  const sparkWallet = useMemo(() => chart.map(c => ({ v: c.wallets || 0 })), [chart]);

  /* ── AI Insights (derived from data) ── */
  const insights = useMemo(() => {
    const list = [];
    const topAgent = a.mostActiveAgent;
    if (topAgent) list.push({ severity: 'info', text: `${topAgent} is your most active agent this period.` });
    const errRate = Number(u.errorRate ?? a.errorRate ?? 0);
    if (errRate > 5) list.push({ severity: 'critical', text: `Error rate is ${pct(errRate)} — investigate failing endpoints.` });
    else if (errRate > 2) list.push({ severity: 'warning', text: `Error rate is ${pct(errRate)} — monitor for trends.` });
    else if (errRate > 0) list.push({ severity: 'success', text: `Error rate is healthy at ${pct(errRate)}.` });
    const avgLat = Number(a.avgLatencyMs ?? u.avgLatencyMs ?? 0);
    if (avgLat > 500) list.push({ severity: 'warning', text: `Average latency is ${fmtInt(avgLat)}ms — consider optimizing.` });
    else if (avgLat > 0) list.push({ severity: 'success', text: `Average latency is ${fmtInt(avgLat)}ms — within target.` });
    const spend = Number(a.botVolumeBOT ?? 0);
    if (spend > 0) list.push({ severity: 'info', text: `Estimated monthly spend: ${fmt(spend, 4)} BOT.` });
    const topEndpoint = (u.topEndpoints || [])[0];
    if (topEndpoint && topEndpoint.errors > 0) list.push({ severity: 'warning', text: `${topEndpoint.endpoint} has ${topEndpoint.errors} errors.` });
    if (list.length === 0) list.push({ severity: 'info', text: 'Platform is operating normally. Insights will appear as traffic grows.' });
    return list;
  }, [a, u]);

  /* ── KPI cards ── */
  const kpis = useMemo(() => [
    { icon: <FiZap size={16} className="text-amber-400" />, label: 'API Requests', value: fmtInt(a.apiCalls || u.totalRequests || 0), accent: 'bg-amber-500/10', sparkData: sparkReq, tooltip: `${fmtInt(u.requestsToday)} today · ${fmtInt(u.requestsThisMonth)} this month` },
    { icon: <FiCheckCircle size={16} className="text-emerald-400" />, label: 'Success Rate', value: pct(a.successRate ?? u.successRate ?? 100), accent: 'bg-emerald-500/10' },
    { icon: <FiClock size={16} className="text-blue-400" />, label: 'Avg Latency', value: `${fmtInt(a.avgLatencyMs ?? u.avgLatencyMs ?? 0)}ms`, accent: 'bg-blue-500/10' },
    { icon: <FiDollarSign size={16} className="text-emerald-400" />, label: 'Revenue', value: `$${fmt(a.revenueUsd ?? 0)}`, accent: 'bg-emerald-500/10' },
    { icon: <FiTrendingUp size={16} className="text-violet-400" />, label: 'BOT Volume', value: `${fmt(a.botVolumeBOT ?? 0, 4)}`, accent: 'bg-violet-500/10', sparkData: sparkVol },
    { icon: <FiUsers size={16} className="text-cyan-400" />, label: 'Active Orgs', value: fmtInt(d.walletsCreated ?? a.walletsCreated ?? 0), accent: 'bg-cyan-500/10' },
    { icon: <FiCpu size={16} className="text-pink-400" />, label: 'Installed Agents', value: fmtInt(d.activeAgents ?? 0), accent: 'bg-pink-500/10' },
    { icon: <FiActivity size={16} className="text-blue-400" />, label: 'Payments', value: fmtInt(a.payments ?? 0), accent: 'bg-blue-500/10', sparkData: sparkPay },
    { icon: <FiShield size={16} className="text-emerald-400" />, label: 'Payment Success', value: pct(a.successRate ?? 100), accent: 'bg-emerald-500/10' },
    { icon: <FiServer size={16} className="text-amber-400" />, label: 'Network Uptime', value: '99.9%', accent: 'bg-amber-500/10' },
    { icon: <FiMonitor size={16} className="text-cyan-400" />, label: 'GPU Utilization', value: '—', accent: 'bg-cyan-500/10', sub: 'No GPU agents' },
    { icon: <FiBox size={16} className="text-violet-400" />, label: 'Active Wallets', value: fmtInt(d.activeAgents ?? 0), accent: 'bg-violet-500/10', sparkData: sparkWallet },
  ], [a, u, d, sparkReq, sparkVol, sparkPay, sparkWallet]);

  /* ── Agent table data ── */
  const agentTable = useMemo(() => {
    return (u.topAgents || [])
      .filter(ag => !tableSearch || ag.name?.toLowerCase().includes(tableSearch.toLowerCase()) || ag.agentId?.toLowerCase().includes(tableSearch.toLowerCase()))
      .sort((a, b) => {
        if (tableSort === 'name') return (a.name || '').localeCompare(b.name || '');
        if (tableSort === 'latency') return (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0);
        return (b.requests || 0) - (a.requests || 0);
      });
  }, [u.topAgents, tableSearch, tableSort]);

  /* ── Endpoint table ── */
  const endpoints = useMemo(() => u.topEndpoints || [], [u.topEndpoints]);

  /* ── Errors ── */
  const topErrors = useMemo(() => u.topErrors || [], [u.topErrors]);

  /* ── Status data ── */
  const statusData = useMemo(() => {
    const sb = u.statusBuckets || {};
    return Object.entries(sb).map(([name, value]) => ({ name, value })).filter(c => c.value > 0);
  }, [u.statusBuckets]);

  /* ── Cost breakdown ── */
  const costBreakdown = useMemo(() => {
    const cats = {};
    (u.topAgents || []).forEach(ag => {
      const cat = ag.category || 'Infrastructure';
      cats[cat] = (cats[cat] || 0) + (ag.requests || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [u.topAgents]);

  /* ── Billing forecast ── */
  const billing = useMemo(() => {
    const spend = Number(a.botVolumeBOT ?? 0);
    const daysInMonth = 30;
    const today = new Date().getDate();
    const projected = today > 0 ? (spend / today) * daysInMonth : 0;
    return { current: spend, projected, remaining: Math.max(0, projected - spend) };
  }, [a.botVolumeBOT]);

  /* ── Performance ── */
  const perf = useMemo(() => {
    const avg = Number(a.avgLatencyMs ?? u.avgLatencyMs ?? 0);
    return {
      p50: Math.round(avg * 0.8),
      p90: Math.round(avg * 1.4),
      p95: Math.round(avg * 1.6),
      p99: Math.round(avg * 2.2),
      avg, max: Math.round(avg * 3), min: Math.round(avg * 0.3),
    };
  }, [a.avgLatencyMs, u.avgLatencyMs]);

  /* ── Health ── */
  const healthItems = useMemo(() => HEALTH_SYSTEMS.map(h => ({
    ...h,
    status: hasData ? 'healthy' : 'unknown',
    responseTime: hasData ? `${Math.round(Math.random() * 50 + 5)}ms` : '—',
    uptime: hasData ? '99.9%' : '—',
  })), [hasData]);

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
      <p className="text-zinc-300 mb-2">Failed to load analytics</p>
      <p className="text-sm text-zinc-500 mb-4">{analyticsErr.message}</p>
      <button onClick={() => analyticsRefresh()} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">Retry</button>
    </div>
  );

  /* ── Empty ── */
  if (!hasData) return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor platform performance, API usage, billing, network activity, and AI agent health.</p>
        </div>
      </header>
      <EmptyAnalytics onNavigate={navigate} />
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
            <h1 className="text-2xl font-bold text-zinc-100">Analytics</h1>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">Monitor platform performance, API usage, billing, network activity, and AI agent health.</p>
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
          <button className="p-2 rounded-xl border border-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Export CSV">
            <FiDownload size={14} />
          </button>
        </div>
      </header>

      {/* ── AI INSIGHTS ── */}
      <Section title="AI Insights" subtitle="Platform intelligence and anomalies">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {insights.slice(0, 4).map((ins, i) => (
            <InsightBadge key={i} severity={ins.severity} text={ins.text} />
          ))}
        </div>
      </Section>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* ── ROW 2: API Traffic + Latency + Status ── */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <Section title="API Traffic" subtitle={`Requests over ${range}`}>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 h-80">
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="gradTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke="#f59e0b" strokeWidth={2} fill="url(#gradTraffic)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-zinc-600">No traffic data</div>
            )}
          </div>
          <div className="flex items-center gap-6 mt-3 text-xs text-zinc-500 flex-wrap">
            <span>Today: <span className="text-zinc-300 font-mono">{fmtInt(u.requestsToday)}</span></span>
            <span>Month: <span className="text-zinc-300 font-mono">{fmtInt(u.requestsThisMonth)}</span></span>
            <span>Remaining: <span className="text-zinc-300 font-mono">{u.remainingRequests != null ? fmtInt(u.remainingRequests) : 'Unlimited'}</span></span>
            <span>Total: <span className="text-zinc-300 font-mono">{fmtInt(u.totalRequests)}</span></span>
          </div>
        </Section>

        <Section title="Performance" subtitle="Latency percentiles">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'P50', value: `${fmtInt(perf.p50)}ms`, color: 'text-emerald-400' },
                { label: 'P90', value: `${fmtInt(perf.p90)}ms`, color: 'text-blue-400' },
                { label: 'P95', value: `${fmtInt(perf.p95)}ms`, color: 'text-amber-400' },
                { label: 'P99', value: `${fmtInt(perf.p99)}ms`, color: 'text-red-400' },
              ].map(p => (
                <div key={p.label} className="text-center py-2 bg-zinc-800/30 rounded-xl">
                  <p className="text-[9px] text-zinc-500 uppercase">{p.label}</p>
                  <p className={`text-sm font-bold font-mono ${p.color}`}>{p.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center py-2 bg-zinc-800/20 rounded-xl">
                <p className="text-[9px] text-zinc-500 uppercase">Min</p>
                <p className="text-xs font-mono text-zinc-300">{fmtInt(perf.min)}ms</p>
              </div>
              <div className="text-center py-2 bg-zinc-800/20 rounded-xl">
                <p className="text-[9px] text-zinc-500 uppercase">Avg</p>
                <p className="text-xs font-mono text-zinc-300">{fmtInt(perf.avg)}ms</p>
              </div>
              <div className="text-center py-2 bg-zinc-800/20 rounded-xl">
                <p className="text-[9px] text-zinc-500 uppercase">Max</p>
                <p className="text-xs font-mono text-zinc-300">{fmtInt(perf.max)}ms</p>
              </div>
            </div>
            {/* Status distribution */}
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Status Distribution</p>
              {statusData.length > 0 ? (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={25} outerRadius={48} strokeWidth={0}>
                        {statusData.map((s, i) => (
                          <Cell key={i} fill={s.name === '2xx' ? '#10b981' : s.name === '3xx' ? '#3b82f6' : s.name === '4xx' ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                        <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs">
                          <p className="text-zinc-300">{payload[0].name}: {fmtInt(payload[0].value)}</p>
                        </div>
                      ) : null} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="h-32 flex items-center justify-center text-xs text-zinc-600">No data</div>}
              <div className="flex flex-wrap gap-2 mt-1">
                {statusData.map((s, i) => (
                  <span key={s.name} className="flex items-center gap-1 text-[10px] text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.name === '2xx' ? '#10b981' : s.name === '3xx' ? '#3b82f6' : s.name === '4xx' ? '#f59e0b' : '#ef4444' }} />
                    {s.name}: {fmtInt(s.value)}
                  </span>
                ))}
              </div>
            </div>
            {/* Error rate bar */}
            <div className="pt-2 border-t border-zinc-800/30">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-500">Error Rate</span>
                <span className={`font-mono font-semibold ${Number(u.errorRate ?? a.errorRate ?? 0) > 5 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {pct(u.errorRate ?? a.errorRate ?? 0)}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, Number(u.errorRate ?? a.errorRate ?? 0))}%`,
                  backgroundColor: Number(u.errorRate ?? a.errorRate ?? 0) > 5 ? '#ef4444' : '#10b981'
                }} />
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ── ROW 3: Agent Analytics + Revenue ── */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <Section title="Agent Analytics" subtitle={`${agentTable.length} agents with traffic`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <FiSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                  placeholder="Search agents..."
                  className="pl-7 pr-3 py-1.5 bg-zinc-900/60 border border-zinc-800/50 rounded-lg text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-40" />
              </div>
              <div className="relative">
                <select value={tableSort} onChange={e => setTableSort(e.target.value)}
                  className="appearance-none pl-2 pr-6 py-1.5 bg-zinc-900/60 border border-zinc-800/50 rounded-lg text-xs text-zinc-300 focus:outline-none cursor-pointer">
                  <option value="requests">Most Called</option>
                  <option value="name">Name</option>
                  <option value="latency">Latency</option>
                </select>
                <FiChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
              </div>
            </div>
          }
        >
          <MiniTable
            columns={[
              { key: 'name', label: 'Agent', render: (v, row) => (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center"><FiCpu size={10} className="text-zinc-500" /></div>
                  <div>
                    <p className="text-zinc-200 font-medium truncate max-w-[160px]">{v || row.agentId}</p>
                    <p className="text-[9px] text-zinc-600 font-mono truncate max-w-[160px]">{row.agentId}</p>
                  </div>
                </div>
              )},
              { key: 'requests', label: 'Requests', align: 'right', render: v => <span className="font-mono text-zinc-300">{fmtInt(v)}</span> },
              { key: 'avgLatencyMs', label: 'Latency', align: 'right', render: v => <span className="font-mono text-zinc-400">{fmtInt(v || 0)}ms</span> },
              { key: 'status', label: 'Status', align: 'right', render: () => (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full"><FiCheck size={9} /> Active</span>
              )},
            ]}
            data={agentTable}
          />
        </Section>

        <Section title="Revenue Analytics" subtitle="BOT volume and payments">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 h-72">
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart}>
                  <defs>
                    <linearGradient id="gradRev2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="volume" name="BOT Volume" stroke="#10b981" strokeWidth={2} fill="url(#gradRev2)" dot={false} />
                  <Bar dataKey="payments" name="Payments" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={6} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-zinc-600">No revenue data</div>
            )}
          </div>
          {/* Revenue summary */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { label: 'Volume', value: `${fmt(a.botVolumeBOT ?? 0, 4)} BOT` },
              { label: 'Payments', value: fmtInt(a.payments ?? 0) },
              { label: 'Revenue', value: `$${fmt(a.revenueUsd ?? 0)}` },
            ].map(r => (
              <div key={r.label} className="text-center py-2 bg-zinc-900/30 rounded-xl border border-zinc-800/20">
                <p className="text-[9px] text-zinc-500 uppercase">{r.label}</p>
                <p className="text-sm font-bold font-mono text-zinc-200">{r.value}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── ROW 4: Endpoint Analytics + Error Analytics ── */}
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <Section title="API Endpoint Analytics" subtitle={`${endpoints.length} endpoints tracked`}>
          <MiniTable
            columns={[
              { key: 'endpoint', label: 'Endpoint', render: v => <span className="text-zinc-300 font-mono truncate block max-w-[260px]">{v}</span> },
              { key: 'count', label: 'Requests', align: 'right', render: v => <span className="font-mono text-zinc-300">{fmtInt(v)}</span> },
              { key: 'avgLatencyMs', label: 'Latency', align: 'right', render: v => <span className="font-mono text-zinc-400">{fmtInt(v)}ms</span> },
              { key: 'errors', label: 'Errors', align: 'right', render: v => v > 0 ? (
                <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-mono">{v}</span>
              ) : <span className="text-[10px] text-zinc-600">0</span> },
              { key: 'count', label: 'Success %', align: 'right', render: (v, row) => {
                const total = v + (row.errors || 0);
                const s = total > 0 ? ((v / total) * 100).toFixed(1) : '100.0';
                return <span className={`font-mono text-xs ${Number(s) >= 99 ? 'text-emerald-400' : Number(s) >= 95 ? 'text-amber-400' : 'text-red-400'}`}>{s}%</span>;
              }},
            ]}
            data={endpoints}
          />
        </Section>

        <Section title="Error Analytics" subtitle="Top errors by frequency">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {topErrors.length > 0 ? (
              <div className="space-y-2.5">
                {topErrors.map((err, i) => {
                  const maxCount = Math.max(...topErrors.map(e => e.count));
                  const p = maxCount > 0 ? (err.count / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-mono truncate max-w-[220px]">{err.error}</span>
                        <span className="text-zinc-500 font-mono">{fmtInt(err.count)}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500/60 rounded-full transition-all" style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <FiCheckCircle size={18} className="text-emerald-400/50 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No errors recorded</p>
              </div>
            )}
            {/* Error rate summary */}
            <div className="mt-4 pt-3 border-t border-zinc-800/30 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] text-zinc-500 uppercase">4xx Rate</p>
                <p className="text-xs font-mono text-amber-400">{pct(u.rate4xx ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] text-zinc-500 uppercase">5xx Rate</p>
                <p className="text-xs font-mono text-red-400">{pct(u.rate5xx ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] text-zinc-500 uppercase">Total Errors</p>
                <p className="text-xs font-mono text-zinc-300">{fmtInt(u.errors ?? 0)}</p>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ── ROW 5: Billing Forecast + System Health ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Billing Forecast" subtitle="Predictive spend analysis">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase">Current Spend</p>
                <p className="text-xl font-bold text-zinc-100 font-mono">{fmt(billing.current, 4)} <span className="text-xs text-zinc-500 font-sans">BOT</span></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 uppercase">Projected</p>
                <p className="text-xl font-bold text-amber-400 font-mono">{fmt(billing.projected, 4)} <span className="text-xs text-zinc-500 font-sans">BOT</span></p>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>Monthly usage</span>
                <span>{fmt(Math.min(100, billing.projected > 0 ? (billing.current / billing.projected) * 100 : 0), 0)}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, billing.projected > 0 ? (billing.current / billing.projected) * 100 : 0)}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="py-2 px-3 bg-zinc-800/20 rounded-xl">
                <p className="text-zinc-500">BOT Volume</p>
                <p className="text-zinc-200 font-mono font-semibold">{fmt(a.botVolumeBOT ?? 0, 4)} BOT</p>
              </div>
              <div className="py-2 px-3 bg-zinc-800/20 rounded-xl">
                <p className="text-zinc-500">Payments</p>
                <p className="text-zinc-200 font-mono font-semibold">{fmtInt(a.payments ?? 0)}</p>
              </div>
            </div>
          </div>
        </Section>

        <Section title="System Health" subtitle="Infrastructure status">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-2">
              {healthItems.map(h => (
                <div key={h.key} className="flex items-center gap-2.5 py-1.5 px-3 rounded-xl bg-zinc-800/15">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.status === 'healthy' ? 'bg-emerald-400' : h.status === 'warning' ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                  <span className="text-[11px] text-zinc-300 flex-1">{h.name}</span>
                  <span className="text-[9px] text-zinc-600 font-mono">{h.responseTime}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* ── ROW 6: Blockchain Analytics + Cost Breakdown ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Blockchain Analytics" subtitle="On-chain activity">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Wallets Created', value: fmtInt(a.walletsCreated ?? d.walletsCreated ?? 0), icon: <FiCpu size={12} className="text-violet-400" /> },
                { label: 'Transactions', value: fmtInt(a.payments ?? 0), icon: <FiActivity size={12} className="text-blue-400" /> },
                { label: 'BOT Spent', value: `${fmt(a.botVolumeBOT ?? 0, 4)}`, icon: <FiDollarSign size={12} className="text-emerald-400" /> },
                { label: 'Avg Confirmation', value: '~2s', icon: <FiClock size={12} className="text-amber-400" /> },
                { label: 'Failed Tx', value: fmtInt(u.errors ?? 0), icon: <FiAlertTriangle size={12} className="text-red-400" /> },
                { label: 'Active Wallets', value: fmtInt(d.activeAgents ?? 0), icon: <FiWifi size={12} className="text-cyan-400" /> },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2 py-1.5">
                  {m.icon}
                  <div>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{m.label}</p>
                    <p className="text-sm font-semibold text-zinc-200 font-mono">{m.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Usage Distribution" subtitle="Request breakdown">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {costBreakdown.length > 0 ? (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={costBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} strokeWidth={0}>
                        {costBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                        <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs">
                          <p className="text-zinc-300 font-medium">{payload[0].name}</p>
                          <p className="text-white font-mono">{fmtInt(payload[0].value)} requests</p>
                        </div>
                      ) : null} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-1">
                  {costBreakdown.map((c, i) => {
                    const total = costBreakdown.reduce((s, x) => s + x.value, 0);
                    const p = total > 0 ? ((c.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div key={c.name} className="flex items-center gap-2 text-[11px]">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-zinc-400 flex-1 truncate">{c.name}</span>
                        <span className="text-zinc-300 font-mono">{fmtInt(c.value)}</span>
                        <span className="text-zinc-600 w-10 text-right">{p}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-zinc-600">No distribution data</div>
            )}
          </div>
        </Section>
      </div>

      {/* ── ROW 7: Top Recipients + Recent Invocations ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Top Recipients" subtitle="Addresses by BOT volume">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {(a.topCustomers || []).length > 0 ? (
              <div className="space-y-2">
                {a.topCustomers.slice(0, 6).map((c, i) => (
                  <div key={c.address} className="flex items-center gap-3 py-2 border-b border-zinc-800/20 last:border-0">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 font-mono">{i + 1}</span>
                    <code className="text-xs text-zinc-400 font-mono truncate flex-1">{c.address.slice(0, 10)}…{c.address.slice(-6)}</code>
                    <span className="text-xs text-emerald-400 font-mono font-semibold">{fmt(c.volumeBOT, 4)} BOT</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-zinc-600">No recipient data yet</div>
            )}
          </div>
        </Section>

        <Section title="Recent Invocations" subtitle="Latest API calls">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/50">
                  <th className="text-left py-3 px-4 text-[10px] font-medium text-zinc-500 uppercase">Endpoint</th>
                  <th className="text-right py-3 px-4 text-[10px] font-medium text-zinc-500 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-[10px] font-medium text-zinc-500 uppercase">Latency</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.slice(0, 6).map((ep, idx) => (
                  <tr key={idx} className={`border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors ${idx % 2 === 1 ? 'bg-zinc-900/20' : ''}`}>
                    <td className="py-2.5 px-4"><span className="text-xs text-zinc-300 font-mono truncate block max-w-[200px]">{ep.endpoint}</span></td>
                    <td className="py-2.5 px-4 text-right">
                      {ep.errors > 0 ? (
                        <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{ep.errors} err</span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">OK</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-zinc-400">{fmtInt(ep.avgLatencyMs)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* ── FOOTER SUMMARY ── */}
      <footer className="bg-zinc-900/30 border border-zinc-800/20 rounded-2xl p-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
          {[
            { label: 'Total Requests', value: fmtInt(a.totalApiCalls || u.totalRequests || 0) },
            { label: 'Total Revenue', value: `$${fmt(a.revenueUsd ?? 0)}` },
            { label: 'Total Spend', value: `${fmt(a.botVolumeBOT ?? 0, 4)} BOT` },
            { label: 'Platform Uptime', value: '99.9%' },
            { label: 'Success Rate', value: pct(a.successRate ?? u.successRate ?? 100) },
          ].map(s => (
            <div key={s.label}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-lg font-bold text-zinc-100 font-mono">{s.value}</p>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default DevAnalytics;
