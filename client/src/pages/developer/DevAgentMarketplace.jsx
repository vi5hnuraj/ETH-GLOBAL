import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiSearch, FiStar, FiDownload, FiTrendingUp, FiGrid, FiDollarSign,
  FiZap, FiPackage, FiFilter, FiInfo, FiCheck, FiExternalLink, FiArrowUpRight,
  FiChevronDown, FiX
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import Pill from '../../components/dev/Pill';
import VerificationBadge from '../../components/dev/VerificationBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'gpu', label: 'GPU', icon: '🖥️' },
  { value: 'research', label: 'Research', icon: '🔬' },
  { value: 'automation', label: 'Automation', icon: '⚡' },
  { value: 'agentic', label: 'Agentic', icon: '🤖' },
  { value: 'analytics', label: 'Analytics', icon: '📊' },
  { value: 'data', label: 'Data', icon: '📦' },
  { value: 'content', label: 'Content', icon: '✏️' },
  { value: 'trading', label: 'Finance', icon: '💰' },
  { value: 'customer_support', label: 'Support', icon: '💬' },
  { value: 'security', label: 'Security', icon: '🔒' },
  { value: 'tools', label: 'Tools', icon: '🛠️' },
];

const SORTS = [
  { value: 'ranking', label: 'Recommended' },
  { value: 'installs', label: 'Most Installed' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'newest', label: 'Recently Updated' },
  { value: 'price_asc', label: 'Lowest Price' },
  { value: 'price_desc', label: 'Highest Price' },
];

const PRICING_FILTERS = [
  { value: '', label: 'All Prices' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
  { value: 'subscription', label: 'Subscription' },
];

const CATEGORY_GRADIENTS = {
  gpu: 'from-blue-600/50 to-cyan-600/50',
  research: 'from-purple-600/50 to-pink-600/50',
  automation: 'from-amber-600/50 to-orange-600/50',
  agentic: 'from-emerald-600/50 to-teal-600/50',
  analytics: 'from-violet-600/50 to-indigo-600/50',
  data: 'from-sky-600/50 to-blue-600/50',
  content: 'from-pink-600/50 to-rose-600/50',
  trading: 'from-green-600/50 to-emerald-600/50',
  customer_support: 'from-teal-600/50 to-cyan-600/50',
  security: 'from-red-600/50 to-rose-600/50',
  tools: 'from-zinc-500/50 to-zinc-600/50',
  other: 'from-zinc-600/50 to-zinc-700/50',
};

const fmtPrice = (l) => {
  const p = Number(l.priceBOT ?? 0);
  if (l.pricingModel === 'free') return 'Free';
  if (l.pricingModel === 'enterprise') return 'Enterprise';
  if (l.pricingModel === 'monthly') return `${p} USDC/mo`;
  if (l.pricingModel === 'subscription') return `${p} USDC/${l.billingCycle || 'period'}`;
  return `${p} USDC/req`;
};

const fmtInstalls = (n) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const StarRating = ({ rating }) => {
  const r = Number(rating ?? 0);
  if (r === 0) return <span className="text-zinc-600 text-xs">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <FiStar size={12} className="text-amber-400 fill-amber-400" />
      <span className="text-zinc-300 font-medium">{r.toFixed(1)}</span>
    </span>
  );
};

/* ──────────────── Agent Card ──────────────── */
const AgentCard = ({ listing: l, navigate }) => {
  const cat = String(l.category || 'other');
  const grad = CATEGORY_GRADIENTS[cat] || CATEGORY_GRADIENTS.other;

  return (
    <div
      className="group relative bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700/80 hover:bg-zinc-900/80 transition-all duration-200 cursor-pointer flex flex-col"
      onClick={() => navigate(`/developer/agent-marketplace/listing/${l.listingId}`)}
    >
      {/* Header row: icon + title + verified */}
      <div className="flex items-start gap-3 mb-3">
        {l.iconUrl ? (
          <img src={l.iconUrl} alt="" className="h-12 w-12 rounded-xl object-cover bg-zinc-800 flex-shrink-0 ring-1 ring-zinc-700/50" />
        ) : (
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-lg font-bold flex-shrink-0`}>
            {(l.title || 'A')[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-100 truncate text-[15px]">{l.title}</h3>
            {l.installedByMe && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-medium rounded-md flex-shrink-0">
                <FiCheck size={10} /> Installed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[12px] text-zinc-500 truncate">{l.publisher?.name || 'Independent'}</span>
            {l.publisher?.verificationLevel && <VerificationBadge level={l.publisher.verificationLevel} size="sm" />}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-[13px] text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
        {l.tagline || l.description || 'No description available.'}
      </p>

      {/* Category + tags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800/80 text-zinc-400 text-[11px] rounded-md font-medium">
          {CATEGORIES.find((c) => c.value === cat)?.icon} {cat.replace(/_/g, ' ')}
        </span>
        {(l.tags || []).slice(0, 2).map((t) => (
          <span key={t} className="px-2 py-0.5 bg-violet-500/10 text-violet-400 text-[11px] rounded-md font-medium">{t}</span>
        ))}
      </div>

      {/* Spacer pushes footer down */}
      <div className="flex-1" />

      {/* Stats + pricing row */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <div className="flex items-center gap-3 text-[12px] text-zinc-500">
          <StarRating rating={l.ratingAvg} />
          <span className="inline-flex items-center gap-1">
            <FiDownload size={11} /> {fmtInstalls(l.installCount ?? 0)}
          </span>
        </div>
        <span className="text-emerald-400 font-mono font-semibold text-[13px]">{fmtPrice(l)}</span>
      </div>

      {/* Hover arrow */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <FiArrowUpRight size={16} className="text-zinc-600" />
      </div>
    </div>
  );
};

/* ──────────────── Main Component ──────────────── */
const DevAgentMarketplace = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('ranking');
  const [pricing, setPricing] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(true);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.marketplaceBrowse({ search, category, sort, page: 1, perPage: 50 }),
    deps: [search, category, sort],
  });

  const rows = useMemo(() => {
    const all = data?.listings || [];
    if (!pricing) return all;
    return all.filter((l) => {
      if (pricing === 'free') return l.pricingModel === 'free';
      if (pricing === 'subscription') return l.pricingModel === 'subscription' || l.pricingModel === 'monthly';
      if (pricing === 'paid') return l.pricingModel !== 'free';
      return true;
    });
  }, [data, pricing]);

  const meta = data?.meta || {};
  const totalCount = meta.total ?? rows.length;

  if (loading && !data) return (
    <div>
      <Skeleton className="h-40 rounded-2xl mb-6" />
      <Skeleton className="h-12 rounded-xl mb-6" />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    </div>
  );
  if (error && !data) return <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />;

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Hero Header ── */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <FiPackage size={26} className="text-emerald-400" />
              Agent Store
            </h1>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-2xl leading-relaxed">
              Discover ready-to-use AI agents built by the community. Install once and use them immediately
              — each agent bundles the services it needs internally.
            </p>
          </div>
          <button
            onClick={() => refresh({ background: true })}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800/60 border border-zinc-700 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex-shrink-0"
          >
            <FiZap size={14} className={refreshing ? 'animate-pulse' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Info Banner ── */}
      {showInfoBanner && (
        <div className="mb-6 flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
          <FiInfo size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] text-zinc-300 leading-relaxed">
              <strong className="text-zinc-200">What is an Agent?</strong> An Agent is a complete AI application
              that combines multiple capabilities — such as LLMs, GPUs, OCR, storage, wallets, and workflows —
              into a single installable experience. Install it once and invoke it from your applications without
              configuring the underlying services.
            </p>
          </div>
          <button onClick={() => setShowInfoBanner(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* ── Search Bar ── */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <FiSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full bg-zinc-800/60 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600/40 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                <FiX size={14} />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-zinc-800/60 border border-zinc-700/80 rounded-xl px-3 py-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 appearance-none cursor-pointer"
          >
            {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-3 border rounded-xl text-sm transition-colors ${showFilters ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-800/60 border-zinc-700/80 text-zinc-400 hover:text-white hover:border-zinc-600'}`}
          >
            <FiFilter size={14} /> Filters
            <FiChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* ── Expanded Filters ── */}
        {showFilters && (
          <div className="mt-3 flex items-center gap-4 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Pricing</span>
            <div className="flex gap-1.5">
              {PRICING_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setPricing(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${pricing === f.value ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800/60 text-zinc-400 border border-transparent hover:text-zinc-200'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {pricing && (
              <button onClick={() => setPricing('')} className="text-[11px] text-zinc-500 hover:text-zinc-300 ml-1">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Category Chips ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 ${category === c.value
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-zinc-800/40 text-zinc-400 border border-transparent hover:bg-zinc-800/80 hover:text-zinc-200'
            }`}
          >
            {c.icon && <span className="text-[13px]">{c.icon}</span>}
            {c.label}
          </button>
        ))}
      </div>

      {/* ── Results Count ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-zinc-500">
          {totalCount} {totalCount === 1 ? 'agent' : 'agents'} found
        </p>
        {(search || category || pricing) && (
          <button
            onClick={() => { setSearch(''); setCategory(''); setPricing(''); }}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* ── Agent Grid ── */}
      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No agents found"
          description="Try a different search term, adjust your filters, or browse all agents."
          action={search || category || pricing ? { label: 'Clear filters', onClick: () => { setSearch(''); setCategory(''); setPricing(''); } } : undefined}
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((l) => (
            <AgentCard key={l.listingId} listing={l} navigate={navigate} />
          ))}
        </div>
      )}

      {/* ── Bottom spacer ── */}
      <div className="h-16" />
    </div>
  );
};

export default DevAgentMarketplace;
