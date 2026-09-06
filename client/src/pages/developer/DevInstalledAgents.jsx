import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiSearch, FiCpu, FiZap, FiDollarSign, FiDownload, FiPackage, FiRefreshCw,
  FiTrash2, FiSettings, FiCheckCircle, FiStar, FiMoreVertical, FiGrid,
  FiList, FiExternalLink, FiArrowUpRight, FiClock, FiActivity, FiAlertCircle,
  FiChevronDown, FiX, FiPlay, FiPause, FiPlus, FiUpload, FiCheck
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import VerificationBadge from '../../components/dev/VerificationBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently Used' },
  { value: 'name', label: 'Name' },
  { value: 'installed', label: 'Recently Installed' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Running' },
  { value: 'suspended', label: 'Paused' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_FILTERS = [
  { value: '', label: 'All Categories' },
  { value: 'gpu', label: 'GPU' },
  { value: 'research', label: 'Research' },
  { value: 'automation', label: 'Automation' },
  { value: 'agentic', label: 'Agentic' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'data', label: 'Data' },
  { value: 'content', label: 'Content' },
  { value: 'trading', label: 'Finance' },
  { value: 'customer_support', label: 'Support' },
  { value: 'security', label: 'Security' },
  { value: 'tools', label: 'Tools' },
];

const CATEGORY_GRADIENTS = {
  gpu: 'from-blue-600/50 to-cyan-600/50', research: 'from-purple-600/50 to-pink-600/50',
  automation: 'from-amber-600/50 to-orange-600/50', agentic: 'from-emerald-600/50 to-teal-600/50',
  analytics: 'from-violet-600/50 to-indigo-600/50', data: 'from-sky-600/50 to-blue-600/50',
  content: 'from-pink-600/50 to-rose-600/50', trading: 'from-green-600/50 to-emerald-600/50',
  customer_support: 'from-teal-600/50 to-cyan-600/50', security: 'from-red-600/50 to-rose-600/50',
  tools: 'from-zinc-500/50 to-zinc-600/50', other: 'from-zinc-600/50 to-zinc-700/50',
};

const STATUS_GROUPS = [
  { key: 'active', label: 'Running Agents', color: 'emerald' },
  { key: 'pending', label: 'Pending', color: 'amber' },
  { key: 'suspended', label: 'Paused', color: 'amber' },
  { key: 'cancelled', label: 'Cancelled', color: 'red' },
];

const fmtTimeAgo = (dateStr) => {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const fmtPrice = (s) => {
  if (!s) return null;
  const p = Number(s.priceBOT ?? 0);
  if (s.pricingModel === 'free') return 'Free';
  return `${p} BOT ${s.pricingModel === 'monthly' ? '/mo' : s.pricingModel === 'subscription' ? `/${s.billingCycle || 'period'}` : '/req'}`;
};

/* ─── Metric Card ─── */
const MetricCard = ({ icon, iconColor, label, value, sub }) => (
  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-4 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${iconColor} flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-bold text-white font-mono leading-none">{value}</p>
      <p className="text-[12px] text-zinc-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  </div>
);

/* ─── Status Badge ─── */
const StatusBadge = ({ status }) => {
  const map = {
    active: { label: 'Running', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
    pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
    suspended: { label: 'Paused', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400' },
    expired: { label: 'Expired', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', dot: 'bg-zinc-400' },
  };
  const s = map[status] || map.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-md border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

/* ─── Sub Badge ─── */
const SubBadge = ({ subscription }) => {
  if (!subscription) return null;
  const map = {
    active: { label: 'Active', cls: 'bg-blue-500/10 text-blue-400' },
    trial: { label: 'Trial', cls: 'bg-violet-500/10 text-violet-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-zinc-500/10 text-zinc-500' },
  };
  const s = map[subscription.status] || map.active;
  return <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${s.cls}`}>{s.label}</span>;
};

/* ─── Quick Action Button ─── */
const QuickAction = ({ icon, label, onClick, accent }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2.5 px-4 py-2.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl text-[13px] font-medium transition-all duration-150 hover:border-zinc-700/60 hover:bg-zinc-900/80 ${accent ? 'text-emerald-400' : 'text-zinc-300'}`}
  >
    {icon}
    {label}
  </button>
);

/* ─── Agent Card ─── */
const AgentCard = ({ installation: i, onInvoke, onUninstall, onRenew, busy }) => {
  const navigate = useNavigate();
  const sub = i.subscription || null;
  const cat = String(i.category || 'other');
  const grad = CATEGORY_GRADIENTS[cat] || CATEGORY_GRADIENTS.other;

  return (
    <div className="group bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700/60 hover:bg-zinc-900/80 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {i.iconUrl ? (
          <img src={i.iconUrl} alt="" className="h-12 w-12 rounded-xl object-cover bg-zinc-800 ring-1 ring-zinc-700/50 flex-shrink-0" />
        ) : (
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-lg font-bold flex-shrink-0`}>
            {(i.agentTitle || i.title || 'A')[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="font-semibold text-zinc-100 truncate text-[15px] cursor-pointer hover:text-emerald-400 transition-colors"
              onClick={() => navigate(`/developer/agent-marketplace/listing/${i.listingId}`)}
            >
              {i.agentTitle || i.title || i.agentCode}
            </h3>
            <StatusBadge status={i.status} />
            {i.updatesAvailable && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-medium rounded-md">
                <FiRefreshCw size={9} /> Update
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {i.publisher?.name && <span className="text-[12px] text-zinc-500 truncate">{i.publisher.name}</span>}
            {i.publisher?.verificationLevel && <VerificationBadge level={i.publisher.verificationLevel} size="sm" />}
            <SubBadge subscription={sub} />
          </div>
        </div>
      </div>

      {/* Description */}
      {i.tagline && (
        <p className="text-[13px] text-zinc-400 line-clamp-1 mb-3 leading-relaxed">{i.tagline}</p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[11px] text-zinc-500 mb-3 flex-wrap">
        <span className="font-mono">v{i.agentVersion || '1.0.0'}</span>
        {i.updatesAvailable && i.latestVersion && (
          <span className="text-blue-400 font-mono">→ v{i.latestVersion}</span>
        )}
        {sub && <span className="text-zinc-400 font-medium">{fmtPrice(sub)}</span>}
        <span className="inline-flex items-center gap-1 ml-auto">
          <FiClock size={10} /> {fmtTimeAgo(i.lastUsedAt)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={() => onInvoke(i)}
          disabled={busy[i.installationId]}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-[12px] font-medium rounded-lg transition-colors disabled:opacity-40"
        >
          <FiPlay size={11} /> Invoke
        </button>
        {i.updatesAvailable && (
          <button
            type="button"
            onClick={() => onRenew(i)}
            disabled={busy[i.installationId]}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[12px] font-medium rounded-lg transition-colors disabled:opacity-40"
          >
            <FiRefreshCw size={11} className={busy[i.installationId] ? 'animate-spin' : ''} /> Update
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(`/developer/agent-marketplace/listing/${i.listingId}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 text-[12px] font-medium rounded-lg transition-colors"
        >
          <FiSettings size={11} /> Configure
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => onUninstall(i)}
            disabled={busy[i.installationId]}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-zinc-600 hover:text-red-400 text-[12px] rounded-lg transition-colors"
            title="Uninstall"
          >
            <FiTrash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Recommend Card (for empty + bottom) ─── */
const RecommendCard = ({ listing: l, navigate }) => {
  const cat = String(l.category || 'other');
  const grad = CATEGORY_GRADIENTS[cat] || CATEGORY_GRADIENTS.other;
  return (
    <div
      onClick={() => navigate(`/developer/agent-marketplace/listing/${l.listingId}`)}
      className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-xl hover:border-zinc-700/60 cursor-pointer transition-all"
    >
      {l.iconUrl ? (
        <img src={l.iconUrl} alt="" className="h-10 w-10 rounded-lg object-cover bg-zinc-800 flex-shrink-0" />
      ) : (
        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
          {(l.title || 'A')[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-zinc-200 truncate">{l.title}</p>
        <p className="text-[11px] text-zinc-500 truncate">{l.publisher?.name || 'Independent'}</p>
      </div>
      <FiArrowUpRight size={14} className="text-zinc-600 group-hover:text-emerald-400 flex-shrink-0" />
    </div>
  );
};

/* ═══════════════ Main Component ═══════════════ */
const DevInstalledAgents = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState('grid');
  const [busy, setBusy] = useState({});
  const [invokeTarget, setInvokeTarget] = useState(null);
  const [invokePayload, setInvokePayload] = useState('');

  const { data: dashData, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.marketplaceConsumerDashboard(),
  });

  const { data: browseData } = useApi({
    fetcher: () => developerApi.marketplaceBrowse({ sort: 'ranking', page: 1, perPage: 8 }),
  });

  /* ── All hooks above, derived state below ── */
  const agents = dashData?.installedAgents || [];
  const recommended = dashData?.recommended || browseData?.listings || [];
  const monthlySpend = dashData?.monthlySpendBOT || '0';
  const invocations30 = dashData?.invocations30 || 0;
  const updatesCount = (dashData?.updatesAvailable || []).length;
  const activeSubs = dashData?.activeSubscriptions || 0;
  const recentlyUsed = dashData?.recentlyUsed || [];

  const filtered = useMemo(() => {
    let list = [...agents];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        (a.agentTitle || a.title || a.agentCode || '').toLowerCase().includes(q) ||
        (a.publisher?.name || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    if (categoryFilter) list = list.filter((a) => String(a.category || 'other') === categoryFilter);
    if (sort === 'name') list.sort((a, b) => (a.agentTitle || a.title || '').localeCompare(b.agentTitle || b.title || ''));
    if (sort === 'installed') list.sort((a, b) => new Date(b.installedAt || 0) - new Date(a.installedAt || 0));
    if (sort === 'recent') list.sort((a, b) => new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0));
    return list;
  }, [agents, search, statusFilter, categoryFilter, sort]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const g of STATUS_GROUPS) groups[g.key] = [];
    for (const a of filtered) {
      const key = a.status || 'active';
      if (groups[key]) groups[key].push(a);
      else groups.active = groups.active || [], groups.active.push(a);
    }
    return groups;
  }, [filtered]);

  const run = async (id, fn, okMsg) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fn();
      toast.success(res?.message || okMsg || 'Done');
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const handleUninstall = (i) => {
    if (!window.confirm(`Uninstall ${i.agentTitle || i.title || i.agentCode}?`)) return;
    run(i.installationId, () => developerApi.marketplaceCancelInstallation(i.installationId).then((r) => ({ message: r.message })), 'Uninstalled');
  };

  const handleInvoke = (i) => {
    setInvokeTarget(i);
    setInvokePayload('');
  };

  const submitInvoke = async () => {
    if (!invokeTarget) return;
    if (!invokePayload.trim()) return toast.error('Enter an input payload.');
    const id = invokeTarget.installationId;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await developerApi.marketplaceInvoke(id, { input: invokePayload });
      toast.success(res?.message || 'Invocation recorded');
      setInvokeTarget(null);
      setInvokePayload('');
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Invoke failed');
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const handleRenew = (i) => {
    run(i.installationId, () => developerApi.marketplaceRenewSubscription(i.installationId, { force: true }).then((r) => ({ message: r.message })), 'Updated');
  };

  /* ── Loading ── */
  if (loading && !dashData) return (
    <div className="space-y-6">
      <div className="h-10 w-64 rounded bg-zinc-800" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="flex gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-40 rounded-xl" />)}</div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
      </div>
    </div>
  );
  if (error && !dashData) return <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />;

  /* ═══════════════ MAIN RENDER ═══════════════ */
  const hasAgents = agents.length > 0;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FiCpu size={24} className="text-emerald-400" />
            My Agents
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage the AI agents installed in your organization. Update versions, configure settings, monitor usage, and manage subscriptions.
          </p>
        </div>
        <button
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800/60 border border-zinc-700 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex-shrink-0"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        <QuickAction
          icon={<FiPlus size={14} className="text-emerald-400" />}
          label="Install New Agent"
          accent
          onClick={() => navigate('/developer/agent-marketplace')}
        />
        <QuickAction
          icon={<FiRefreshCw size={14} />}
          label="Check for Updates"
          onClick={() => refresh({ background: true })}
        />
        <QuickAction
          icon={<FiActivity size={14} />}
          label="View Usage"
          onClick={() => navigate('/developer/agent-marketplace/consumer')}
        />
        <QuickAction
          icon={<FiDollarSign size={14} />}
          label="Manage Billing"
          onClick={() => navigate('/developer/billing')}
        />
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          icon={<FiCpu size={18} className="text-emerald-400" />}
          iconColor="from-emerald-600/40 to-emerald-800/40"
          label="Installed Agents"
          value={agents.length}
          sub={`${activeSubs} active subscriptions`}
        />
        <MetricCard
          icon={<FiDollarSign size={18} className="text-amber-400" />}
          iconColor="from-amber-600/40 to-amber-800/40"
          label="Monthly Spend"
          value={`${Number(monthlySpend).toFixed(4)}`}
          sub="BOT this month"
        />
        <MetricCard
          icon={<FiActivity size={18} className="text-blue-400" />}
          iconColor="from-blue-600/40 to-blue-800/40"
          label="Total Invocations"
          value={invocations30.toLocaleString()}
          sub="last 30 days"
        />
        <MetricCard
          icon={<FiRefreshCw size={18} className="text-violet-400" />}
          iconColor="from-violet-600/40 to-violet-800/40"
          label="Updates Available"
          value={updatesCount}
          sub={updatesCount > 0 ? 'Ready to update' : 'All up to date'}
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <FiSearch size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search installed agents..."
            className="w-full bg-zinc-800/60 border border-zinc-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              <FiX size={14} />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none cursor-pointer"
        >
          {STATUS_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none cursor-pointer"
        >
          {CATEGORY_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none cursor-pointer"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center bg-zinc-800/60 border border-zinc-700/80 rounded-xl overflow-hidden shrink-0">
          <button
            onClick={() => setView('grid')}
            className={`p-2.5 transition-colors ${view === 'grid' ? 'bg-emerald-500/15 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <FiGrid size={15} />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-2.5 transition-colors ${view === 'list' ? 'bg-emerald-500/15 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <FiList size={15} />
          </button>
        </div>
      </div>

      {/* ── Results count ── */}
      <p className="text-[12px] text-zinc-500 mb-4">
        {filtered.length} {filtered.length === 1 ? 'agent' : 'agents'} installed
        {search && ` matching "${search}"`}
        {statusFilter && ` · ${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label}`}
        {categoryFilter && ` · ${CATEGORY_FILTERS.find((f) => f.value === categoryFilter)?.label}`}
      </p>

      {/* ═══════════════ EMPTY STATE ═══════════════ */}
      {!hasAgents && (
        <div className="mb-8 p-8 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700 flex items-center justify-center mx-auto mb-5">
            <FiPackage size={30} className="text-zinc-600" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">No agents installed yet</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-5 leading-relaxed">
            Install complete AI applications from the Agent Store. Each agent bundles multiple capabilities
            like LLMs, GPUs, storage, OCR, wallets, and workflows into a ready-to-use experience.
          </p>
          <div className="flex items-center justify-center gap-3 mb-8">
            <button
              onClick={() => navigate('/developer/agent-marketplace')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl transition-colors"
            >
              <FiExternalLink size={14} /> Browse Agent Store
            </button>
          </div>

          {/* Inline recommendations */}
          {recommended.length > 0 && (
            <div className="text-left max-w-2xl mx-auto">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Recommended for you</h3>
              <div className="grid md:grid-cols-2 gap-2">
                {recommended.slice(0, 4).map((l) => (
                  <RecommendCard key={l.listingId} listing={l} navigate={navigate} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ NO SEARCH RESULTS ═══════════════ */}
      {hasAgents && filtered.length === 0 && (
        <div className="py-12 text-center mb-8">
          <p className="text-sm text-zinc-500">No agents match your filters</p>
          <button onClick={() => { setSearch(''); setStatusFilter(''); setCategoryFilter(''); }} className="text-[12px] text-emerald-400 hover:underline mt-1">Clear all filters</button>
        </div>
      )}

      {/* ═══════════════ AGENT CARDS (GROUPED BY STATUS) ═══════════════ */}
      {hasAgents && filtered.length > 0 && (
        <div className="space-y-8 mb-8">
          {STATUS_GROUPS.map((group) => {
            const items = grouped[group.key] || [];
            if (items.length === 0) return null;
            return (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-zinc-300">{group.label}</h2>
                  <span className="text-[11px] text-zinc-600 font-mono">{items.length}</span>
                </div>
                {view === 'grid' ? (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {items.map((i) => (
                      <AgentCard
                        key={i.installationId}
                        installation={i}
                        onInvoke={handleInvoke}
                        onUninstall={handleUninstall}
                        onRenew={handleRenew}
                        busy={busy}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((i) => (
                      <AgentCard
                        key={i.installationId}
                        installation={i}
                        onInvoke={handleInvoke}
                        onUninstall={handleUninstall}
                        onRenew={handleRenew}
                        busy={busy}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════ RECENTLY USED ═══════════════ */}
      {hasAgents && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Recently Used</h2>
          {recentlyUsed.length === 0 ? (
            <div className="p-6 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl text-center">
              <FiClock size={24} className="text-zinc-700 mx-auto mb-2" />
              <p className="text-[13px] text-zinc-500">No activity yet.</p>
              <p className="text-[12px] text-zinc-600 mt-1">After invoking agents, your recent activity will appear here.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {recentlyUsed.slice(0, 6).map((i) => (
                <div
                  key={i.installationId}
                  onClick={() => navigate(`/developer/agent-marketplace/listing/${i.listingId}`)}
                  className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800/80 rounded-xl hover:border-zinc-700/60 cursor-pointer transition-all"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-200 truncate">{i.agentTitle || i.title || i.agentCode}</p>
                    <p className="text-[11px] text-zinc-500">{fmtTimeAgo(i.lastUsedAt)}</p>
                  </div>
                  <FiArrowUpRight size={14} className="text-zinc-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ RECOMMENDED ═══════════════ */}
      {hasAgents && recommended.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Recommended</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {recommended.slice(0, 4).map((l) => (
              <RecommendCard key={l.listingId} listing={l} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════ INVOKE MODAL ═══════════════ */}
      {invokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setInvokeTarget(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Invoke Agent</h3>
              <button onClick={() => setInvokeTarget(null)} className="text-zinc-500 hover:text-zinc-300"><FiX size={18} /></button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              Sending to <span className="text-zinc-200 font-medium">{invokeTarget.agentTitle || invokeTarget.title || invokeTarget.agentCode}</span>
            </p>
            <textarea
              value={invokePayload}
              onChange={(e) => setInvokePayload(e.target.value)}
              rows={6}
              placeholder='{"query": "your input here"}'
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none mb-4"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setInvokeTarget(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitInvoke}
                disabled={busy[invokeTarget.installationId] || !invokePayload.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <FiZap size={14} /> {busy[invokeTarget.installationId] ? 'Sending...' : 'Invoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-16" />
    </div>
  );
};

export default DevInstalledAgents;
