import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiZap, FiSearch, FiClock, FiShield, FiCpu,
  FiDollarSign, FiAward, FiX, FiCheck, FiTrendingDown,
  FiChevronDown, FiTarget, FiZap as FiBolt, FiServer, FiStar
} from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import Modal from '../../components/dev/Modal';
import Pill from '../../components/dev/Pill';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

/* ───────────────────────── constants ───────────────────────── */

const CAPABILITIES = [
  'inference', 'training', 'imageGeneration', 'embeddings',
  'speech', 'ocr', 'translation', 'storage', 'compute', 'data'
];

const FILTER_CHIPS = [
  { id: 'capability', label: 'Capability', icon: FiCpu, type: 'select', options: CAPABILITIES },
  { id: 'maxPrice', label: 'Max Price', icon: FiDollarSign, type: 'number', placeholder: 'e.g. 0.001' },
  { id: 'verifiedOnly', label: 'Verified Only', icon: FiShield, type: 'toggle' },
  { id: 'lowestLatency', label: 'Lowest Latency', icon: FiBolt, type: 'toggle' },
  { id: 'highestUptime', label: 'Highest Uptime', icon: FiServer, type: 'toggle' }
];

const CATEGORY_CONFIG = {
  best: { label: 'Best Match', icon: FiTarget, color: 'blue', description: 'Highest overall AI score for your requirements' },
  cheapest: { label: 'Cheapest Alternative', icon: FiDollarSign, color: 'emerald', description: 'Best value — lowest cost with acceptable quality' },
  fastest: { label: 'Fastest Option', icon: FiBolt, color: 'amber', description: 'Lowest latency and fastest completion time' },
  enterprise: { label: 'Enterprise Recommendation', icon: FiShield, color: 'violet', description: 'Highest trust score, SLA, and compliance standards' }
};

const TRUST_TONE = (t) => (t == null ? 'zinc' : t >= 80 ? 'emerald' : t >= 50 ? 'amber' : 'red');

const PLACEHOLDER_PROMPTS = [
  'I need an OCR API for invoice processing under 0.001 BOT.',
  'Find me a cheap inference provider for Llama 3 70B with <100ms latency.',
  'I need image generation for product photos, verified providers only.',
  'Looking for the fastest embeddings API with low latency.',
  'I need translation services with 99.9% uptime SLA.'
];

/* ───────────────────────── helpers ───────────────────────── */

const fmt = (v, decimals = 4) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(decimals) : '—';
};

const fmtMs = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
};

const fmtPct = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n}%` : '—';
};

/* ───────────────────────── subcomponents ───────────────────────── */

const ProviderCard = ({ item, rank, category, onUse }) => {
  const cap = item.capabilities || {};
  const rep = item.reputation || {};
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.best;

  const colorMap = {
    blue: 'border-blue-800/40 bg-blue-950/10',
    emerald: 'border-emerald-800/40 bg-emerald-950/10',
    amber: 'border-amber-800/40 bg-amber-950/10',
    violet: 'border-violet-800/40 bg-violet-950/10'
  };

  const scoreColorMap = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400'
  };

  return (
    <div className={`group relative rounded-2xl border ${colorMap[config.color]} px-5 py-4 transition-all duration-200 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/20`}>
      {/* Rank badge */}
      <div className="absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
        <span className={`text-xs font-black ${scoreColorMap[config.color]}`}>{rank}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        {/* Left: provider info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <span className="text-sm font-semibold text-white truncate">{item.serviceTitle || item.serviceId}</span>
            {item.verified && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/40">
                <FiCheck size={9} /> Verified
              </span>
            )}
            {item.trustScore >= 80 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-800/40">
                <FiAward size={9} /> Trusted
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-500 mb-2.5">
            {item.provider?.name || item.provider?.agentId || 'Provider'}
            {item.serviceId && <span className="font-mono text-zinc-600 ml-1.5">· {item.serviceId}</span>}
          </p>

          {/* Metrics row */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            <span className="text-zinc-400">
              <FiDollarSign size={11} className="inline -mt-0.5 mr-0.5" />
              {fmt(item.unitPriceBOT)} <span className="text-zinc-600">BOT/{item.unitLabel || 'unit'}</span>
            </span>
            <span className="text-zinc-400">
              <FiClock size={11} className="inline -mt-0.5 mr-0.5" />
              {fmtMs(cap.averageLatencyMs)}
            </span>

            {cap.uptimePct != null && (
              <span className="text-zinc-400">
                <FiServer size={11} className="inline -mt-0.5 mr-0.5" />
                {fmtPct(cap.uptimePct)} uptime
              </span>
            )}
            {rep.trustScore != null && (
              <span className={`font-medium ${TRUST_TONE(rep.trustScore) === 'emerald' ? 'text-emerald-400' : TRUST_TONE(rep.trustScore) === 'amber' ? 'text-amber-400' : 'text-zinc-400'}`}>
                <FiAward size={11} className="inline -mt-0.5 mr-0.5" />
                Trust {rep.trustScore}
              </span>
            )}
            {cap.averageRating != null && (
              <span className="text-amber-400">
                <FiStar size={11} className="inline -mt-0.5 mr-0.5" />
                {cap.averageRating}
              </span>
            )}
          </div>

          {/* Why recommended */}
          {item.reasons?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.reasons.map((reason, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: score + actions */}
        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <div>
            <p className={`text-2xl font-black ${scoreColorMap[config.color]}`}>{item.confidence}%</p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">AI Score</p>
          </div>
          <p className="text-xs text-zinc-500">
            ~{fmt(item.estimatedCostBOT)} <span className="text-zinc-600">BOT est.</span>
          </p>
          <button
            type="button"
            onClick={() => onUse(item)}
            className="mt-1 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <FiZap size={11} /> Use Service
          </button>
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── main component ───────────────────────── */

const DevRecommendations = () => {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);

  // Buy modal state
  const [buyTarget, setBuyTarget] = useState(null);
  const [buyForm, setBuyForm] = useState({ consumerAgentId: '', quantity: '1' });
  const [buying, setBuying] = useState(false);

  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const agents = useMemo(() => agentsState.data?.agents || [], [agentsState.data]);

  const optimState = useApi({ fetcher: () => developerApi.commerceOptimization() });
  const savings = useMemo(() => {
    const items = optimState.data || [];
    return items.filter((o) => Number(o.estMonthlySavingsBOT) > 0).slice(0, 3);
  }, [optimState.data]);

  /* ── search ── */
  const search = async (e) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return toast.error('Describe what you need…');

    setLoading(true);
    setResult(null);
    setSearched(true);
    try {
      const requirements = {};
      if (activeFilters.capability) requirements.capability = activeFilters.capability;
      if (activeFilters.maxPrice) requirements.maxPrice = Number(activeFilters.maxPrice);
      if (activeFilters.verifiedOnly) requirements.verifiedOnly = true;
      if (activeFilters.lowestLatency) requirements.sortBy = 'latency';
      if (activeFilters.highestUptime) requirements.sortBy = 'uptime';

      const r = await developerApi.recommendProviders({ task: trimmed, requirements });
      setResult(r);
    } catch (err) {
      toast.error(err.message || 'Recommendation failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── categorize results ── */
  const categories = useMemo(() => {
    const items = result?.recommended || [];
    if (items.length === 0) return { best: [], cheapest: [], fastest: [], enterprise: [] };

    const byConfidence = [...items].sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    const byCost = [...items].sort((a, b) => (Number(a.unitPriceBOT) || 0) - (Number(b.unitPriceBOT) || 0) || (Number(a.estimatedCostBOT) || 0) - (Number(b.estimatedCostBOT) || 0));
    const bySpeed = [...items].sort((a, b) => (Number(a.capabilities?.averageLatencyMs) || 999999) - (Number(b.capabilities?.averageLatencyMs) || 999999) || (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    const byTrust = [...items].sort((a, b) => (Number(b.reputation?.trustScore) || -1) - (Number(a.reputation?.trustScore) || -1) || (Number(b.confidence) || 0) - (Number(a.confidence) || 0));

    return {
      best: byConfidence.slice(0, 3),
      cheapest: byCost.slice(0, 3),
      fastest: bySpeed.filter((x) => x !== byConfidence[0]).slice(0, 3),
      enterprise: byTrust.filter((x) => x !== byConfidence[0] && x !== byCost[0]).slice(0, 3)
    };
  }, [result]);

  /* ── savings potential ── */
  const potentialSavings = useMemo(() => {
    if (!result?.recommended?.length) return null;
    const items = result.recommended;
    const cheapest = items.reduce((min, x) => (Number(x.unitPriceBOT) || Infinity) < (Number(min.unitPriceBOT) || Infinity) ? x : min, items[0]);
    const best = items.reduce((max, x) => (Number(x.confidence) || 0) > (Number(max.confidence) || 0) ? x : max, items[0]);
    if (cheapest === best) return null;
    const priceDiff = (Number(best.unitPriceBOT) || 0) - (Number(cheapest.unitPriceBOT) || 0);
    if (priceDiff <= 0) return null;
    const pct = Math.round((priceDiff / (Number(best.unitPriceBOT) || 1)) * 100);
    return { cheapest, best, priceDiff, pct };
  }, [result]);

  /* ── buy modal ── */
  const buy = (item) => {
    setBuyTarget(item);
    setBuyForm({ consumerAgentId: '', quantity: String(item.estimatedQuantity ?? item.quantity ?? '1') });
  };

  const confirmBuy = async () => {
    if (!buyTarget) return;
    if (!buyForm.consumerAgentId) return toast.error('Select a consumer agent that will pay.');
    setBuying(true);
    try {
      const s = await developerApi.createCommerceSession({
        serviceId: buyTarget.serviceId,
        consumerAgentId: buyForm.consumerAgentId,
        quantity: buyForm.quantity,
        reason: result?.meta?.task,
        source: 'recommend'
      });
      toast.success(`Session ${s.sessionId} created — ${fmt(s.estimatedCostBOT)} BOT estimated`);
      setBuyTarget(null);
    } catch (err) {
      toast.error(err.message || 'Failed to create session');
    } finally {
      setBuying(false);
    }
  };

  const estimateCost = () => {
    if (!buyTarget) return 0;
    const qty = Number(buyForm.quantity) || 1;
    return (Number(buyTarget.estimatedCostBOT || 0) / Math.max(1, Number(buyTarget.estimatedQuantity) || 1) * qty);
  };

  const toggleFilter = (id, value) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '' || value === false) {
        delete next[id];
      } else {
        next[id] = value;
      }
      return next;
    });
    setOpenFilter(null);
  };

  const activeFilterCount = Object.keys(activeFilters).length;

  const inputClass = 'w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div>
      {/* ═══════ Hero Section ═══════ */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <FiZap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI Procurement Assistant</h1>
            <p className="text-sm text-zinc-500">Find the best providers for your AI workloads — scored, ranked, ready to use.</p>
          </div>
        </div>
      </div>

      {/* ═══════ Search Input ═══════ */}
      <div className="mb-6">
        <form onSubmit={search}>
          <div className="relative">
            <FiSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={PLACEHOLDER_PROMPTS[0]}
              className="w-full bg-zinc-900/80 border border-zinc-700 rounded-2xl pl-11 pr-32 py-4 text-base text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scoring…
                </>
              ) : (
                <>
                  <FiSearch size={14} />
                  Find Best Providers
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ═══════ Filter Chips ═══════ */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {FILTER_CHIPS.map((chip) => {
          const Icon = chip.icon;
          const isActive = activeFilters[chip.id] !== undefined && activeFilters[chip.id] !== '' && activeFilters[chip.id] !== false;
          return (
            <div key={chip.id} className="relative">
              <button
                type="button"
                onClick={() => setOpenFilter(openFilter === chip.id ? null : chip.id)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  isActive
                    ? 'bg-blue-600/15 border-blue-600/40 text-blue-300'
                    : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                <Icon size={12} />
                {chip.label}
                {isActive && chip.type !== 'toggle' && (
                  <span className="ml-0.5 text-[10px] text-blue-400/80">
                    {String(activeFilters[chip.id]).slice(0, 8)}
                  </span>
                )}
                <FiChevronDown size={10} className={`transition-transform ${openFilter === chip.id ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {openFilter === chip.id && (
                <div className="absolute z-50 mt-1.5 left-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/40 p-2 min-w-[180px]">
                  {chip.type === 'select' && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleFilter(chip.id, '')}
                        className="w-full text-left text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                      >
                        Any
                      </button>
                      {chip.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleFilter(chip.id, opt)}
                          className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            activeFilters[chip.id] === opt
                              ? 'bg-blue-600/20 text-blue-300'
                              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </>
                  )}
                  {chip.type === 'number' && (
                    <div className="px-2 py-1">
                      <input
                        type="number"
                        step="0.0001"
                        placeholder={chip.placeholder}
                        value={activeFilters[chip.id] || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') {
                            toggleFilter(chip.id, '');
                          } else {
                            setActiveFilters((p) => ({ ...p, [chip.id]: v }));
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') setOpenFilter(null); }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  )}
                  {chip.type === 'toggle' && (
                    <button
                      type="button"
                      onClick={() => toggleFilter(chip.id, !activeFilters[chip.id])}
                      className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                        activeFilters[chip.id] ? 'text-blue-300' : 'text-zinc-400'
                      } hover:bg-zinc-800 hover:text-white`}
                    >
                      <div className={`w-7 h-4 rounded-full transition-colors relative ${activeFilters[chip.id] ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${activeFilters[chip.id] ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                      </div>
                      {activeFilters[chip.id] ? 'On' : 'Off'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => { setActiveFilters({}); setOpenFilter(null); }}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5"
          >
            <FiX size={11} /> Clear all
          </button>
        )}
      </div>

      {/* ═══════ Loading State ═══════ */}
      {loading && (
        <div className="space-y-6">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      {/* ═══════ Empty State (before search) ═══════ */}
      {!loading && !searched && (
        <div className="text-center py-20">
          <div className="inline-flex w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-800/30 items-center justify-center mb-6">
            <FiZap size={32} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Describe what you need</h3>
          <p className="text-sm text-zinc-500 max-w-lg mx-auto mb-10 leading-relaxed">
            Tell the AI what service you're looking for. It will search the marketplace, score providers by price, uptime, and latency, then rank the best options.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {PLACEHOLDER_PROMPTS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setQuery(p)}
                className="flex items-center gap-3 text-left text-sm text-zinc-400 bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-600 hover:bg-zinc-900/80 hover:text-white transition-all group"
              >
                <FiZap size={14} className="text-zinc-600 group-hover:text-blue-400 transition-colors shrink-0" />
                <span className="line-clamp-2">{p}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ Empty State (no results) ═══════ */}
      {!loading && searched && result && (!result.recommended || result.recommended.length === 0) && (
        <div className="text-center py-16">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 items-center justify-center mb-5">
            <FiSearch size={28} className="text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-400 mb-2">No providers matched</h3>
          <p className="text-sm text-zinc-600 max-w-md mx-auto">
            Try adjusting your requirements or broadening your search. Providers appear when their capability profile matches your task.
          </p>
        </div>
      )}

      {/* ═══════ Results ═══════ */}
      {!loading && result && result.recommended?.length > 0 && (
        <>
          {/* Potential Savings Banner */}
          {potentialSavings && (
            <div className="mb-6 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-900/40 flex items-center justify-center shrink-0">
                <FiTrendingDown size={18} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-300">
                  Potential savings: {potentialSavings.pct}% less per call
                </p>
                <p className="text-xs text-emerald-400/60 mt-0.5">
                  Switching from <span className="text-emerald-400/80">{potentialSavings.best.serviceTitle}</span> to{' '}
                  <span className="text-emerald-400/80">{potentialSavings.cheapest.serviceTitle}</span> saves{' '}
                  <span className="font-semibold text-emerald-300">{fmt(potentialSavings.priceDiff)} BOT</span> per call with acceptable quality.
                </p>
              </div>
            </div>
          )}

          {/* Result summary */}
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-zinc-500">
              <span className="text-zinc-300 font-medium">{result.recommended.length} providers</span> scored for "{result.meta?.task || query}"
              {result.filters && Object.values(result.filters).some((v) => v > 0) && (
                <span className="ml-2 text-zinc-600">
                  · {Object.entries(result.filters).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </span>
              )}
            </p>
          </div>

          {/* Category sections */}
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const items = categories[key];
            if (!items || items.length === 0) return null;
            const Icon = config.icon;
            const colorMap = {
              blue: 'text-blue-400',
              emerald: 'text-emerald-400',
              amber: 'text-amber-400',
              violet: 'text-violet-400'
            };
            return (
              <div key={key} className="mb-8">
                <div className="flex items-center gap-2.5 mb-3">
                  <Icon size={16} className={colorMap[config.color]} />
                  <h2 className="text-base font-semibold text-white">{config.label}</h2>
                  <span className="text-xs text-zinc-600">— {config.description}</span>
                </div>
                <div className="space-y-3">
                  {items.map((item, i) => (
                    <ProviderCard key={item.serviceId} item={item} rank={i + 1} category={key} onUse={buy} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Meta footer */}
          {result.meta && (
            <div className="mt-8 pt-4 border-t border-zinc-800/60 flex items-center gap-4 text-[11px] text-zinc-600 font-mono">
              <span>task: {result.meta.task}</span>
              <span>·</span>
              <span>model: {result.meta.model}</span>
              {result.meta.monthlySpentBOT != null && (
                <>
                  <span>·</span>
                  <span>monthly spent: {fmt(result.meta.monthlySpentBOT)} BOT</span>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════ Optimization Insights (always visible) ═══════ */}
      {!loading && savings.length > 0 && (
        <div className="mt-8">
          <Card title="Cost Optimization" subtitle="Cheaper providers with equal or better capability profiles">
            <div className="space-y-2">
              {savings.map((o, i) => (
                <div key={i} className="bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                      <FiTrendingDown size={13} className="text-emerald-400 shrink-0" />
                      {o.serviceTitle || o.serviceId}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{o.reason}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400 shrink-0">
                    Save ~{fmt(o.estMonthlySavingsBOT)} BOT/mo
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ═══════ Buy Modal ═══════ */}
      <Modal
        open={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        title={buyTarget ? `Use ${buyTarget.serviceTitle}` : ''}
        subtitle={buyTarget ? `${buyTarget.provider?.name || buyTarget.provider?.agentId} · ${fmt(buyTarget.unitPriceBOT)} BOT / ${buyTarget.unitLabel || 'unit'}` : ''}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 font-medium mb-1.5">Consumer agent (pays) *</label>
            <select
              value={buyForm.consumerAgentId}
              onChange={(e) => setBuyForm((f) => ({ ...f, consumerAgentId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select an agent…</option>
              {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-medium mb-1.5">Quantity ({buyTarget?.unitLabel || 'unit'})</label>
            <input
              type="number"
              min="1"
              inputMode="decimal"
              value={buyForm.quantity}
              onChange={(e) => setBuyForm((f) => ({ ...f, quantity: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-sm text-zinc-400">Estimated cost</span>
            <span className="text-lg font-black text-gradient">{Number.isFinite(estimateCost()) ? estimateCost().toFixed(4) : '—'} BOT</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmBuy}
              disabled={buying}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
            >
              {buying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Reserving…
                </>
              ) : 'Reserve Purchase'}
            </button>
            <button
              type="button"
              onClick={() => setBuyTarget(null)}
              disabled={buying}
              className="px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <FiX size={14} />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DevRecommendations;
