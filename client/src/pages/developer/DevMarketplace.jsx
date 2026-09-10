import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  FiShoppingBag, FiSearch, FiCpu, FiZap, FiBookOpen, FiPlus,
  FiTrendingUp, FiStar, FiX, FiShoppingCart, FiCheckCircle
} from 'react-icons/fi';
import StatCard from '../../components/dev/StatCard';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import Pagination from '../../components/dev/Pagination';
import Pill from '../../components/dev/Pill';
import VerificationBadge from '../../components/dev/VerificationBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const CATEGORY_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'ai-model', label: '🤖 AI Models' },
  { value: 'llm-inference', label: '🧠 LLM Inference' },
  { value: 'image-ai', label: '🎨 Image AI' },
  { value: 'vision', label: '👁️ Vision' },
  { value: 'speech', label: '🎤 Speech' },
  { value: 'translation', label: 'Translation' },
  { value: 'video', label: '🎬 Video' },
  { value: 'gpu', label: '⚡ GPU Compute' },
  { value: 'storage', label: 'Storage' },
  { value: 'data-api', label: '📊 Data APIs' },
  { value: 'security', label: '🔐 Security' },
  { value: 'web-search', label: '🌐 Web & Search' },
  { value: 'developer-tools', label: '🛠 Developer Tools' },
  { value: 'ai-agent', label: '🤖 AI Agents' },
  { value: 'other', label: 'Other' }
];

const PRICING_MODELS = ['per_unit', 'per_hour', 'per_request', 'per_char', 'per_mb_day', 'flat', 'subscription'];

// Quick credit presets per pricing model (flat/subscription are one-shot).
const QTY_PRESETS = {
  per_request: [100, 500, 1000, 5000, 10000],
  per_char: [10000, 50000, 100000, 500000, 1000000],
  per_unit: [1, 5, 10, 25, 100],
  per_hour: [1, 8, 24, 72, 168],
  per_mb_day: [1, 7, 30, 90, 365],
  flat: [1],
  subscription: [1]
};

const MODEL_LABEL = {
  per_request: 'Prepaid requests',
  per_unit: 'Prepaid units',
  per_hour: 'Prepaid hours',
  per_char: 'Prepaid characters',
  per_mb_day: 'Prepaid GB-days',
  flat: 'One-time purchase',
  subscription: 'Subscription'
};

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price · low → high' },
  { id: 'price_desc', label: 'Price · high → low' }
];

const input = 'bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50';
const PER_PAGE = 12;

const DevMarketplace = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [provider, setProvider] = useState('all');
  const [pricing, setPricing] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.marketplace({ perPage: 100 }),
    deps: [],
    retry: 2  // Retry twice on failure
  });
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const agents = useMemo(() => agentsState.data?.agents || [], [agentsState.data]);

  const [buying, setBuying] = useState(null);
  const [buyForm, setBuyForm] = useState({ consumerAgentId: '', quantity: '' });
  const [buyingBusy, setBuyingBusy] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletErr, setWalletErr] = useState(null);
  const [pendingSession, setPendingSession] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [addingToCart, setAddingToCart] = useState(null);

  const allServices = data?.services || [];
  const catalogLoaded = !!data;

  const providers = useMemo(() => {
    const map = new Map();
    allServices.forEach((s) => {
      const id = s.provider?.agentId || s.agentId;
      // Provider filters represent published services only. The backend
      // resolves provider.name to the owning organization when available.
      const organizationName = s.provider?.name;
      if (id && organizationName) map.set(id, organizationName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allServices]);

  const publishedProviderCount = useMemo(() => {
    const ids = new Set(allServices.map((s) => s.provider?.agentId || s.agentId).filter(Boolean));
    return ids.size;
  }, [allServices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const maxP = maxPrice === '' ? null : Number(maxPrice);
    return allServices.filter((s) => {
      if (q && !`${s.title} ${s.description || ''}`.toLowerCase().includes(q)) return false;
      if (category !== 'all' && s.category !== category) return false;
      if (provider !== 'all' && (s.provider?.agentId || s.agentId) !== provider) return false;
      if (pricing !== 'all' && s.pricingModel !== pricing) return false;
      if (maxP !== null && Number.isFinite(maxP) && s.unitPriceBOT > maxP) return false;
      return true;
    });
  }, [allServices, search, category, provider, pricing, maxPrice]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === 'price_asc') arr.sort((a, b) => a.unitPriceBOT - b.unitPriceBOT);
    else if (sort === 'price_desc') arr.sort((a, b) => b.unitPriceBOT - a.unitPriceBOT);
    else arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return arr;
  }, [filtered, sort]);

  const featured = useMemo(() =>
    [...allServices].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 3),
  [allServices]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageItems = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setSearch(''); setCategory('all'); setProvider('all'); setPricing('all'); setMaxPrice(''); setSort('newest'); setPage(1);
  };

  const hasFilters = search || category !== 'all' || provider !== 'all' || pricing !== 'all' || maxPrice !== '';

  const openBuy = (service) => {
    const isFlat = ['flat', 'subscription'].includes(service.pricingModel);
    const preset = (QTY_PRESETS[service.pricingModel] || QTY_PRESETS.per_unit)[0] ?? '1';
    setBuying(service);
    // flat/subscription are one-shot purchases: quantity is always 1.
    setBuyForm({ consumerAgentId: '', quantity: isFlat ? '1' : String(preset) });
    setWallet(null); setWalletErr(null);
  };

  const onSelectConsumer = async (agentId) => {
    setBuyForm((f) => ({ ...f, consumerAgentId: agentId }));
    if (!agentId) { setWallet(null); setWalletErr(null); return; }
    setWallet(null); setWalletLoading(true); setWalletErr(null);
    try {
      const w = await developerApi.agentBalance(agentId);
      setWallet(w);
    } catch (err) {
      setWalletErr(err.message || 'Could not load agent wallet balance.');
    } finally {
      setWalletLoading(false);
    }
  };

  const pickQuantity = (q) => setBuyForm((f) => ({ ...f, quantity: String(q) }));

  const createIntent = async () => {
    if (!buying) return;
    if (!buyForm.consumerAgentId) { toast.error('Select a consumer agent that will pay.'); return; }
    if (!(Number(buyForm.quantity) > 0)) { toast.error('Enter a quantity greater than zero.'); return; }
    setBuyingBusy(true);
    try {
      const session = await developerApi.prepaidIntent({
        serviceId: buying.serviceId,
        consumerAgentId: buyForm.consumerAgentId,
        quantity: buyForm.quantity,
        reason: `Prepaid purchase — ${buying.title}`
      });
      setPendingSession(session);
    } catch (err) {
      toast.error(err.message || 'Failed to prepare prepaid purchase.');
    } finally {
      setBuyingBusy(false);
    }
  };

  const [accessDetails, setAccessDetails] = useState(null);

  const confirmPayment = async () => {
    if (!pendingSession) return;
    setConfirmBusy(true);
    try {
      const r = await developerApi.confirmPrepaidPurchase(pendingSession.sessionId);
      if (r.success) {
        toast.success(`Paid ${Number(r.amountBOT || 0).toFixed(4)} USDC — invoice ${r.invoice?.invoiceId} paid, ${r.credits} credits granted.`);
        // Show access details if available
        if (r.accessKey || r.endpointUrl) {
          setAccessDetails({
            accessKey: r.accessKey,
            endpointUrl: r.endpointUrl,
            serviceId: buying?.serviceId,
            serviceTitle: buying?.title
          });
        }
      } else {
        toast.error(r.failureReason || 'Payment failed — no credits granted.');
      }
      setBuying(null);
      setPendingSession(null);
      refresh({ background: true });
    } catch (err) {
       if (err.payload && err.payload.session && err.payload.session.status === 'payment_failed') {
        toast.error(err.payload.message || err.message);
        setBuying(null);
        setPendingSession(null);
        refresh({ background: true });
      } else {
        toast.error(err.message || 'Failed to confirm payment.');
      }
    } finally {
      setConfirmBusy(false);
    }
  };

  const closeBuy = () => {
    if (buyingBusy || confirmBusy) return;
    setBuying(null);
    setPendingSession(null);
  };

  const costEstimate = buying ? (Number(buying.unitPriceBOT || 0) * (Number(buyForm.quantity) || 0)) : null;

  const handleAddToCart = async (service) => {
    if (!agents.length) {
      toast.error('Create an AI agent first — it will be the consumer that pays.');
      return;
    }
    const isFlat = ['flat', 'subscription'].includes(service.pricingModel);
    const preset = (QTY_PRESETS[service.pricingModel] || QTY_PRESETS.per_unit)[0] ?? 1;
    const quantity = isFlat ? 1 : preset;
    setAddingToCart(service.serviceId);
    try {
      await developerApi.createCommerceSession({
        serviceId: service.serviceId,
        consumerAgentId: agents[0].agentId,
        quantity: String(quantity),
        reason: `Added to cart — ${service.title}`,
        source: 'manual'
      });
      toast.success(`${service.title} added to cart`);
    } catch (err) {
      toast.error(err.message || 'Failed to add to cart');
    } finally {
      setAddingToCart(null);
    }
  };
  const walletBOT = wallet ? Number(String(wallet.balance ?? '').replace(/[^0-9.\-]/g, '')) : null;
  const insufficient = buyForm.consumerAgentId && walletBOT != null && costEstimate != null && walletBOT < costEstimate;
  const flatPick = buying && ['flat', 'subscription'].includes(buying.pricingModel);

  return (
    <div>
      <PageHeader
        title="AI Marketplace"
        subtitle="Discover services published by agents across the network. Prepaid purchases are settled instantly from the consumer agent wallet and grant credits immediately."
        actions={<RefreshButton className="px-3 py-1.5" onClick={() => refresh({ background: true })} refreshing={refreshing} />}
        compact
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard compact icon={<FiShoppingBag size={16} />} label="Listed Services" value={allServices.length} accent="text-blue-400" sub="Across all providers" />
        <StatCard compact icon={<FiStar size={16} />} label="Categories" value={CATEGORY_CHIPS.length - 1} accent="text-violet-400" sub="Browseable now" />
        <StatCard compact icon={<FiCpu size={16} />} label="Providers" value={publishedProviderCount} accent="text-emerald-400" sub="With published services" />
        <StatCard compact icon={<FiZap size={16} />} label="Lowest Price" value={allServices.length ? `${Number(Math.min(...allServices.map((s) => s.unitPriceBOT))).toFixed(4)} USDC` : '—'} accent="text-amber-400" sub="Per listed unit" />
      </div>

      {!catalogLoaded && loading ? (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        </div>
      ) : error && !catalogLoaded ? (
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      ) : (
        <>
          {/* Compact category filter — always visible, even when no services exist */}
          <div className="mb-5 rounded-xl border border-zinc-800/80 bg-zinc-950/35 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0 border-r border-zinc-800 pr-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Browse
              </span>
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by category">
                {CATEGORY_CHIPS.map((c) => {
                  const active = category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setCategory(c.value); resetPage(); }}
                      className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium leading-4 transition-all ${
                        active
                          ? 'border-blue-500/70 bg-blue-500/15 text-blue-200 shadow-sm shadow-blue-950/40'
                          : 'border-transparent bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Featured */}
          {allServices.length > 0 && featured.length > 0 && (
            <Card title="Featured services" subtitle="Freshly published, ready to purchase" className="mb-6" action={
              <Pill tone="amber" dot><FiTrendingUp size={11} /> Latest services</Pill>
            }>
              <div className="grid md:grid-cols-3 gap-4">
                {featured.map((s) => (
                  <ServiceCard key={s.serviceId} s={s} onBuy={() => openBuy(s)} onAddToCart={() => handleAddToCart(s)} addingToCart={addingToCart === s.serviceId} featured />
                ))}
              </div>
            </Card>
          )}

          <Card title="Browse" subtitle={`${sorted.length} service${sorted.length === 1 ? '' : 's'} match your filters`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="relative col-span-2 md:col-span-1">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={15} />
                <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} placeholder="Search services…" aria-label="Search services" className={`${input} w-full pl-9`} />
              </div>
              <select value={provider} onChange={(e) => { setProvider(e.target.value); resetPage(); }} aria-label="Filter by provider" className={input}>
                <option value="all">All providers</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={pricing} onChange={(e) => { setPricing(e.target.value); resetPage(); }} aria-label="Filter by service type" className={input}>
                <option value="all">All pricing models</option>
                {PRICING_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <input value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); resetPage(); }} placeholder="Max USDC" inputMode="decimal" aria-label="Maximum price in USDC" className={`${input} w-full`} />
                <select value={sort} onChange={(e) => { setSort(e.target.value); resetPage(); }} aria-label="Sort services" className={input}>
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {allServices.length === 0 ? (
              <EmptyState
                icon={FiShoppingBag}
                title="No services published yet."
                description="Publish your first AI service and start earning USDC automatically — or explore what the network already offers."
                primary={{ label: 'Publish Service', href: '/developer/marketplace/services', icon: <FiPlus size={13} /> }}
                secondary={{ label: 'Browse Documentation', href: '/developer/docs', icon: <FiBookOpen size={13} /> }}
              />
            ) : pageItems.length === 0 ? (
              <EmptyState
                icon={FiSearch}
                title="No services match your filters"
                description="Try widening the search, clearing a category, or raising the price ceiling."
                primary={{ label: 'Clear filters', onClick: clearFilters, icon: <FiX size={13} /> }}
              />
            ) : (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                  {pageItems.map((s) => <ServiceCard key={s.serviceId} s={s} onBuy={() => openBuy(s)} onAddToCart={() => handleAddToCart(s)} addingToCart={addingToCart === s.serviceId} />)}
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={sorted.length}
                  perPage={PER_PAGE}
                  onChange={(p) => setPage(Math.max(1, Math.min(totalPages, p)))}
                />
              </>
            )}
          </Card>
        </>
      )}

      {buying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={closeBuy}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-lg font-bold text-white">{pendingSession ? 'Confirm payment — ' + buying.title : 'Buy Now — ' + buying.title}</h2>
                {pendingSession ? (
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono truncate" title={pendingSession.sessionId}>{pendingSession.sessionId} · {pendingSession.status}</p>
                ) : (
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono truncate" title={buying.serviceId}>{buying.serviceId}</p>
                )}
                <Pill tone="emerald" dot className="mt-2">{pendingSession ? 'Credentials granted only after payment confirms' : 'Pay once · credits granted instantly'}</Pill>
              </div>
              <button type="button" onClick={closeBuy} className="text-zinc-500 hover:text-white p-1" aria-label="Close"><FiX size={18} /></button>
            </div>

            {!pendingSession ? (
              <>
                <p className="text-xs text-zinc-500 mb-4">{MODEL_LABEL[buying.pricingModel] || 'Prepaid credits'} · {Number(buying.unitPriceBOT ?? buying.unitPrice).toFixed(4)} USDC / {buying.unitLabel || 'unit'}</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-500 font-medium mb-1.5">Consumer agent (pays from its wallet) *</label>
                    <select value={buyForm.consumerAgentId} onChange={(e) => onSelectConsumer(e.target.value)} className={input + ' w-full'}>
                      <option value="">Select an agent…</option>
                      {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>)}
                    </select>
                    {buyForm.consumerAgentId && (walletLoading ? (
                      <p className="text-[11px] text-zinc-500 mt-1.5">Loading wallet balance…</p>
                    ) : walletErr ? (
                      <p className="text-[11px] text-red-400 mt-1.5">{walletErr}</p>
                    ) : wallet ? (
                      <p className={`text-[11px] mt-1.5 ${insufficient ? 'text-red-400' : 'text-emerald-400'}`}>
                        Wallet balance: <span className="font-mono">{Number(walletBOT).toFixed(4)} USDC</span>
                        {insufficient && ' — insufficient for this purchase'}
                      </p>
                    ) : null)}
                  </div>

                  {flatPick ? (
                    <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                      <span className="text-sm text-zinc-400">{buying.pricingModel === 'subscription' ? 'Billing period' : 'One-time purchase'}</span>
                      <span className="text-sm font-semibold text-white">1 {buying.unitLabel || 'unit'}</span>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-zinc-500 font-medium mb-1.5">Credits ({buying.unitLabel || 'units'})</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(QTY_PRESETS[buying.pricingModel] || QTY_PRESETS.per_unit).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => pickQuantity(q)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                              Number(buyForm.quantity) === q
                                ? 'bg-blue-600/20 text-blue-300 border-blue-800/60'
                                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                            }`}
                          >
                            {q >= 1000 ? `${q / 1000}K` : q}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Custom</span>
                        <input type="number" min="1" inputMode="decimal" value={buyForm.quantity} onChange={(e) => pickQuantity(e.target.value)} className={input + ' w-full'} aria-label="Custom credits quantity" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                    <span className="text-sm text-zinc-400">Total due now</span>
                    <span className={`text-lg font-black ${insufficient ? 'text-red-400' : 'text-gradient'}`}>{Number.isFinite(costEstimate) ? costEstimate.toFixed(4) : '—'} USDC</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={createIntent} disabled={buyingBusy || insufficient} className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                      {buyingBusy ? 'Preparing…' : `Review purchase — ${Number.isFinite(costEstimate) ? costEstimate.toFixed(4) : '0.0000'} USDC`}
                    </button>
                    <button type="button" onClick={closeBuy} disabled={buyingBusy} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
                  </div>
                  <p className="text-[11px] text-zinc-600">You'll confirm the charge on the next step. Nothing is debited until then. On confirmation the MPC wallet pays the provider, the invoice is marked paid and credits are granted on the purchase session.</p>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                  <span className="text-sm text-zinc-400">Service</span>
                  <span className="text-sm font-medium text-white">{buying.title}</span>
                </div>
                <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                  <span className="text-sm text-zinc-400">Credits purchased</span>
                  <span className="text-sm font-medium text-white">{pendingSession.quantity} {pendingSession.unit || 'unit(s)'}</span>
                </div>
                <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
                  <span className="text-sm text-zinc-400">Total debited from {buyForm.consumerAgentId || 'consumer'} wallet</span>
                  <span className="text-lg font-black text-gradient">{Number(pendingSession.estimatedCostBOT || 0).toFixed(4)} USDC</span>
                </div>
                {wallet && (
                  <p className={`text-[11px] ${insufficient ? 'text-red-400' : 'text-emerald-400'}`}>
                    Wallet balance: <span className="font-mono">{Number(walletBOT).toFixed(4)} USDC</span>
                    {insufficient && ' — insufficient for this purchase, payment will fail.'}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={confirmPayment} disabled={confirmBusy} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
                    {confirmBusy ? 'Processing payment…' : 'Confirm payment & grant credits'}
                  </button>
                  <button type="button" onClick={closeBuy} disabled={confirmBusy} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">Back</button>
                </div>
                <p className="text-[11px] text-zinc-600">By confirming you authorize a one-time charge of {Number(pendingSession.estimatedCostBOT || 0).toFixed(4)} USDC from the consumer agent wallet to {buying.provider?.name || 'the provider'}. If the wallet cannot cover it, no invoice is created and no credits are granted.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Access Details Modal — shown after successful purchase */}
      {accessDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                <FiCheckCircle size={20} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Service Access Granted</h3>
                <p className="text-xs text-zinc-400">You can now use {accessDetails.serviceTitle}</p>
              </div>
            </div>

            {accessDetails.endpointUrl && (
              <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 mb-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Service Endpoint</p>
                <p className="text-sm text-emerald-400 font-mono break-all">{accessDetails.endpointUrl}</p>
              </div>
            )}

            {accessDetails.accessKey && (
              <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 mb-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Your Access Key</p>
                <p className="text-sm text-amber-400 font-mono break-all">{accessDetails.accessKey}</p>
                <p className="text-[11px] text-zinc-600 mt-2">⚠️ Save this key — it cannot be recovered.</p>
              </div>
            )}

            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 mb-4">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">How to Use</p>
              <pre className="text-xs text-zinc-300 font-mono bg-zinc-900 rounded-lg p-3 overflow-x-auto">{`curl -X POST ${window.location.origin.replace('5173', '5550')}/api/services/${accessDetails.serviceId}/invoke \\
  -H "Authorization: Bearer ${accessDetails.accessKey || 'gpay_svc_...'}" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "your data here"}'`}</pre>
            </div>

            <button type="button" onClick={() => setAccessDetails(null)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ServiceCard = ({ s, onBuy, onAddToCart, addingToCart, featured }) => (
  <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 flex flex-col h-full hover:border-zinc-700 hover:bg-zinc-950 transition-colors group">
    <div className="flex items-center justify-between mb-2">
      <Pill tone={featured ? 'amber' : 'blue'}>{s.category}</Pill>
      <span className="text-[11px] text-zinc-500">{s.pricingModel}</span>
    </div>
    <Link to={`/developer/marketplace/service/${s.serviceId}`} className="hover:underline" title={s.title}>
      <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-white truncate">{s.title}</h3>
    </Link>
    <p className="text-xs text-zinc-500 mt-1 mb-3 line-clamp-2 flex-1">{s.description || 'No description.'}</p>
    {s.provider && (
      <div className="mt-3 space-y-2 border-t border-zinc-800/50 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-600 font-mono truncate" title={s.provider.wallet}>
             {s.provider?.name || s.provider?.agentId}
          </p>
        </div>
        {/* Agent Passport: identity + trust + settlement in one row */}
        <div className="flex flex-wrap gap-1.5">
          {s.humanBacked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
              ✓ Verified Human Publisher
            </span>
          )}
          {s.agentBookId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
              AgentBook ✓
            </span>
          )}

          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
            Arc Settlement
          </span>
          {s.requireX402 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400"
              title={`This API requires x402 payment per request — ${s.x402Price || '0.01'} USDC`}
            >
              ⚡ x402 {s.x402Price || '0.01'} USDC
            </span>
          )}
        </div>
        {/* Settlement stats — only show when genuine (jobs > 0, fresh snapshot) */}
        {(() => {
          const jobs = s.reputation?.completedJobs ?? 0;
          const fresh = s.reputation?.recomputedAt && (Date.now() - new Date(s.reputation.recomputedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
          const rate = s.reputation?.paymentSuccessRate;
          // paymentSuccessRate is stored as 0-1 in DB; display as percentage
          const ratePct = rate != null ? (rate <= 1 ? (rate * 100).toFixed(0) : Math.min(100, rate).toFixed(0)) : null;
          if (jobs <= 0 && !fresh) return null;
          return (
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              {jobs > 0 && <span title="Completed jobs">{jobs} jobs</span>}
              {ratePct && jobs > 0 && <span title="Success Rate" className={Number(ratePct) >= 90 ? 'text-emerald-400' : ''}>{ratePct}% success</span>}
              {Number(s.reputation.totalRevenueBOT) >= 0.01 && <span title="Revenue">Earned {Number(s.reputation.totalRevenueBOT).toFixed(2)} USDC</span>}
            </div>
          );
        })()}
        {(!s.reputation || s.reputation.completedJobs === 0) && s.humanBacked && (
          <p className="text-[10px] text-zinc-600">Newly published verified provider — settlement history builds with each transaction</p>
        )}
        {/* Why this provider? explainable trust reasoning */}
        {(() => {
          const reasons = [];
          if (s.humanBacked) reasons.push('Verified human publisher (World ID + AgentBook) — reduces counterparty risk');
          if (s.agentBookId) reasons.push('AgentBook registered on World Chain — wallet linked to verified identity');
          if (s.reputation?.completedJobs > 0) reasons.push(`${s.reputation.completedJobs} settlement(s) completed on Arc`);
          if (s.reputation?.paymentSuccessRate > 0 && s.reputation?.completedJobs > 0) { const rpct = s.reputation.paymentSuccessRate <= 1 ? (s.reputation.paymentSuccessRate * 100).toFixed(0) : Math.min(100, s.reputation.paymentSuccessRate).toFixed(0); reasons.push(`${rpct}% payment success rate`); }
          if (s.reputation?.repeatCustomers > 0) reasons.push(`${s.reputation.repeatCustomers} repeat buyer(s) — indicates provider reliability`);
          if (s.requireX402) reasons.push(`x402 micropayment required — ${s.x402Price || '0.01'} USDC per API call on Arc`);
          if (!reasons.length) return null;
          return (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold text-zinc-400">Why this provider?</p>
              <ul className="space-y-1">
                {reasons.map((r, i) => (
                  <li key={i} className="text-[10px] leading-relaxed text-zinc-500">• {r}</li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
    )}
    <div className="mt-auto pt-3 flex items-center justify-between">
      <div>
        <span className="text-gradient font-black text-lg">{Number(s.unitPriceBOT ?? s.unitPrice).toFixed(4)}</span>
        <span className="text-xs text-zinc-500"> USDC / {s.unitLabel || 'unit'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onBuy} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
          <FiShoppingBag size={13} /> Buy Now
        </button>
        <button type="button" onClick={onAddToCart} disabled={addingToCart} className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
          {addingToCart ? <div className="w-3 h-3 border-2 border-zinc-400 border-t-white rounded-full animate-spin" /> : <FiShoppingCart size={13} />} Add to Cart
        </button>
      </div>
    </div>
  </div>
);

export default DevMarketplace;
