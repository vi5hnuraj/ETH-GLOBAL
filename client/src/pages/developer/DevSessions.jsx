import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  FiRefreshCw, FiCheck, FiXCircle, FiClock, FiSearch, FiChevronDown,
  FiChevronRight, FiExternalLink, FiBox, FiZap, FiTrash2, FiShoppingBag,
  FiArrowRight, FiPackage, FiMoreHorizontal, FiFilter, FiArrowUpRight
} from 'react-icons/fi';
import StatCard from '../../components/dev/StatCard';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Pagination from '../../components/dev/Pagination';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import { SESSION_STATUS_META, TERMINAL_SESSION_STATUSES } from '../../utils/commerceStatus';
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE, initials, fmtBot, fmtWhen } from '../../utils/present';

// ---------------------------------------------------------------------------
// Status config — modern color palette
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  added_to_cart:      { label: 'Cart',         color: 'bg-zinc-500',   text: 'text-zinc-300',    bg: 'bg-zinc-500/10',  border: 'border-zinc-600/30' },
  awaiting_payment:   { label: 'Awaiting Payment', color: 'bg-amber-500', text: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  processing:         { label: 'Processing',    color: 'bg-blue-500',   text: 'text-blue-300',    bg: 'bg-blue-500/10',  border: 'border-blue-500/30' },
  paid:               { label: 'Paid',          color: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  active:             { label: 'Credits Granted', color: 'bg-cyan-500', text: 'text-cyan-300',    bg: 'bg-cyan-500/10',  border: 'border-cyan-500/30' },
  completed:          { label: 'Completed',     color: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  cancelled:          { label: 'Cancelled',     color: 'bg-red-500',    text: 'text-red-300',     bg: 'bg-red-500/10',   border: 'border-red-500/30' },
  failed:             { label: 'Failed',        color: 'bg-red-500',    text: 'text-red-300',     bg: 'bg-red-500/10',   border: 'border-red-500/30' },
  payment_failed:     { label: 'Failed',        color: 'bg-red-500',    text: 'text-red-300',     bg: 'bg-red-500/10',   border: 'border-red-500/30' },
  expired:            { label: 'Expired',       color: 'bg-zinc-500',   text: 'text-zinc-400',    bg: 'bg-zinc-500/10',  border: 'border-zinc-600/30' }
};

const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.expired;

// ---------------------------------------------------------------------------
// Segmented filter bar — primary + overflow
// ---------------------------------------------------------------------------

const PRIMARY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'added_to_cart', label: 'Cart' },
  { key: 'awaiting_payment', label: 'Awaiting Payment' },
  { key: 'paid', label: 'Paid' },
  { key: 'completed', label: 'Completed' }
];

const OVERFLOW_FILTERS = [
  { key: 'processing', label: 'Processing' },
  { key: 'active', label: 'Credits Granted' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'failed', label: 'Failed' },
  { key: 'expired', label: 'Expired' }
];

const FilterBar = ({ active, counts, total, onChange }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  // Close on outside click
  React.useEffect(() => {
    if (!moreOpen) return;
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const isOverflowActive = OVERFLOW_FILTERS.some((f) => f.key === active);

  return (
    <div className="flex items-center gap-1">
      {PRIMARY_FILTERS.map((f) => {
        const count = f.key === 'all' ? total : (counts[f.key] || 0);
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              active === f.key
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            {f.label}
            {count > 0 && <span className="ml-1.5 text-[10px] text-zinc-600">{count}</span>}
          </button>
        );
      })}

      {/* More dropdown */}
      <div className="relative" ref={moreRef}>
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isOverflowActive
              ? 'bg-white/10 text-white'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
          }`}
        >
          {isOverflowActive ? OVERFLOW_FILTERS.find((f) => f.key === active)?.label : 'More'}
          <FiChevronDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        {moreOpen && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/40 py-1 z-50">
            {OVERFLOW_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { onChange(f.key); setMoreOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  active === f.key ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] text-zinc-600">{counts[f.key] || 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Purchase row — compact, table-like
// ---------------------------------------------------------------------------

const PurchaseRow = ({ session, service, providerName, acting, onPay, onCancel, onRemove, onRetry, selectable, selected, onToggle }) => {
  const status = session.status;
  const title = service?.title || session.serviceId;
  const by = providerName || session.providerAgentId;
  const sc = getStatusConfig(status);
  const amount = session.actualCostBOT != null ? session.actualCostBOT : session.estimatedCostBOT;
  const isCart = status === 'added_to_cart';
  const categoryStyle = CATEGORY_STYLE[service?.category] || DEFAULT_CATEGORY_STYLE;

  const primaryAction = () => {
    if (isCart) return { label: 'Buy Now', onClick: () => onPay(session), color: 'bg-blue-600 hover:bg-blue-500' };
    if (status === 'awaiting_payment') return { label: 'Pay Now', onClick: () => onPay(session), color: 'bg-emerald-600 hover:bg-emerald-500' };
    if (status === 'active') return { label: 'View Details', to: `/developer/commerce/sessions/${session.sessionId}`, color: 'bg-cyan-600 hover:bg-cyan-500' };
    if (status === 'completed') return { label: 'View Details', to: `/developer/commerce/sessions/${session.sessionId}`, color: 'bg-zinc-700 hover:bg-zinc-600' };
    if (status === 'paid') return { label: 'View Details', to: `/developer/commerce/sessions/${session.sessionId}`, color: 'bg-zinc-700 hover:bg-zinc-600' };
    if (status === 'failed' || status === 'payment_failed') return { label: 'Retry', onClick: () => onRetry(session), color: 'bg-amber-600 hover:bg-amber-500' };
    return null;
  };

  const secondaryAction = () => {
    if (isCart) return { label: 'Remove', onClick: () => onRemove(session), icon: FiTrash2 };
    if (status === 'awaiting_payment') return { label: 'Cancel', onClick: () => onCancel(session), icon: FiXCircle };
    return null;
  };

  const primary = primaryAction();
  const secondary = secondaryAction();

  return (
    <div className={`group flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors hover:bg-white/[0.02] ${
      isCart ? 'border-zinc-700/50 bg-zinc-900/30' : 'border-zinc-800/50'
    }`}>
      {/* Checkbox (cart only) */}
      {isCart && selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 shrink-0"
        />
      )}

      {/* Service icon */}
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br text-[10px] font-bold ${categoryStyle}`}>
        {initials(title)}
      </div>

      {/* Service name + provider */}
      <div className="min-w-0 flex-1">
        <Link to={`/developer/commerce/sessions/${session.sessionId}`} className="block truncate text-sm font-medium text-white hover:text-blue-300 transition-colors" title={title}>
          {title}
        </Link>
        <p className="truncate text-[11px] text-zinc-500 mt-0.5">{by}</p>
      </div>

      {/* Quantity */}
      <div className="hidden sm:block text-right shrink-0 w-16">
        <span className="text-xs text-zinc-400">{session.quantity} {session.unit || 'unit'}{Number(session.quantity) > 1 ? 's' : ''}</span>
      </div>

      {/* Price */}
      <div className="text-right shrink-0 w-24">
        <span className="text-sm font-semibold text-white">{fmtBot(amount)} <span className="text-zinc-600 font-normal">USDC</span></span>
      </div>

      {/* Date */}
      <div className="hidden md:block text-right shrink-0 w-28">
        <span className="text-[11px] text-zinc-500">{fmtWhen(session.createdAt)}</span>
      </div>

      {/* Status badge */}
      <div className="shrink-0 w-28 flex justify-end">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold border ${sc.bg} ${sc.text} ${sc.border}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sc.color}`} />
          {sc.label}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            disabled={acting}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          >
            <secondary.icon size={11} /> {secondary.label}
          </button>
        )}
        {primary && (
          primary.to ? (
            <Link
              to={primary.to}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors ${primary.color}`}
            >
              {primary.label} <FiArrowUpRight size={10} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={primary.onClick}
              disabled={acting}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors disabled:opacity-40 ${primary.color}`}
            >
              {primary.label}
            </button>
          )
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Bulk purchase modal
// ---------------------------------------------------------------------------

const BulkPurchaseModal = ({ open, sessions, serviceMap, agents, onClose, onConfirm, busy }) => {
  const [consumerAgentId, setConsumerAgentId] = useState('');
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const total = useMemo(() => sessions.reduce((sum, s) => {
    const svc = serviceMap[s.serviceId];
    return sum + (Number(svc?.unitPriceBOT || 0) * Number(s.quantity || 1));
  }, 0), [sessions, serviceMap]);

  const onSelectAgent = async (id) => {
    setConsumerAgentId(id);
    setWallet(null);
    if (!id) return;
    setWalletLoading(true);
    try { setWallet(await developerApi.agentBalance(id)); } catch { /* ignore */ }
    setWalletLoading(false);
  };

  const walletBOT = wallet ? Number(String(wallet.balance ?? '').replace(/[^0-9.\-]/g, '')) : null;
  const insufficient = consumerAgentId && walletBOT != null && total > walletBOT;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg my-8 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-1">Buy {sessions.length} service{sessions.length > 1 ? 's' : ''}</h2>
        <p className="text-xs text-zinc-500 mb-4">Confirm payment for all selected cart items.</p>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {sessions.map((s) => {
            const svc = serviceMap[s.serviceId];
            return (
              <div key={s.sessionId} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
                <span className="text-sm text-white truncate">{svc?.title || s.serviceId}</span>
                <span className="text-xs text-zinc-400 shrink-0 ml-2">{fmtBot(Number(svc?.unitPriceBOT || 0) * Number(s.quantity || 1))} USDC</span>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 font-medium mb-1.5">Consumer agent (pays) *</label>
            <select value={consumerAgentId} onChange={(e) => onSelectAgent(e.target.value)} className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select an agent…</option>
              {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>)}
            </select>
            {walletLoading && <p className="text-[11px] text-zinc-500 mt-1">Loading balance…</p>}
            {walletBOT != null && (
              <p className={`text-[11px] mt-1 ${insufficient ? 'text-red-400' : 'text-emerald-400'}`}>
                Balance: {fmtBot(walletBOT)} USDC {insufficient && '— insufficient'}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3">
            <span className="text-sm text-zinc-400">Total</span>
            <span className={`text-lg font-black ${insufficient ? 'text-red-400' : 'text-gradient'}`}>{fmtBot(total)} USDC</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onConfirm(consumerAgentId)}
              disabled={busy || !consumerAgentId || insufficient}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              {busy ? 'Processing…' : `Confirm — ${fmtBot(total)} USDC`}
            </button>
            <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PER_PAGE = 20;

const DevSessions = () => {
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.commerceSessions({ perPage: 200 }) });
  const marketState = useApi({ fetcher: () => developerApi.marketplace({ perPage: 100 }) });
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });

  const sessions = useMemo(() => data?.sessions || [], [data]);
  const services = marketState.data?.services || [];
  const agents = agentsState.data?.agents || [];

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [selectedCartIds, setSelectedCartIds] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkMode, setBulkMode] = useState('selected');

  const serviceMap = useMemo(() => Object.fromEntries(services.map((s) => [s.serviceId, s])), [services]);
  const agentNameMap = useMemo(() => Object.fromEntries(agents.map((a) => [a.agentId, a.name])), [agents]);

  const providers = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      const svc = serviceMap[s.serviceId];
      const id = svc?.provider?.agentId || s.providerAgentId;
      if (id) map.set(id, svc?.provider?.name || id);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions, serviceMap]);

  const counts = useMemo(() => {
    const c = {};
    [...PRIMARY_FILTERS, ...OVERFLOW_FILTERS].forEach((f) => { if (f.key !== 'all') c[f.key] = 0; });
    sessions.forEach((s) => { if (c[s.status] !== undefined) c[s.status]++; });
    return c;
  }, [sessions]);

  const filtered = useMemo(() => {
    let list = sessions;
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    if (providerFilter !== 'all') list = list.filter((s) => {
      const svc = serviceMap[s.serviceId];
      return (svc?.provider?.agentId || s.providerAgentId) === providerFilter;
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => {
        const svc = serviceMap[s.serviceId];
        const by = svc?.provider?.name || agentNameMap[s.providerAgentId] || s.providerAgentId;
        return [svc?.title, svc?.category, by, s.serviceId, s.sessionId].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
    }
    // Sort
    const arr = [...list];
    if (sort === 'oldest') arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === 'price_high') arr.sort((a, b) => (Number(b.estimatedCostBOT) || 0) - (Number(a.estimatedCostBOT) || 0));
    else if (sort === 'price_low') arr.sort((a, b) => (Number(a.estimatedCostBOT) || 0) - (Number(b.estimatedCostBOT) || 0));
    else arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return arr;
  }, [sessions, statusFilter, providerFilter, search, sort, serviceMap, agentNameMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const cartSessions = useMemo(() => sessions.filter((s) => s.status === 'added_to_cart'), [sessions]);
  const showActionBar = cartSessions.length > 0 && (statusFilter === 'all' || statusFilter === 'added_to_cart');

  const toggleCartSelect = (id) => {
    setSelectedCartIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleAllCart = () => {
    setSelectedCartIds((prev) => prev.size === cartSessions.length ? new Set() : new Set(cartSessions.map((s) => s.sessionId)));
  };

  const act = async (sessionId, action, successMsg) => {
    setActing(`${sessionId}:${action}`);
    try {
      await developerApi.sessionAction(sessionId, action);
      toast.success(successMsg);
      if (action === 'cancel') setCancelTarget(null);
      refresh({ background: true });
    } catch (err) { toast.error(err.message || 'Action failed'); }
    finally { setActing(null); }
  };

  const pay = async (session) => {
    setActing(`${session.sessionId}:confirm`);
    try {
      const r = await developerApi.confirmPrepaidPurchase(session.sessionId);
      if (r.success) toast.success(`Paid ${fmtBot(r.amountBOT)} USDC — ${r.credits} credits granted.`);
      else toast.error(r.failureReason || 'Payment failed');
      refresh({ background: true });
    } catch (err) { toast.error(err.message || 'Payment failed'); refresh({ background: true }); }
    finally { setActing(null); }
  };

  const removeSession = async (session) => {
    setActing(`${session.sessionId}:cancel`);
    try {
      await developerApi.sessionAction(session.sessionId, 'cancel');
      toast.success('Removed from cart');
      setSelectedCartIds((prev) => { const n = new Set(prev); n.delete(session.sessionId); return n; });
      refresh({ background: true });
    } catch (err) { toast.error(err.message || 'Failed to remove'); }
    finally { setActing(null); }
  };

  const retryPurchase = async (session) => {
    setActing(`${session.sessionId}:retry`);
    try {
      const intent = await developerApi.prepaidIntent({ serviceId: session.serviceId, consumerAgentId: session.consumerAgentId, quantity: session.quantity || '1', reason: 'Retry purchase' });
      const r = await developerApi.confirmPrepaidPurchase(intent.sessionId);
      if (r.success) toast.success(`Paid ${fmtBot(r.amountBOT)} USDC — ${r.credits} credits granted.`);
      else toast.error(r.failureReason || 'Payment failed');
      refresh({ background: true });
    } catch (err) { toast.error(err.message || 'Retry failed'); refresh({ background: true }); }
    finally { setActing(null); }
  };

  const openBulkBuy = (mode) => { setBulkMode(mode); setBulkModal(true); };

  const confirmBulkBuy = async (consumerAgentId) => {
    if (!consumerAgentId) { toast.error('Select a consumer agent.'); return; }
    setActing('bulk');
    const toBuy = bulkMode === 'all' ? cartSessions : cartSessions.filter((s) => selectedCartIds.has(s.sessionId));
    let success = 0, failed = 0;
    for (const s of toBuy) {
      try {
        const intent = await developerApi.prepaidIntent({ serviceId: s.serviceId, consumerAgentId, quantity: s.quantity || '1', reason: `Cart — ${serviceMap[s.serviceId]?.title || s.serviceId}` });
        await developerApi.confirmPrepaidPurchase(intent.sessionId);
        success++;
      } catch { failed++; }
    }
    setBulkModal(false); setActing(null); setSelectedCartIds(new Set());
    if (success > 0) toast.success(`${success} purchase${success > 1 ? 's' : ''} completed.`);
    if (failed > 0) toast.error(`${failed} purchase${failed > 1 ? 's' : ''} failed.`);
    refresh({ background: true });
  };

  const hasActiveFilters = statusFilter !== 'all' || providerFilter !== 'all' || search.trim();

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Manage your service purchases, cart items, payments, and execution history."
        actions={<RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />}
      />

      {/* Summary cards — compact */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard icon={<FiShoppingBag size={16} />} label="In Cart" value={counts.added_to_cart || 0} accent="text-zinc-300" />
        <StatCard icon={<FiClock size={16} />} label="Awaiting Payment" value={counts.awaiting_payment || 0} accent="text-amber-400" />
        <StatCard icon={<FiCheck size={16} />} label="Paid" value={counts.paid || 0} accent="text-emerald-400" />
        <StatCard icon={<FiZap size={16} />} label="Credits Granted" value={counts.active || 0} accent="text-cyan-400" />
        <StatCard icon={<FiCheck size={16} />} label="Completed" value={counts.completed || 0} accent="text-emerald-400" />
      </div>

      {loading && !data ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : error && !data ? (
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={FiPackage}
          title="No purchases yet"
          description="Browse the marketplace and buy services, or add items to your cart for later."
          primary={{ label: 'Browse Marketplace', href: '/developer/marketplace', icon: <FiShoppingBag size={13} /> }}
        />
      ) : (
        <div className="space-y-4">
          {/* Filter + search toolbar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <FilterBar active={statusFilter} counts={counts} total={sessions.length} onChange={(f) => { setStatusFilter(f); setPage(1); setSelectedCartIds(new Set()); }} />

            <div className="flex items-center gap-2">
              <div className="relative">
                <FiSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search purchases…"
                  className="w-52 rounded-lg border border-zinc-800 bg-zinc-900/60 py-1.5 pl-8 pr-3 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none"
                />
              </div>
              <select
                value={providerFilter}
                onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-1.5 px-2.5 text-xs text-zinc-400 focus:border-zinc-600 focus:outline-none"
              >
                <option value="all">All providers</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-1.5 px-2.5 text-xs text-zinc-400 focus:border-zinc-600 focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="price_high">Price ↓</option>
                <option value="price_low">Price ↑</option>
              </select>
            </div>
          </div>

          {/* Results */}
          {pageItems.length === 0 ? (
            <div className="text-center py-12">
              <FiPackage size={24} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-400 mb-1">No purchases found</p>
              <p className="text-xs text-zinc-600">
                {hasActiveFilters ? (
                  <button onClick={() => { setStatusFilter('all'); setProviderFilter('all'); setSearch(''); setPage(1); }} className="text-blue-400 hover:text-blue-300">Clear filters</button>
                ) : 'Browse the marketplace to get started.'}
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                <div className="w-4" /> {/* checkbox spacer */}
                <div className="w-9" /> {/* icon spacer */}
                <div className="min-w-0 flex-1">Service</div>
                <div className="hidden sm:block text-right w-16">Qty</div>
                <div className="text-right w-24">Price</div>
                <div className="hidden md:block text-right w-28">Date</div>
                <div className="w-28 text-right">Status</div>
                <div className="w-28 text-right">Actions</div>
              </div>

              <div className="space-y-1">
                {pageItems.map((s) => (
                  <PurchaseRow
                    key={s.sessionId}
                    session={s}
                    service={serviceMap[s.serviceId]}
                    providerName={serviceMap[s.serviceId]?.provider?.name || agentNameMap[s.providerAgentId]}
                    acting={acting}
                    onPay={pay}
                    onCancel={(target) => setCancelTarget(target)}
                    onRemove={removeSession}
                    onRetry={retryPurchase}
                    selectable={s.status === 'added_to_cart'}
                    selected={selectedCartIds.has(s.sessionId)}
                    onToggle={() => toggleCartSelect(s.sessionId)}
                  />
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={filtered.length}
                perPage={PER_PAGE}
                onChange={(p) => setPage(Math.max(1, Math.min(totalPages, p)))}
              />
            </>
          )}

          {/* Sticky cart action bar */}
          {showActionBar && (
            <div className="sticky bottom-0 z-40 -mx-6 -mb-8 mt-4 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCartIds.size === cartSessions.length && cartSessions.length > 0}
                      onChange={toggleAllCart}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-xs text-zinc-400">{selectedCartIds.size} of {cartSessions.length} selected</span>
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gradient">{fmtBot(cartSessions.reduce((s, cs) => s + (Number(serviceMap[cs.serviceId]?.unitPriceBOT || 0) * Number(cs.quantity || 1)), 0))} USDC</span>
                  <Link to="/developer/marketplace" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Continue Shopping</Link>
                  {selectedCartIds.size > 0 && (
                    <button type="button" onClick={() => openBulkBuy('selected')} disabled={acting === 'bulk'} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      <FiZap size={11} /> Buy Selected
                    </button>
                  )}
                  {cartSessions.length > 1 && (
                    <button type="button" onClick={() => openBulkBuy('all')} disabled={acting === 'bulk'} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      Buy All
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && act(cancelTarget.sessionId, 'cancel', 'Purchase cancelled')}
        busy={acting === `${cancelTarget?.sessionId}:cancel`}
        title="Cancel this purchase?"
        description={cancelTarget ? <>Purchase <span className="text-white">{serviceMap[cancelTarget.serviceId]?.title || cancelTarget.serviceId}</span> will be cancelled.</> : ''}
        confirmLabel="Cancel purchase"
      />

      <BulkPurchaseModal
        open={bulkModal}
        sessions={bulkMode === 'all' ? cartSessions : cartSessions.filter((s) => selectedCartIds.has(s.sessionId))}
        serviceMap={serviceMap}
        agents={agents}
        onClose={() => setBulkModal(false)}
        onConfirm={confirmBulkBuy}
        busy={acting === 'bulk'}
      />
    </div>
  );
};

export default DevSessions;
