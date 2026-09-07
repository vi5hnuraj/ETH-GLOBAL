import React, { useMemo, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiPlus, FiTrash2, FiEdit2, FiPower, FiCpu, FiSearch, FiClock, FiTrendingUp,
  FiActivity, FiDollarSign, FiMoreHorizontal, FiExternalLink, FiChevronDown, FiLayers, FiPackage
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Modal from '../../components/dev/Modal';
import Pill from '../../components/dev/Pill';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const input =
  'w-full bg-zinc-900/80 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 transition-colors';

const CATEGORY_META = {
  'ai-model': { icon: '🧠', label: 'AI Model', tone: 'violet' },
  gpu: { icon: '⚡', label: 'GPU', tone: 'amber' },
  compute: { icon: '🖥️', label: 'Compute', tone: 'sky' },
  ocr: { icon: '📄', label: 'Vision / OCR', tone: 'emerald' },
  voice: { icon: '🎤', label: 'Voice', tone: 'blue' },
  translation: { icon: '🌍', label: 'Translation', tone: 'green' },
  video: { icon: '🎬', label: 'Video', tone: 'red' },
  storage: { icon: '📦', label: 'Storage', tone: 'zinc' },
  api: { icon: '🔌', label: 'Data APIs', tone: 'sky' },
  other: { icon: '✨', label: 'Other', tone: 'zinc' }
};

const PRICING_META = {
  per_request: 'Per request',
  per_unit: 'Per unit',
  per_hour: 'Per hour',
  per_char: 'Per character',
  per_mb_day: 'Per MB / day',
  flat: 'One-time',
  subscription: 'Monthly'
};

const STATUS_META = {
  live: { label: 'Live', tone: 'emerald', dot: true },
  paused: { label: 'Paused', tone: 'amber', dot: true },
  draft: { label: 'Draft', tone: 'zinc', dot: true }
};

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'recent', label: 'Recently updated' },
  { id: 'price_asc', label: 'Price: low → high' },
  { id: 'price_desc', label: 'Price: high → low' },
  { id: 'requests', label: 'Most requests' },
  { id: 'revenue', label: 'Most revenue' }
];

const fmtCount = (n) => {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtBOT = (v) => {
  const num = Number(v || 0);
  if (num === 0) return '0.0000';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(4);
};

const statusOf = (s) => s.lifecycleStatus || (s.isActive ? 'live' : 'draft');

const MetricCard = ({ icon: Icon, label, value, sub, accent }) => (
  <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl px-4 py-3.5 flex items-start gap-3 hover:border-zinc-700 transition-colors">
    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${accent.bg}`}>
      <Icon size={16} className={accent.text} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{label}</p>
      <p className="text-[22px] font-bold text-white leading-tight mt-0.5 truncate">{value}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>
    </div>
  </div>
);

const OverflowMenu = ({ open, onToggle, onClose, items }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <FiMoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-9 z-40 w-52 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40 py-1.5 animate-[menuIn_.12s_ease]"
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onClose(); item.onClick(); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors ${
                  item.danger ? 'text-red-400 hover:text-red-300 hover:bg-red-950/40' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {item.icon && <item.icon size={14} />}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const DevServices = () => {
  const navigate = useNavigate();
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.services() });
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const agents = agentsState.data?.agents || [];

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [menuId, setMenuId] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [capTarget, setCapTarget] = useState(null);
  const [capForm, setCapForm] = useState({ supportedModels: '', gpuModel: '', vramGb: '', inference: true, training: false, imageGeneration: false, embeddings: false, speech: false, ocr: false, translation: false, storage: false, supportedRegions: '', averageLatencyMs: '', uptimePct: '', averageRating: '' });
  const [savingCaps, setSavingCaps] = useState(false);

  const services = data?.services || [];

  const openCapabilities = (s) => {
    setCapTarget(s);
    setCapForm({
      supportedModels: s.capabilities?.supportedModels?.join(', ') || '',
      gpuModel: s.capabilities?.gpuModel || '',
      vramGb: s.capabilities?.vramGb ?? '',
      inference: !!s.capabilities?.capabilities?.inference,
      training: !!s.capabilities?.capabilities?.training,
      imageGeneration: !!s.capabilities?.capabilities?.imageGeneration,
      embeddings: !!s.capabilities?.capabilities?.embeddings,
      speech: !!s.capabilities?.capabilities?.speech,
      ocr: !!s.capabilities?.capabilities?.ocr,
      translation: !!s.capabilities?.capabilities?.translation,
      storage: !!s.capabilities?.capabilities?.storage,
      supportedRegions: s.capabilities?.supportedRegions?.join(', ') || '',
      averageLatencyMs: s.capabilities?.averageLatencyMs ?? '',
      uptimePct: s.capabilities?.uptimePct ?? '',
      averageRating: s.capabilities?.averageRating ?? ''
    });
  };

  const saveCapabilities = async () => {
    if (!capTarget) return;
    setSavingCaps(true);
    try {
      const cap = {
        supportedModels: capForm.supportedModels.split(',').map((x) => x.trim()).filter(Boolean),
        gpuModel: capForm.gpuModel.trim() || null,
        vramGb: capForm.vramGb === '' ? null : Number(capForm.vramGb),
        inference: capForm.inference,
        training: capForm.training,
        imageGeneration: capForm.imageGeneration,
        embeddings: capForm.embeddings,
        speech: capForm.speech,
        ocr: capForm.ocr,
        translation: capForm.translation,
        storage: capForm.storage,
        supportedRegions: capForm.supportedRegions.split(',').map((x) => x.trim()).filter(Boolean),
        averageLatencyMs: capForm.averageLatencyMs === '' ? null : Number(capForm.averageLatencyMs),
        uptimePct: capForm.uptimePct === '' ? null : Number(capForm.uptimePct),
        averageRating: capForm.averageRating === '' ? null : Number(capForm.averageRating)
      };
      await developerApi.updateCapabilities(capTarget.serviceId, { capabilities: cap, agentId: capTarget.agentId });
      toast.success('Capability profile saved — the recommendation engine can now surface this service');
      setCapTarget(null);
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to save capability profile');
    } finally {
      setSavingCaps(false);
    }
  };

  const toggleActive = async (s) => {
    try {
      await developerApi.updateService(s.serviceId, { isActive: !s.isActive, agentId: s.agentId });
      toast.success(s.isActive ? 'Service deactivated' : 'Service activated');
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to toggle service');
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await developerApi.deleteService(deleteTarget.serviceId, deleteTarget.agentId);
      toast.success('Service deleted');
      setDeleteTarget(null);
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to delete service');
    } finally {
      setDeleting(false);
    }
  };

  const metrics = useMemo(() => {
    const totalRevenue = services.reduce((s, x) => s + Number(x.revenueBOT || 0), 0);
    const totalRequests = services.reduce((s, x) => s + Number(x.requestCount || 0), 0);
    const active = services.filter((x) => statusOf(x) === 'live').length;
    const life = services.length ? Math.round((active / services.length) * 100) : 0;
    return {
      totalRevenue,
      totalRequests,
      active,
      life,
      healthLabel: services.length ? `${life}%` : '—',
      healthSub: services.length ? `${active} of ${services.length} live` : 'No services yet'
    };
  }, [services]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = services.filter((s) => {
      if (q && !`${s.title} ${s.description || ''}`.toLowerCase().includes(q)) return false;
      if (category !== 'all' && s.category !== category) return false;
      if (status !== 'all' && statusOf(s) !== status) return false;
      return true;
    });
    const price = (s) => Number(s.unitPriceBOT ?? s.unitPrice ?? 0);
    const date = (s) => new Date(s.updatedAt || s.createdAt || 0).getTime();
    switch (sortBy) {
      case 'recent': arr = [...arr].sort((a, b) => date(b) - date(a)); break;
      case 'price_asc': arr = [...arr].sort((a, b) => price(a) - price(b)); break;
      case 'price_desc': arr = [...arr].sort((a, b) => price(b) - price(a)); break;
      case 'requests': arr = [...arr].sort((a, b) => Number(b.requestCount || 0) - Number(a.requestCount || 0)); break;
      case 'revenue': arr = [...arr].sort((a, b) => Number(b.revenueBOT || 0) - Number(a.revenueBOT || 0)); break;
      default: arr = [...arr].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return arr;
  }, [services, search, category, status, sortBy]);

  const clearFilters = () => { setSearch(''); setCategory('all'); setStatus('all'); setSortBy('newest'); };
  const hasFilters = search || category !== 'all' || status !== 'all';

  return (
    <div>
      <style>{`@keyframes menuIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}@keyframes cardIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

      <PageHeader
        title="Services"
        subtitle="Publish, monitor and manage the AI services your workspace sells on the network."
        actions={
          <>
            <RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />
            <button
              type="button"
              onClick={() => navigate('/developer/marketplace/services/publish')}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/30"
            >
              <FiPlus size={14} /> New service
            </button>
          </>
        }
      />

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
          </div>
        </div>
      ) : error && !data ? (
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      ) : services.length === 0 ? (
        <EmptyState
          icon={FiLayers}
          title="Publish your first service."
          description="List an AI capability on the network and start earning USDC automatically — billing, invoicing and settlement are fully autonomous."
          benefits={[
            'Automatic Billing — every usage report mints an invoice',
            'Invoice Generation — metered, idempotent, explorer-verified',
            'Revenue Analytics — track earnings per service and customer',
            'Marketplace Discovery — the commerce engine recommends you'
          ]}
          primary={{ label: 'Create Service', onClick: () => navigate('/developer/marketplace/services/publish'), icon: <FiPlus size={13} /> }}
          secondary={{ label: 'Browse Documentation', href: '/developer/docs', icon: null }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard icon={FiDollarSign} label="Total Revenue" value={`${fmtBOT(metrics.totalRevenue)} USDC`} sub="Lifetime settled revenue" accent={{ bg: 'bg-emerald-500/10', text: 'text-emerald-400' }} />
            <MetricCard icon={FiActivity} label="Total Requests" value={fmtCount(metrics.totalRequests)} sub="Processed usage reports" accent={{ bg: 'bg-blue-500/10', text: 'text-blue-400' }} />
            <MetricCard icon={FiPower} label="Active Services" value={metrics.active} sub={`${services.length} total listed`} accent={{ bg: 'bg-violet-500/10', text: 'text-violet-400' }} />
            <MetricCard icon={FiTrendingUp} label="Health" value={metrics.healthLabel} sub={metrics.healthSub} accent={{ bg: 'bg-amber-500/10', text: 'text-amber-400' }} />
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[220px]">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services…"
                aria-label="Search services"
                className={`${input} pl-10`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <label className="sr-only" htmlFor="f-category">Category</label>
                <select id="f-category" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className={`${input} pr-9 appearance-none cursor-pointer`}>
                  <option value="all">All categories</option>
                  {Object.entries(CATEGORY_META).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              </div>
              <div className="relative">
                <label className="sr-only" htmlFor="f-status">Status</label>
                <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={`${input} pr-9 appearance-none cursor-pointer`}>
                  <option value="all">All statuses</option>
                  <option value="live">Live</option>
                  <option value="paused">Paused</option>
                  <option value="draft">Draft</option>
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              </div>
              <div className="relative">
                <label className="sr-only" htmlFor="f-sort">Sort</label>
                <select id="f-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort services" className={`${input} pr-9 appearance-none cursor-pointer`}>
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500">
              {filtered.length} service{filtered.length === 1 ? '' : 's'}
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="ml-2 text-blue-400 hover:text-blue-300 font-medium">
                  Clear filters
                </button>
              )}
            </p>
            <p className="text-[11px] text-zinc-600 hidden sm:block">Status is derived from activation state and traffic</p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={FiSearch}
              title="No services match your filters"
              description="Try widening the search, or clearing the category and status filters."
              compact
              primary={{ label: 'Clear filters', onClick: clearFilters, icon: null }}
            />
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((s, idx) => {
                const cat = CATEGORY_META[s.category] || CATEGORY_META.other;
                const st = STATUS_META[statusOf(s)];
                const updated = (s.updatedAt || s.createdAt) ? new Date(s.updatedAt || s.createdAt) : null;
                return (
                  <article
                    key={s.serviceId}
                    className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col hover:border-zinc-700 hover:bg-zinc-900/90 transition-all duration-200 hover:-translate-y-0.5"
                    style={{ animation: `cardIn .25s ease both`, animationDelay: `${Math.min(idx, 8) * 30}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex items-center gap-2.5">
                        <span className="text-lg leading-none shrink-0">{cat.icon}</span>
                        <Link
                          to={`/developer/marketplace/service/${s.serviceId}`}
                          className="text-[15px] font-semibold text-zinc-100 hover:text-white hover:underline truncate transition-colors"
                          title={s.title}
                        >
                          {s.title}
                        </Link>
                      </div>
                      <Pill tone={st.tone} dot>{st.label}</Pill>
                    </div>

                    <p className="text-[11px] text-zinc-700 mb-3 truncate" title={s.serviceId}>{s.title}</p>

                    <div className="flex items-center gap-2 mb-4">
                      <Pill tone={cat.tone}>{cat.label}</Pill>
                      <Pill tone="zinc">{PRICING_META[s.pricingModel] || s.pricingModel}</Pill>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><FiDollarSign size={10} /> Revenue</p>
                        <p className="text-sm font-bold text-gradient mt-0.5">{fmtBOT(s.revenueBOT)} <span className="text-[10px] text-zinc-500 font-normal">USDC</span></p>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><FiActivity size={10} /> Requests</p>
                        <p className="text-sm font-bold text-white mt-0.5">{fmtCount(s.requestCount)}</p>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wide">Price</p>
                        <p className="text-sm font-bold text-white mt-0.5">
                          {Number(s.unitPriceBOT ?? s.unitPrice ?? 0).toFixed(4)} <span className="text-[10px] text-zinc-500 font-normal">USDC / {s.unitLabel || 'unit'}</span>
                        </p>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl px-3 py-2.5">
                        <p className="text-zinc-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><FiClock size={10} /> Updated</p>
                        <p className="text-xs font-medium text-zinc-300 mt-0.5">{updated ? updated.toLocaleDateString() : '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-zinc-800/70">
                      <Link
                        to={`/developer/marketplace/service/${s.serviceId}`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                      >
                        <FiExternalLink size={13} /> Dashboard
                      </Link>
                      <button
                        type="button"
                        onClick={() => navigate(`/developer/marketplace/services/publish/${s.serviceId}`)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                      >
                        <FiEdit2 size={13} /> Edit
                      </button>
                      <OverflowMenu
                        open={menuId === s.serviceId}
                        onToggle={() => setMenuId(menuId === s.serviceId ? null : s.serviceId)}
                        onClose={() => setMenuId(null)}
                        items={[
                          {
                            label: s.isActive ? 'Deactivate' : 'Activate',
                            icon: FiPower,
                            onClick: () => toggleActive(s)
                          },
                          {
                            label: 'Capability profile',
                            icon: FiCpu,
                            onClick: () => openCapabilities(s)
                          },
                          {
                            label: 'Delete service',
                            icon: FiTrash2,
                            danger: true,
                            onClick: () => setDeleteTarget(s)
                          }
                        ]}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!capTarget}
        onClose={() => setCapTarget(null)}
        title={capTarget ? `Capability profile — ${capTarget.title}` : ''}
        subtitle="The recommendation engine matches tasks against this profile. Empty fields are ignored."
        maxWidth="max-w-2xl"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="cap-supported-models" className="block text-xs text-zinc-500 font-medium mb-1.5">Supported models <span className="text-zinc-600">(comma-separated, e.g. llama-3-70b)</span></label>
            <input id="cap-supported-models" value={capForm.supportedModels} onChange={(e) => setCapForm((f) => ({ ...f, supportedModels: e.target.value }))} placeholder="llama-3-70b, llama-2-7b" className={input} />
          </div>
          <div>
            <label htmlFor="cap-gpu-model" className="block text-xs text-zinc-500 font-medium mb-1.5">GPU model</label>
            <input id="cap-gpu-model" value={capForm.gpuModel} onChange={(e) => setCapForm((f) => ({ ...f, gpuModel: e.target.value }))} placeholder="H100" className={input} />
          </div>
          <div>
            <label htmlFor="cap-vram" className="block text-xs text-zinc-500 font-medium mb-1.5">VRAM (GB)</label>
            <input id="cap-vram" type="number" min="0" inputMode="decimal" value={capForm.vramGb} onChange={(e) => setCapForm((f) => ({ ...f, vramGb: e.target.value }))} placeholder="24" className={input} />
          </div>
          <div>
            <label htmlFor="cap-regions" className="block text-xs text-zinc-500 font-medium mb-1.5">Supported regions <span className="text-zinc-600">(comma-separated: eu, us, asia…)</span></label>
            <input id="cap-regions" value={capForm.supportedRegions} onChange={(e) => setCapForm((f) => ({ ...f, supportedRegions: e.target.value }))} placeholder="eu, us" className={input} />
          </div>
          <div>
            <label htmlFor="cap-latency" className="block text-xs text-zinc-500 font-medium mb-1.5">Avg latency (ms)</label>
            <input id="cap-latency" type="number" min="0" inputMode="decimal" value={capForm.averageLatencyMs} onChange={(e) => setCapForm((f) => ({ ...f, averageLatencyMs: e.target.value }))} placeholder="80" className={input} />
          </div>
          <div>
            <label htmlFor="cap-uptime" className="block text-xs text-zinc-500 font-medium mb-1.5">Uptime %</label>
            <input id="cap-uptime" type="number" min="0" max="100" inputMode="decimal" value={capForm.uptimePct} onChange={(e) => setCapForm((f) => ({ ...f, uptimePct: e.target.value }))} placeholder="99.5" className={input} />
          </div>
          <div>
            <label htmlFor="cap-rating" className="block text-xs text-zinc-500 font-medium mb-1.5">Avg rating (0–5)</label>
            <input id="cap-rating" type="number" min="0" max="5" step="0.1" inputMode="decimal" value={capForm.averageRating} onChange={(e) => setCapForm((f) => ({ ...f, averageRating: e.target.value }))} placeholder="4.8" className={input} />
          </div>
        </div>
        <div className="mt-5">
          <p className="text-xs text-zinc-500 font-medium mb-2">Capabilities</p>
          <div className="flex flex-wrap gap-2">
            {[['inference', 'Inference'], ['training', 'Training'], ['imageGeneration', 'Image generation'], ['embeddings', 'Embeddings'], ['speech', 'Speech/TTS'], ['ocr', 'OCR'], ['translation', 'Translation'], ['storage', 'Storage']].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 text-sm text-zinc-300 border border-zinc-700 rounded-lg px-3 py-2">
                <input type="checkbox" checked={capForm[key]} onChange={(e) => setCapForm((f) => ({ ...f, [key]: e.target.checked }))} className="accent-blue-500" />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6">
          <button type="button" onClick={saveCapabilities} disabled={savingCaps} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
            {savingCaps ? 'Saving…' : 'Save capability profile'}
          </button>
          <button type="button" onClick={() => setCapTarget(null)} className="flex-1 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2.5 rounded-lg">
            Cancel
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        busy={deleting}
        title="Delete service?"
        description={deleteTarget ? (
          <>
            <span className="text-white">{deleteTarget.title}</span> will be removed from the marketplace. Services that already have invoices can still be deactivated instead.
          </>
        ) : ''}
        confirmLabel="Delete service"
      />
    </div>
  );
};

export default DevServices;