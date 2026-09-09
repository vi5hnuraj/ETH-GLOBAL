import React from 'react';
import {
  FiCpu, FiCheckCircle, FiZap, FiDollarSign, FiTrendingUp, FiCreditCard, FiGrid, FiActivity, FiRefreshCw,
  FiServer, FiDatabase, FiRadio, FiClock, FiAlertTriangle, FiPackage, FiShoppingBag, FiGlobe, FiArrowRight
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const CHART_TOOLTIP = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 };
const hasData = (rows = [], key) => rows.some((r) => r && Number(r[key]) !== 0);

const StatCard = ({ icon, label, value, accent = 'text-zinc-100' }) => (
  <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl px-4 py-3">
    <div className="text-zinc-500">{icon}</div>
    <div className="min-w-0">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </div>
  </div>
);

const StatusPill = ({ icon, label, value, ok }) => (
  <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
    <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-zinc-100 truncate">{value}</p>
    </div>
    <span className={`ml-auto h-2 w-2 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
  </div>
);

const MiniChart = ({ title, subtitle, children, linkTo }) => (
  <Card title={title} subtitle={subtitle}>
    <div className="h-48">
      {children}
    </div>
    {linkTo && (
      <a href={linkTo} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors">
        View details <FiArrowRight size={12} />
      </a>
    )}
  </Card>
);

const EmptyMini = ({ note }) => (
  <div className="h-full flex flex-col items-center justify-center text-center">
    <FiActivity size={20} className="text-zinc-700 mb-1.5" />
    <p className="text-xs text-zinc-500 max-w-[200px]">{note}</p>
  </div>
);

const DevDashboard = () => {
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: developerApi.dashboard });
  const monitor = useApi({ fetcher: developerApi.monitoring });

  if (loading && !data) {
    return (
      <div>
        <Skeleton className="h-8 w-56 rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-2xl mb-6" />
        <div className="grid lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-400">
          <p className="font-medium">{error.message}</p>
          <button onClick={refresh} className="text-sm underline mt-2">Retry</button>
        </div>
      </div>
    );
  }

  const d = data || {};
  const api = monitor.data?.api || {};
  const db = monitor.data?.database || {};
  const rpc = monitor.data?.rpc || {};
  const workers = monitor.data?.workers || {};
  const pct = monitor.data?.percentiles || {};
  const usage = monitor.data?.usage || {};
  const c = d.charts || {};

  // Key stats — only the most important ones
  const stats = [
    { icon: <FiCpu size={16} />, label: 'AI Agents', value: d.totalAgents ?? '0' },
    { icon: <FiCheckCircle size={16} />, label: 'Active', value: d.activeAgents ?? '0', accent: 'text-emerald-400' },
    { icon: <FiGrid size={16} />, label: 'Wallets', value: d.walletsCreated ?? '0', accent: 'text-cyan-400' },
    { icon: <FiZap size={16} />, label: 'API Today', value: d.apiRequestsToday?.toLocaleString() ?? '0', accent: 'text-amber-400' },
    { icon: <FiDollarSign size={16} />, label: 'Revenue', value: d.monthlyRevenueUsd != null ? `$${Number(d.monthlyRevenueUsd).toFixed(2)}` : '$0.00', accent: 'text-green-400' },
    { icon: <FiTrendingUp size={16} />, label: 'USDC Volume', value: (d.transactionVolumeUSDC != null || d.transactionVolumeUsdc != null || d.transactionVolumeBOT != null) ? `${Number(d.transactionVolumeUSDC || d.transactionVolumeUsdc || d.transactionVolumeBOT || 0).toFixed(2)} USDC` : '0.00 USDC', accent: 'text-cyan-400' },
    { icon: <FiServer size={16} />, label: 'Services', value: d.servicesPublished ?? '0', accent: 'text-indigo-400' },
    { icon: <FiShoppingBag size={16} />, label: 'Installs', value: d.marketplaceInstalls?.toLocaleString() ?? '0', accent: 'text-purple-400' },
  ];

  const statusPills = [
    { icon: <FiServer size={14} />, label: 'API', value: `${(api?.environment || 'dev').toUpperCase()} · v${api?.version || '0.1.0'}`, ok: api?.status === 'ok' },
    { icon: <FiClock size={14} />, label: 'Uptime', value: api?.uptimeSeconds != null ? `${Math.floor(api.uptimeSeconds / 3600)}h ${Math.floor((api.uptimeSeconds % 3600) / 60)}m` : '—', ok: true },
    { icon: <FiDatabase size={14} />, label: 'Database', value: db?.status === 'ok' && db?.latencyMs != null ? `${db.latencyMs}ms` : 'Unreachable', ok: db?.status === 'ok' },
    { icon: <FiRadio size={14} />, label: 'RPC', value: rpc?.status === 'ok' && rpc?.blockNumber != null ? `#${Number(rpc.blockNumber).toLocaleString()}` : 'Unreachable', ok: rpc?.status === 'ok' },
    { icon: <FiActivity size={14} />, label: 'Broadcast', value: workers?.broadcastRecovery?.status === 'running' ? 'Running' : 'Stopped', ok: workers?.broadcastRecovery?.status === 'running' },
    { icon: <FiActivity size={14} />, label: 'Scheduler', value: workers?.scheduledPayment?.status === 'running' ? 'Running' : 'Stopped', ok: workers?.scheduledPayment?.status === 'running' },
  ];

  const isFirstTime = (d.totalAgents || 0) === 0 && (d.servicesPublished || 0) === 0;
  const lifecycle = [
    { label: 'Create Agent', done: Number(d.totalAgents || 0) > 0, to: '/developer/agents', sponsor: 'GlobalPay' },
    { label: 'Arc Wallet', done: Number(d.walletsCreated || 0) > 0, to: '/developer/agents', sponsor: 'Arc' },
    { label: 'Verify Identity', done: Number(d.verifiedAgents || 0) > 0, to: '/developer/network/profile', sponsor: 'World' },
    { label: 'Publish Service', done: Number(d.servicesPublished || 0) > 0, to: '/developer/marketplace/services/publish', sponsor: 'GlobalPay' },
    { label: 'First Payment', done: Number(d.successfulPayments || 0) > 0, to: '/developer/commerce/sessions', sponsor: 'Arc' },
    { label: 'Graph Reputation', done: Number(d.successfulPayments || 0) > 0, to: '/developer/graph-intelligence', sponsor: 'The Graph' }
  ];

  return (
    <div>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Live overview of your AI agent infrastructure.</p>
        </div>
        <button
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <Card className="mb-6 border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-zinc-900/50 to-violet-950/20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Agent lifecycle</p><h2 className="mt-1 text-lg font-semibold text-white">From wallet creation to marketplace reputation</h2></div>
          <a href="/developer/commerce/autonomous" className="text-xs font-medium text-blue-400 hover:text-blue-300">Run autonomous commerce →</a>
        </div>
        <div className="grid gap-2 md:grid-cols-6">{lifecycle.map((stage) => <a key={stage.label} href={stage.to} className={`relative rounded-xl border p-3 transition-colors ${stage.done ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400/50' : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-600'}`}><div className={`mb-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${stage.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>{stage.done ? '✓' : '○'}</div><p className={`text-xs font-semibold ${stage.done ? 'text-zinc-200' : 'text-zinc-500'}`}>{stage.label}</p><p className="mt-1 text-[10px] text-zinc-600">{stage.sponsor}</p></a>)}</div>
      </Card>

      {/* Welcome banner — first time only */}
      {isFirstTime && (
        <div className="bg-gradient-to-r from-blue-900/20 to-violet-900/20 border border-blue-800/40 rounded-2xl p-5 mb-6">
          <p className="text-sm font-semibold text-white mb-1">Welcome to GlobalPay V3</p>
          <p className="text-xs text-zinc-400 mb-4">Your AI agent commerce platform is ready. Get started in 4 steps:</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: <FiCpu size={18} />, label: 'Create Agent', desc: 'Mint wallet + API key', to: '/developer/agents', color: 'blue' },
              { icon: <FiPackage size={18} />, label: 'Publish Service', desc: 'Monetize your agent', to: '/developer/marketplace/services', color: 'violet' },
              { icon: <FiShoppingBag size={18} />, label: 'Browse Store', desc: 'Discover AI services', to: '/developer/marketplace', color: 'emerald' },
              { icon: <FiGlobe size={18} />, label: 'Join Network', desc: 'Set up your profile', to: '/developer/network/profile', color: 'amber' },
            ].map((step) => (
              <a key={step.label} href={step.to} className="bg-zinc-900/60 border border-zinc-700 rounded-xl p-3 hover:border-zinc-500 transition-colors group">
                <div className={`text-${step.color}-400 mb-2 group-hover:text-${step.color}-300`}>{step.icon}</div>
                <p className="text-sm font-semibold text-white">{step.label}</p>
                <p className="text-xs text-zinc-500">{step.desc}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Key stats — compact row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* System Status */}
      <Card title="System Status" subtitle="Live health" className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statusPills.map((p) => <StatusPill key={p.label} {...p} />)}
        </div>
      </Card>

      {/* Charts — only show when there's data, otherwise compact placeholder */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <MiniChart title="API Requests" subtitle="Last 30 days" linkTo="/developer/usage">
          {hasData(c.requestsOverTime, 'requests') ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={c.requestsOverTime || []}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="#3b82f633" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyMini note="API calls appear once agents make requests." />}
        </MiniChart>

        <MiniChart title="Wallet Growth" subtitle="Cumulative" linkTo="/developer/billing">
          {hasData(c.walletGrowth, 'wallets') ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={c.walletGrowth || []}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Line type="monotone" dataKey="wallets" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyMini note="Wallets are created when you add AI agents." />}
        </MiniChart>

        <MiniChart title="Revenue" subtitle="Paid invoices (USD)" linkTo="/developer/marketplace/revenue">
          {hasData(c.revenue, 'revenue') ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={c.revenue || []}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="#22c55e33" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyMini note="Revenue appears once billing is connected." />}
        </MiniChart>

        <MiniChart title="USDC Volume" subtitle="Daily transaction volume">
          {hasData(c.volumeOverTime, 'volume') ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.volumeOverTime || []}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="volume" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyMini note="Arc Chain payments appear here." />}
        </MiniChart>
      </div>

      {/* Active Agents & Services — full width when has data */}
      {hasData(c.activeOverTime, 'active') && (
        <Card title="Active Agents Over Time" className="mb-6">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={c.activeOverTime || []}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Area type="monotone" dataKey="active" stroke="#f59e0b" fill="#f59e0b33" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DevDashboard;
