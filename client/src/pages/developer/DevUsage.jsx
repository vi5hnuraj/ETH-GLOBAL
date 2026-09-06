import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiZap, FiActivity, FiAlertTriangle, FiClock, FiServer, FiCpu, FiRefreshCw,
  FiCheckCircle, FiTrendingUp, FiArrowUpRight, FiArrowDownRight, FiSearch,
  FiChevronDown, FiDownload, FiInfo, FiHash, FiShield, FiWifi, FiGlobe,
  FiDatabase, FiBox, FiMonitor, FiCode, FiKey, FiAlertCircle
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart
} from 'recharts';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════ */

const RANGES = [
  { label: '24H', value: 'day', short: '24H' },
  { label: '7D', value: 'week', short: '7D' },
  { label: '30D', value: 'month', short: '30D' },
  { label: '90D', value: 'quarter', short: '90D' },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
const METHOD_COLORS = { GET: '#3b82f6', POST: '#10b981', PUT: '#f59e0b', PATCH: '#8b5cf6', DELETE: '#ef4444', OPTIONS: '#6b7280', HEAD: '#6b7280' };

const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtInt = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString();
};
const pct = (n) => `${fmt(n, 1)}%`;
const timeAgo = (dateStr) => {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

/* ══════════════════════════════════════════════════════════════
   COMPONENTS
   ══════════════════════════════════════════════════════════════ */

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs min-w-[120px]">
      <p className="text-zinc-400 mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke }} className="font-mono flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.stroke }} />
          {p.name}: {typeof p.value === 'number' ? fmtInt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

const Skeleton = ({ className = '' }) => <div className={`bg-zinc-800/40 rounded-xl animate-pulse ${className}`} />;

const SkeletonPage = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex items-center justify-between">
      <div><div className="h-8 w-48 bg-zinc-800 rounded mb-2" /><div className="h-4 w-96 bg-zinc-800/60 rounded" /></div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-zinc-900/60 rounded-2xl border border-zinc-800/50" />)}
    </div>
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

const EmptyState = ({ title, description, actions }) => (
  <div className="text-center py-12">
    <FiZap size={28} className="text-zinc-700 mx-auto mb-3" />
    <h3 className="text-sm font-semibold text-zinc-400 mb-1">{title}</h3>
    <p className="text-xs text-zinc-600 max-w-sm mx-auto mb-4">{description}</p>
    {actions && <div className="flex items-center justify-center gap-3">{actions}</div>}
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

const KpiCard = ({ icon, label, value, change, accent, sub, sparkData }) => {
  const isPositive = change > 0;
  const isNegative = change < 0;
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 hover:border-zinc-700/60 transition-all group">
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
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
};

const MiniTable = ({ columns, data, maxRows = 10, emptyText = 'No data available' }) => (
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

const DevUsage = () => {
  const navigate = useNavigate();
  const [chartMetric, setChartMetric] = useState('requests');
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState('requests');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  /* ── All hooks ── */
  const { data: usage, loading, error, refresh, refreshing } = useApi({ fetcher: developerApi.usage });

  /* ── Auto refresh ── */
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { refresh({ background: true }); setLastUpdate(new Date()); }, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  /* ── Derived state ── */
  const u = usage || {};
  const hasData = (u.totalRequests ?? 0) > 0;

  /* ── KPI spark data ── */
  const sparkData = useMemo(() => (u.trafficGraph || []).map(c => ({ v: c.requests || 0 })), [u.trafficGraph]);

  /* ── KPI cards ── */
  const kpis = useMemo(() => [
    { icon: <FiZap size={16} className="text-amber-400" />, label: 'Total Requests', value: fmtInt(u.totalRequests ?? 0), accent: 'bg-amber-500/10', sub: `${fmtInt(u.requestsToday)} today`, sparkData },
    { icon: <FiCheckCircle size={16} className="text-emerald-400" />, label: 'Success Rate', value: pct(u.successRate ?? 100), accent: 'bg-emerald-500/10', sub: `${fmtInt((u.totalRequests ?? 0) - (u.errors ?? 0))} successful` },
    { icon: <FiAlertTriangle size={16} className="text-red-400" />, label: 'Error Rate', value: pct(u.errorRate ?? 0), accent: 'bg-red-500/10', sub: `${fmtInt(u.errors ?? 0)} errors` },
    { icon: <FiClock size={16} className="text-blue-400" />, label: 'Avg Latency', value: `${fmtInt(u.avgLatencyMs ?? 0)}ms`, accent: 'bg-blue-500/10' },
    { icon: <FiActivity size={16} className="text-violet-400" />, label: '4xx Errors', value: pct(u.rate4xx ?? 0), accent: 'bg-violet-500/10', sub: 'Client errors' },
    { icon: <FiServer size={16} className="text-cyan-400" />, label: '5xx Errors', value: pct(u.rate5xx ?? 0), accent: 'bg-cyan-500/10', sub: 'Server errors' },
    { icon: <FiShield size={16} className="text-amber-400" />, label: 'Rate Limit', value: `${u.rateLimitPerMin ?? 30}/min`, accent: 'bg-amber-500/10' },
    { icon: <FiTrendingUp size={16} className="text-emerald-400" />, label: 'Requests (Month)', value: fmtInt(u.requestsThisMonth ?? 0), accent: 'bg-emerald-500/10' },
  ], [u, sparkData]);

  /* ── Endpoint table ── */
  const endpoints = useMemo(() => {
    return (u.topEndpoints || [])
      .filter(ep => !tableSearch || ep.endpoint?.toLowerCase().includes(tableSearch.toLowerCase()))
      .sort((a, b) => {
        if (tableSort === 'name') return (a.endpoint || '').localeCompare(b.endpoint || '');
        if (tableSort === 'latency') return (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0);
        return (b.count || 0) - (a.count || 0);
      });
  }, [u.topEndpoints, tableSearch, tableSort]);

  /* ── Agent table ── */
  const agents = useMemo(() => (u.topAgents || []).sort((a, b) => (b.requests || 0) - (a.requests || 0)), [u.topAgents]);

  /* ── Status distribution ── */
  const statusData = useMemo(() => {
    const sb = u.statusBuckets || {};
    return Object.entries(sb).map(([name, value]) => ({ name, value })).filter(c => c.value > 0);
  }, [u.statusBuckets]);

  /* ── Method breakdown (derived from endpoints) ── */
  const methodData = useMemo(() => {
    const methods = {};
    (u.topEndpoints || []).forEach(ep => {
      const method = (ep.endpoint || '').split(' ')[0] || 'GET';
      if (!methods[method]) methods[method] = { method, count: 0, latency: 0 };
      methods[method].count += ep.count || 0;
      methods[method].latency += (ep.avgLatencyMs || 0) * (ep.count || 0);
    });
    return Object.values(methods)
      .map(m => ({ ...m, avgLatency: m.count > 0 ? Math.round(m.latency / m.count) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [u.topEndpoints]);

  /* ── Error bars ── */
  const errorBars = useMemo(() => {
    const total = (u.totalRequests ?? 0) || 1;
    const maxErr = Math.max(...(u.topErrors || []).map(e => e.count), 1);
    return (u.topErrors || []).map(e => ({
      ...e,
      pct: ((e.count / total) * 100).toFixed(1),
      barWidth: (e.count / maxErr) * 100,
    }));
  }, [u.topErrors, u.totalRequests]);

  /* ── Latency distribution ── */
  const latencyBuckets = useMemo(() => {
    const endpoints = u.topEndpoints || [];
    if (endpoints.length === 0) return [];
    // Derive from endpoint data
    const all = endpoints.flatMap(ep => Array(Math.min(ep.count, 50)).fill(ep.avgLatencyMs || 0));
    const buckets = [
      { range: '0–25ms', min: 0, max: 25, count: 0 },
      { range: '25–50ms', min: 25, max: 50, count: 0 },
      { range: '50–100ms', min: 50, max: 100, count: 0 },
      { range: '100–200ms', min: 100, max: 200, count: 0 },
      { range: '200–500ms', min: 200, max: 500, count: 0 },
      { range: '500ms+', min: 500, max: Infinity, count: 0 },
    ];
    all.forEach(v => {
      const b = buckets.find(b => v >= b.min && v < b.max);
      if (b) b.count++;
    });
    return buckets;
  }, [u.topEndpoints]);

  const handleRefresh = useCallback(() => { refresh({ background: true }); setLastUpdate(new Date()); }, [refresh]);

  if (loading && !usage) return <SkeletonPage />;

  if (error && !usage) return (
    <div className="text-center py-20">
      <FiAlertTriangle size={32} className="text-red-400 mx-auto mb-4" />
      <p className="text-zinc-300 mb-2">Unable to load usage data</p>
      <p className="text-sm text-zinc-500 mb-4">{error.message}</p>
      <button onClick={() => refresh()} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">Retry</button>
    </div>
  );

  if (!hasData) return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">API Usage</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor every authenticated API request, latency, rate limits, failures, and token consumption.</p>
        </div>
      </header>
      <EmptyState
        title="No API requests yet"
        description="Your agents haven't made authenticated requests yet. Generate an API key and start calling the API."
        actions={
          <>
            <button onClick={() => navigate('/developer/api')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
              <FiKey size={14} /> Generate API Key
            </button>
            <button onClick={() => navigate('/developer/agents')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors">
              <FiCpu size={14} /> Create Agent
            </button>
            <button onClick={() => navigate('/developer/docs')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors">
              <FiCode size={14} /> View Docs
            </button>
          </>
        }
      />
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
            <h1 className="text-2xl font-bold text-zinc-100">API Usage</h1>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">Monitor every authenticated API request, latency, rate limits, failures, and token consumption.</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Updated {lastUpdate.toLocaleTimeString()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* ── MAIN: Traffic Chart + Status ── */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <Section title="API Requests Timeline" subtitle="Requests over the last 7 days">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5 h-80">
            {(u.trafficGraph || []).length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={u.trafficGraph}>
                  <defs>
                    <linearGradient id="gradTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke="#3b82f6" strokeWidth={2} fill="url(#gradTraffic)" dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-zinc-600">No traffic data</div>
            )}
          </div>
          {/* Summary row */}
          <div className="flex items-center gap-6 mt-3 text-xs text-zinc-500 flex-wrap">
            <span>Today: <span className="text-zinc-300 font-mono">{fmtInt(u.requestsToday)}</span></span>
            <span>Month: <span className="text-zinc-300 font-mono">{fmtInt(u.requestsThisMonth)}</span></span>
            <span>Total: <span className="text-zinc-300 font-mono">{fmtInt(u.totalRequests)}</span></span>
            {u.remainingRequests != null && <span>Remaining: <span className="text-zinc-300 font-mono">{fmtInt(u.remainingRequests)}</span></span>}
          </div>
        </Section>

        <Section title="Status Distribution" subtitle="HTTP response codes">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {statusData.length > 0 ? (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} strokeWidth={0}>
                        {statusData.map((s, i) => (
                          <Cell key={i} fill={s.name === '2xx' ? '#10b981' : s.name === '3xx' ? '#3b82f6' : s.name === '4xx' ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                        <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-3 py-2 shadow-xl text-xs">
                          <p className="text-zinc-300">{payload[0].name}: {fmtInt(payload[0].value)} requests</p>
                        </div>
                      ) : null} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {statusData.map((s, i) => {
                    const total = statusData.reduce((sum, x) => sum + x.value, 0);
                    const p = total > 0 ? ((s.value / total) * 100).toFixed(1) : 0;
                    const color = s.name === '2xx' ? '#10b981' : s.name === '3xx' ? '#3b82f6' : s.name === '4xx' ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={s.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-zinc-400 flex-1">{s.name}</span>
                        <span className="text-zinc-300 font-mono">{fmtInt(s.value)}</span>
                        <span className="text-zinc-600 w-12 text-right">{p}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState title="No status data" description="HTTP status codes appear once requests are made." />
            )}
          </div>
        </Section>
      </div>

      {/* ── ENDPOINT ANALYTICS ── */}
      <Section title="Endpoint Analytics" subtitle={`${endpoints.length} endpoints tracked`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <FiSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                placeholder="Search endpoints..."
                className="pl-7 pr-3 py-1.5 bg-zinc-900/60 border border-zinc-800/50 rounded-lg text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48" />
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
            { key: 'endpoint', label: 'Endpoint', render: v => <span className="text-zinc-300 font-mono truncate block max-w-[280px]">{v}</span> },
            { key: 'count', label: 'Requests', align: 'right', render: v => <span className="font-mono text-zinc-300">{fmtInt(v)}</span> },
            { key: 'avgLatencyMs', label: 'Avg Latency', align: 'right', render: v => <span className="font-mono text-zinc-400">{fmtInt(v)}ms</span> },
            { key: 'errors', label: 'Errors', align: 'right', render: v => v > 0 ? (
              <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-mono">{v}</span>
            ) : <span className="text-[10px] text-zinc-600">0</span> },
            { key: 'count', label: 'Success %', align: 'right', render: (v, row) => {
              const total = v + (row.errors || 0);
              const s = total > 0 ? ((v / total) * 100).toFixed(1) : '100.0';
              return <span className={`font-mono text-xs ${Number(s) >= 99 ? 'text-emerald-400' : Number(s) >= 95 ? 'text-amber-400' : 'text-red-400'}`}>{s}%</span>;
            }},
            { key: 'count', label: 'Traffic %', align: 'right', render: (v) => {
              const total = u.totalRequests || 1;
              const t = ((v / total) * 100).toFixed(1);
              return <span className="font-mono text-xs text-zinc-400">{t}%</span>;
            }},
          ]}
          data={endpoints}
          emptyText="No endpoint data yet"
        />
      </Section>

      {/* ── LATENCY DISTRIBUTION + METHOD BREAKDOWN ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Latency Distribution" subtitle="Response time histogram">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {latencyBuckets.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={latencyBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="range" stroke="#52525b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="count" name="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No latency data" description="Latency distribution appears once requests are made." />
            )}
          </div>
        </Section>

        <Section title="Request Methods" subtitle="HTTP methods breakdown">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {methodData.length > 0 ? (
              <div className="space-y-3">
                {methodData.map(m => {
                  const maxCount = Math.max(...methodData.map(x => x.count), 1);
                  const pctBar = (m.count / maxCount) * 100;
                  return (
                    <div key={m.method} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold" style={{ color: METHOD_COLORS[m.method] || '#6b7280' }}>{m.method}</span>
                          <span className="text-zinc-500">{m.avgLatency}ms avg</span>
                        </div>
                        <span className="text-zinc-400 font-mono">{fmtInt(m.count)}</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pctBar}%`, backgroundColor: METHOD_COLORS[m.method] || '#6b7280' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No method data" description="HTTP method breakdown appears once requests are made." />
            )}
          </div>
        </Section>
      </div>

      {/* ── TOP AGENTS + ERROR ANALYTICS ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Top Agents" subtitle="Agents making the most requests">
          <MiniTable
            columns={[
              { key: 'name', label: 'Agent', render: (v, row) => (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <FiCpu size={10} className="text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-zinc-200 font-medium truncate max-w-[160px]">{v || row.agentId}</p>
                    <p className="text-[9px] text-zinc-600 font-mono truncate max-w-[160px]">{row.agentId}</p>
                  </div>
                </div>
              )},
              { key: 'requests', label: 'Requests', align: 'right', render: v => <span className="font-mono text-zinc-300">{fmtInt(v)}</span> },
            ]}
            data={agents}
            emptyText="No agent traffic yet"
          />
        </Section>

        <Section title="Error Analytics" subtitle="Top errors by frequency">
          <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-2xl p-5">
            {errorBars.length > 0 ? (
              <div className="space-y-2.5">
                {errorBars.map((err, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-mono truncate max-w-[220px]">{err.error}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 font-mono">{err.pct}%</span>
                        <span className="text-zinc-500 font-mono">{fmtInt(err.count)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500/60 rounded-full transition-all" style={{ width: `${err.barWidth}%` }} />
                    </div>
                  </div>
                ))}
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

      {/* ── FOOTER SUMMARY ── */}
      <footer className="bg-zinc-900/30 border border-zinc-800/20 rounded-2xl p-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
          {[
            { label: 'Total Requests', value: fmtInt(u.totalRequests ?? 0) },
            { label: 'Success Rate', value: pct(u.successRate ?? 100) },
            { label: 'Avg Latency', value: `${fmtInt(u.avgLatencyMs ?? 0)}ms` },
            { label: 'Error Rate', value: pct(u.errorRate ?? 0) },
            { label: 'Rate Limit', value: `${u.rateLimitPerMin ?? 30}/min` },
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

export default DevUsage;
