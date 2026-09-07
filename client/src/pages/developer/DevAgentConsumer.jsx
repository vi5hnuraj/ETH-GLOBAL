import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiDollarSign, FiZap, FiCpu, FiActivity, FiDownload, FiRefreshCw,
  FiStar, FiTrendingUp, FiTrendingDown, FiClock, FiCheck, FiAlertTriangle,
  FiBarChart2, FiArrowUpRight, FiSearch, FiFilter, FiChevronDown,
  FiDatabase, FiGlobe, FiServer, FiWifi, FiWifiOff, FiPlay, FiPause,
  FiExternalLink, FiBookOpen, FiPieChart, FiTarget, FiLayers, FiXCircle
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

/* ── Helpers ────────────────────────────────────────────── */

const PERIOD_OPTIONS = [
  { label: '24H', value: 'day' },
  { label: '7D', value: 'week' },
  { label: '30D', value: 'month' },
  { label: '90D', value: 'quarter' },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtInt = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString();
};

/* ── Skeleton ───────────────────────────────────────────── */

const SkeletonPage = () => (
  <div className="space-y-8 animate-pulse">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div><div className="h-8 w-48 bg-zinc-800 rounded mb-2" /><div className="h-4 w-80 bg-zinc-800/60 rounded" /></div>
      <div className="flex gap-2"><div className="h-9 w-24 bg-zinc-800 rounded-lg" /><div className="h-9 w-9 bg-zinc-800 rounded-lg" /></div>
    </div>
    {/* KPI row */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => <div key={i} className="h-28 bg-zinc-900/60 rounded-2xl border border-zinc-800/50" />)}
    </div>
    {/* Chart */}
    <div className="h-80 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
    {/* Table */}
    <div className="h-64 bg-zinc-900/40 rounded-2xl border border-zinc-800/30" />
  </div>
);

/* ── Empty State ────────────────────────────────────────── */

const EmptyUsageState = ({ onBrowse }) => (
  <div className="text-center py-20">
    <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-zinc-800/50 flex items-center justify-center mb-6">
      <FiBarChart2 size={32} className="text-emerald-400/60" />
    </div>
    <h2 className="text-xl font-bold text-zinc-100 mb-2">No agent activity yet</h2>
    <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed mb-8">
      Install an AI agent from the marketplace and start invoking it from your applications.
      Usage analytics, billing, and performance insights will appear here automatically.
    </p>
    <div className="flex items-center justify-center gap-3">
      <button onClick={onBrowse} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
        <FiDownload size={15} /> Browse Marketplace
      </button>
      <a href="/developer/docs" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors">
        <FiBookOpen size={15} /> View Documentation
      </a>
    </div>
  </div>
);

/* ── KPI Card ───────────────────────────────────────────── */

const KpiCard = ({ icon, label, value, change, changeLabel, accent, sparkData }) => {
  const isPositive = change > 0;
  const isNegative = change < 0;
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-5 hover:border-zinc-700/60 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
        {change != null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : isNegative ? 'bg-red-500/10 text-red-400' : 'bg-zinc-700/50 text-zinc-400'}`}>
            {isPositive ? '+' : ''}{fmt(change, 1)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-zinc-100 font-mono tracking-tight">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}{changeLabel ? ` · ${changeLabel}` : ''}</p>
      {sparkData && sparkData.length > 1 && (
        <div className="mt-3 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs><linearGradient id={`grad-${accent}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill={`url(#grad-${accent})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

/* ── Chart Tooltip ──────────────────────────────────────── */

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-mono">
          {p.name}: {p.name?.toLowerCase().includes('spend') || p.name?.toLowerCase().includes('volume') || p.name?.toLowerCase().includes('cost')
            ? `${fmt(p.value, 4)} USDC` : fmtInt(p.value)}
        </p>
      ))}
    </div>
  );
};

/* ── Main Component ─────────────────────────────────────── */

const DevAgentConsumer = () => {
  const navigate = useNavigate();
  const [chartRange, setChartRange] = useState('month');
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState('cost');

  // ── All hooks first (never conditional) ──
  const { data: dashData, loading: dashLoad, error: dashErr, refresh: dashRefresh, refreshing } = useApi({ fetcher: () => developerApi.marketplaceConsumerDashboard() });
  const { data: analytics, loading: analyticsLoad } = useApi({ fetcher: () => developerApi.analytics(chartRange) });
  const { data: usage, loading: usageLoad } = useApi({ fetcher: () => developerApi.usage() });

  // ── Derived state (always runs) ──
  const d = dashData || {};
  const a = analytics || {};
  const u = usage || {};
  const installed = d.installedAgents || [];
  const recent = d.recentlyUsed || [];
  const installedEmpty = installed.length === 0 && !dashLoad;
  const loading = (dashLoad && !dashData) || (analyticsLoad && !analytics) || (usageLoad && !usage);

  const monthlySpend = Number(d.monthlySpendBOT ?? 0);
  const totalApiCalls = a.totalApiCalls ?? u.totalRequests ?? 0;
  const activeAgents = installed.filter(i => i.status === 'active').length;
  const avgLatency = a.avgLatencyMs ?? u.avgLatencyMs ?? 0;
  const successRate = a.successRate ?? u.successRate ?? 100;
  const errorRate = a.errorRate ?? u.errorRate ?? 0;
  const requestsToday = u.requestsToday ?? 0;
  const requestsThisMonth = u.requestsThisMonth ?? 0;
  const botVolume = a.botVolumeUSDC ?? a.botVolumeBOT ?? '0';

  // Chart data
  const chartData = useMemo(() => {
    const raw = a.chart || [];
    return raw.map(c => ({
      date: c.date,
      Spend: Number(c.volume ?? 0),
      'API Calls': Number(c.requests ?? 0),
      Payments: Number(c.payments ?? 0),
    }));
  }, [a.chart]);

  // Spark data for KPI cards
  const spendSpark = useMemo(() => chartData.map(c => ({ v: c.Spend })), [chartData]);
  const callsSpark = useMemo(() => chartData.map(c => ({ v: c['API Calls'] })), [chartData]);

  // Agent table data
  const tableData = useMemo(() => {
    const topAgents = u.topAgents || [];
    return topAgents
      .filter(a => !tableSearch || a.name?.toLowerCase().includes(tableSearch.toLowerCase()) || a.agentId?.toLowerCase().includes(tableSearch.toLowerCase()))
      .sort((a, b) => {
        if (tableSort === 'name') return (a.name || '').localeCompare(b.name || '');
        if (tableSort === 'latency') return (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0);
        return (b.requests || 0) - (a.requests || 0);
      });
  }, [u.topAgents, tableSearch, tableSort]);

  // Cost breakdown for pie chart
  const costBreakdown = useMemo(() => {
    const cats = {};
    installed.forEach(inst => {
      const cat = inst.category || 'Other';
      const sub = inst.subscription;
      const cost = sub ? Number(sub.priceBOT ?? 0) : 0;
      cats[cat] = (cats[cat] || 0) + cost;
    });
    return Object.entries(cats)
      .map(([name, value]) => ({ name, value: Math.round(value * 10000) / 10000 }))
      .filter(c => c.value > 0);
  }, [installed]);

  // Billing forecast
  const billingForecast = useMemo(() => {
    const daysInMonth = 30;
    const today = new Date().getDate();
    const projected = today > 0 ? (monthlySpend / today) * daysInMonth : 0;
    return { current: monthlySpend, projected, remaining: Math.max(0, projected - monthlySpend) };
  }, [monthlySpend]);

  // Performance metrics
  const perf = useMemo(() => ({
    avgLatency,
    availability: successRate,
    successRate,
    failedRequests: u.errors ?? 0,
    retries: u.rate5xx ?? 0,
    p95Latency: Math.round(avgLatency * 1.8),
  }), [avgLatency, successRate, u.errors, u.rate5xx]);

  // Top endpoints
  const topEndpoints = u.topEndpoints || [];

  // Recommendations
  const recommendations = useMemo(() => {
    const recs = [];
    if (errorRate > 5) recs.push({ icon: FiAlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', text: `Error rate is ${fmt(errorRate, 1)}% — investigate failing endpoints.`, action: 'View Errors' });
    if (avgLatency > 500) recs.push({ icon: FiClock, color: 'text-blue-400', bg: 'bg-blue-500/10', text: `Average response time is ${fmtInt(avgLatency)}ms — consider optimizing slow agents.`, action: 'View Performance' });
    if (d.updatesAvailable?.length > 0) recs.push({ icon: FiArrowUpRight, color: 'text-violet-400', bg: 'bg-violet-500/10', text: `${d.updatesAvailable.length} agent update${d.updatesAvailable.length > 1 ? 's' : ''} available.`, action: 'Update Agents' });
    if (monthlySpend > 0 && billingForecast.projected > monthlySpend * 1.5) recs.push({ icon: FiDollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', text: `Projected to spend ${fmt(billingForecast.projected, 4)} USDC this month — 50% above current.`, action: 'View Billing' });
    if (activeAgents === 0 && installed.length > 0) recs.push({ icon: FiWifiOff, color: 'text-red-400', bg: 'bg-red-500/10', text: 'All installed agents are inactive. Resume them to restore service.', action: 'Manage Agents' });
    return recs;
  }, [errorRate, avgLatency, d.updatesAvailable, monthlySpend, billingForecast, activeAgents, installed.length]);

  const handleRefresh = useCallback(() => {
    dashRefresh({ background: true });
  }, [dashRefresh]);

  if (loading) return <SkeletonPage />;
  if (dashErr && !dashData) return (
    <div className="text-center py-20">
      <FiAlertTriangle size={32} className="text-red-400 mx-auto mb-4" />
      <p className="text-zinc-300 mb-2">Failed to load usage data</p>
      <p className="text-sm text-zinc-500 mb-4">{dashErr.message}</p>
      <button onClick={() => dashRefresh()} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">Retry</button>
    </div>
  );

  if (installedEmpty) return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Usage</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor AI agent consumption, API activity, spending, and operational health.</p>
        </div>
      </div>
      <EmptyUsageState onBrowse={() => navigate('/developer/agent-marketplace/store')} />
    </div>
  );

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Usage</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor AI agent consumption, API activity, spending, and operational health across your organization.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-0.5">
            {PERIOD_OPTIONS.map(p => (
              <button key={p.value} onClick={() => setChartRange(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${chartRange === p.value ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-2 rounded-xl border border-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50">
            <FiRefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<FiDollarSign size={18} className="text-emerald-400" />}
          label="Monthly Spend"
          value={`${fmt(monthlySpend, 4)} USDC`}
          accent="bg-emerald-500/10"
          sparkData={spendSpark}
        />
        <KpiCard
          icon={<FiZap size={18} className="text-blue-400" />}
          label="Total API Calls"
          value={fmtInt(totalApiCalls)}
          changeLabel={`${fmtInt(requestsToday)} today`}
          accent="bg-blue-500/10"
          sparkData={callsSpark}
        />
        <KpiCard
          icon={<FiCpu size={18} className="text-violet-400" />}
          label="Active Agents"
          value={activeAgents}
          changeLabel={`${installed.length} installed`}
          accent="bg-violet-500/10"
        />
        <KpiCard
          icon={<FiClock size={18} className="text-amber-400" />}
          label="Avg Response Time"
          value={`${fmtInt(avgLatency)}ms`}
          changeLabel={`${fmt(successRate, 1)}% success`}
          accent="bg-amber-500/10"
        />
      </div>

      {/* ── Main 2-col: Chart + Cost Breakdown ── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Spending Chart */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Daily Spending</h2>
              <p className="text-xs text-zinc-500 mt-0.5">USDC volume across all agent invocations</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Spend</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />API Calls</span>
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 h-80">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="Spend" stroke="#10b981" strokeWidth={2} fill="url(#gradSpend)" dot={false} />
                  <Area type="monotone" dataKey="API Calls" stroke="#3b82f6" strokeWidth={1.5} fill="url(#gradCalls)" dot={false} yAxisId={0} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-zinc-600">No chart data available</div>
            )}
          </div>
          {/* Summary row below chart */}
          <div className="flex items-center gap-6 mt-3 text-xs text-zinc-500">
            <span>Volume: <span className="text-zinc-300 font-mono">{botVolume} USDC</span></span>
            <span>Payments: <span className="text-zinc-300 font-mono">{fmtInt(a.payments)}</span></span>
            <span>Most Active: <span className="text-zinc-300">{a.mostActiveAgent || '—'}</span></span>
          </div>
        </section>

        {/* Cost Breakdown Pie */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Cost Breakdown</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {costBreakdown.length > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={costBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}>
                        {costBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                        <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs">
                          <p className="text-zinc-300 font-medium">{payload[0].name}</p>
                          <p className="text-emerald-400 font-mono">{fmt(payload[0].value, 4)} USDC</p>
                        </div>
                      ) : null} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {costBreakdown.map((c, i) => {
                    const total = costBreakdown.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? ((c.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div key={c.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-zinc-400 flex-1 truncate">{c.name}</span>
                        <span className="text-zinc-300 font-mono">{fmt(c.value, 4)} USDC</span>
                        <span className="text-zinc-600 w-12 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-zinc-600">No cost data</div>
            )}
          </div>
        </section>
      </div>

      {/* ── Agent Usage Table ── */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Agent Usage</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{tableData.length} agents with API activity</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                placeholder="Search agents..."
                className="pl-8 pr-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-xl text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48" />
            </div>
            <div className="relative">
              <select value={tableSort} onChange={e => setTableSort(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 cursor-pointer">
                <option value="calls">Most Called</option>
                <option value="name">Name</option>
                <option value="latency">Latency</option>
              </select>
              <FiChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Agent</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">API Calls</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Avg Latency</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-zinc-600 text-sm">No agent usage data yet</td></tr>
              ) : tableData.map((agent, idx) => (
                <tr key={agent.agentId} className={`border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors ${idx % 2 === 1 ? 'bg-zinc-900/20' : ''}`}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <FiCpu size={12} className="text-zinc-500" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-200 font-medium truncate max-w-[200px]">{agent.name || agent.agentId}</p>
                        <p className="text-[10px] text-zinc-600 font-mono truncate max-w-[200px]">{agent.agentId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <FiCheck size={10} /> Active
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-zinc-300">{fmtInt(agent.requests)}</td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-zinc-400">{fmtInt(agent.avgLatencyMs || 0)}ms</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => navigate('/developer/usage')} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Details →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Bottom Grid: Billing Forecast + Performance + Recommendations ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Billing Forecast */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Billing Forecast</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-zinc-500">Current Spend</p>
                <p className="text-lg font-bold text-zinc-100 font-mono">{fmt(billingForecast.current, 4)} <span className="text-xs text-zinc-500 font-sans">USDC</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">Projected</p>
                <p className="text-lg font-bold text-amber-400 font-mono">{fmt(billingForecast.projected, 4)} <span className="text-xs text-zinc-500 font-sans">USDC</span></p>
              </div>
            </div>
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                <span>Monthly usage</span>
                <span>{fmt(Math.min(100, billingForecast.projected > 0 ? (billingForecast.current / billingForecast.projected) * 100 : 0), 0)}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, billingForecast.projected > 0 ? (billingForecast.current / billingForecast.projected) * 100 : 0)}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-zinc-500">USDC Volume (period)</span>
              <span className="text-zinc-300 font-mono">{botVolume} USDC</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Payments</span>
              <span className="text-zinc-300 font-mono">{fmtInt(a.payments)}</span>
            </div>
          </div>
        </section>

        {/* Performance */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Performance</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Avg Response', value: `${fmtInt(perf.avgLatency)}ms`, icon: <FiClock size={13} className="text-blue-400" /> },
                { label: 'Availability', value: `${fmt(perf.availability, 1)}%`, icon: <FiWifi size={13} className="text-emerald-400" /> },
                { label: 'Success Rate', value: `${fmt(perf.successRate, 1)}%`, icon: <FiCheck size={13} className="text-emerald-400" /> },
                { label: 'Failed Requests', value: fmtInt(perf.failedRequests), icon: <FiAlertTriangle size={13} className="text-red-400" /> },
                { label: '5xx Errors', value: fmtInt(perf.retries), icon: <FiXCircle size={13} className="text-red-400" /> },
                { label: 'P95 Latency', value: `${fmtInt(perf.p95Latency)}ms`, icon: <FiBarChart2 size={13} className="text-amber-400" /> },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-2.5 py-2">
                  {p.icon}
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{p.label}</p>
                    <p className="text-sm font-semibold text-zinc-200 font-mono">{p.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI Recommendations */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Insights</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 space-y-3">
            {recommendations.length > 0 ? recommendations.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${r.bg} border border-zinc-800/30`}>
                <r.icon size={15} className={`${r.color} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 leading-relaxed">{r.text}</p>
                  <button className="text-[11px] text-zinc-500 hover:text-zinc-300 mt-1 transition-colors">{r.action} →</button>
                </div>
              </div>
            )) : (
              <div className="text-center py-6">
                <FiTarget size={20} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No insights yet — usage data will generate recommendations.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Bottom Grid: Top Endpoints + Recent Activity + Updates ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Endpoints */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Top Endpoints</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {topEndpoints.length > 0 ? (
              <div className="space-y-2">
                {topEndpoints.slice(0, 6).map((ep, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-800/20 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 font-mono truncate">{ep.endpoint}</p>
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">{fmtInt(ep.count)}</span>
                    {ep.errors > 0 && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{ep.errors} err</span>}
                    <span className="text-[10px] text-zinc-600 font-mono">{fmtInt(ep.avgLatencyMs)}ms</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 text-center py-6">No endpoint data yet</p>
            )}
          </div>
        </section>

        {/* Recent Activity Timeline */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Recent Activity</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {recent.length > 0 ? (
              <div className="space-y-3">
                {recent.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-start gap-3 relative">
                    {i < recent.length - 1 && <div className="absolute left-[9px] top-6 w-px h-full bg-zinc-800" />}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${r.status === 'active' ? 'bg-emerald-500/10' : 'bg-zinc-800'}`}>
                      {r.status === 'active' ? <FiCheck size={10} className="text-emerald-400" /> : <FiPause size={10} className="text-zinc-500" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-xs text-zinc-300">{r.agentTitle || r.title}</p>
                      <p className="text-[10px] text-zinc-600">
                        v{r.agentVersion || r.version || '—'} · {r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString() : '—'}
                        {r.usageCount != null ? ` · ${r.usageCount} calls` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 text-center py-6">No recent activity</p>
            )}
          </div>
        </section>

        {/* Updates Available */}
        <section>
          <h2 className="text-base font-semibold text-zinc-100 mb-4">Updates Available</h2>
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {d.updatesAvailable?.length > 0 ? (
              <div className="space-y-2">
                {d.updatesAvailable.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-800/30 border border-zinc-800/30">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <FiArrowUpRight size={12} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 font-medium truncate">{a.title || a.agentTitle}</p>
                      <p className="text-[10px] text-zinc-600">v{a.agentVersion} → v{a.latestVersion}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <FiCheck size={18} className="text-emerald-400/50 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">All agents up to date</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DevAgentConsumer;
