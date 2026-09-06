import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  FiRefreshCw, FiExternalLink, FiTrendingUp, FiFileText, FiSearch,
  FiCopy, FiChevronDown, FiFilter, FiMoreVertical
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import Pagination from '../../components/dev/Pagination';
import ExportButton from '../../components/dev/ExportButton';
import useApi from '../../hooks/useApi';
import useCurrentAccount from '../../hooks/useCurrentAccount';
import developerApi from '../../utils/developerApi';
import { INVOICE_STATUS_TONE } from '../../utils/commerceStatus';
import {
  CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE, initials, fmtBot, fmtWhen, invoiceNumber
} from '../../utils/present';

const selectCls =
  'rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none';
const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Compact stat — 80px target
// ---------------------------------------------------------------------------

const CompactStat = ({ label, value, accent = 'text-zinc-200' }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 min-h-[76px] flex flex-col justify-center">
    <p className={`truncate text-lg font-bold leading-tight font-mono ${accent}`}>{value}</p>
    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Status badge — small pill
// ---------------------------------------------------------------------------

const badgeFor = (inv) => {
  const overdue = inv.status === 'pending' && inv.dueAt && new Date(inv.dueAt) < new Date();
  if (inv.status === 'paid') return { label: 'Paid', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' };
  if (inv.status === 'pending') {
    return overdue
      ? { label: 'Overdue', cls: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' }
      : { label: 'Pending', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' };
  }
  if (inv.status === 'expired') return { label: 'Expired', cls: 'bg-zinc-800/70 text-zinc-400 border-zinc-700', dot: 'bg-zinc-500' };
  if (inv.status === 'cancelled') return { label: 'Cancelled', cls: 'bg-zinc-800/70 text-zinc-400 border-zinc-700', dot: 'bg-zinc-500' };
  if (inv.status === 'failed') return { label: 'Failed', cls: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' };
  return { label: inv.status, cls: 'bg-zinc-800/70 text-zinc-400 border-zinc-700', dot: 'bg-zinc-500' };
};

const StatusBadge = ({ inv }) => {
  const meta = badgeFor(inv);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${inv.status === 'pending' ? 'animate-pulse' : ''}`} />
      {meta.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Download PDF
// ---------------------------------------------------------------------------

const printInvoice = (inv, { service, consumerName, providerName }) => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoiceNumber(inv.invoiceId)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:40px auto;color:#111;padding:0 20px}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0ea5e9;padding-bottom:14px}
h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #eee}
.amount{font-weight:600;font-size:16px}.muted{color:#666;font-size:12px}</style></head><body>
<header><div><h1>GlobalPay Invoice</h1><p class="muted">${invoiceNumber(inv.invoiceId)}</p></div><div class="muted">Issued ${fmtWhen(inv.createdAt)}</div></header>
<table><tr><th>Service</th><td>${service?.title || '—'}</td></tr>
<tr><th>Consumer</th><td>${consumerName}</td></tr>
<tr><th>Provider</th><td>${providerName}</td></tr>
<tr><th>Usage</th><td>${inv.quantity} ${inv.unit || 'unit'}${inv.quantity > 1 ? 's' : ''}</td></tr>
<tr><th>Status</th><td>${inv.status === 'pending' ? 'Pending' : inv.status}</td></tr>
<tr><th>Total</th><td class="amount">${fmtBot(inv.amountBOT)} ${inv.currency || 'BOT'}</td></tr></table>
<p class="muted" style="margin-top:28px">Generated ${fmtWhen(new Date().toISOString())} · GlobalPay Developer Console</p></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => document.body.removeChild(frame), 2000); };
};

// ---------------------------------------------------------------------------
// Row menu — ⋮ dropdown
// ---------------------------------------------------------------------------

const RowMenu = ({ inv, names }) => {
  const [open, setOpen] = useState(false);
  const copyNum = async () => {
    try { await navigator.clipboard.writeText(inv.invoiceId); toast('Invoice ID copied', { icon: '📋' }); }
    catch { toast.error('Copy failed'); }
    setOpen(false);
  };
  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(inv, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${invoiceNumber(inv.invoiceId)}.json`;
    a.click(); URL.revokeObjectURL(url); setOpen(false);
  };
  return (
    <div className="relative shrink-0">
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
      <button
        type="button" onClick={() => setOpen(o => !o)} aria-label="Invoice actions"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <FiMoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-[200px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl shadow-black/40">
          <Link to={`/developer/marketplace/invoices/${inv.invoiceId}`} onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            <FiFileText size={12} className="text-zinc-500" /> Open
          </Link>
          <button type="button" onClick={() => { printInvoice(inv, names); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            <FiFileText size={12} className="text-zinc-500" /> Download PDF
          </button>
          <button type="button" onClick={downloadJSON}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            <FiFileText size={12} className="text-zinc-500" /> Download JSON
          </button>
          {inv.txHash && (
            <a href={inv.explorerUrl} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
              <FiExternalLink size={12} className="text-zinc-500" /> View Blockchain
            </a>
          )}
          <button type="button" onClick={copyNum}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            <FiCopy size={12} className="text-zinc-500" /> Copy Invoice ID
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// More Filters popover
// ---------------------------------------------------------------------------

const MoreFilters = ({ options, more, onChange, count }) => {
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => onChange({ ...more, [k]: e.target.value });
  return (
    <div className="relative shrink-0">
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${count ? 'border-blue-800/60 bg-blue-600/20 text-blue-300' : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'}`}>
        <FiFilter size={12} /> More {count > 0 && <span className="rounded-full bg-blue-500 px-1.5 text-[9px] font-bold text-white">{count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-[300px] space-y-2.5 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl shadow-black/40">
          <select aria-label="Provider" value={more.provider} onChange={set('provider')} className={`${selectCls} w-full`}>
            <option value="all">Provider — all</option>
            {options.providers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select aria-label="Consumer" value={more.consumer} onChange={set('consumer')} className={`${selectCls} w-full`}>
            <option value="all">Consumer — all</option>
            {options.consumers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select aria-label="Service" value={more.service} onChange={set('service')} className={`${selectCls} w-full`}>
            <option value="all">Service — all</option>
            {options.services.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Due between</p>
            <div className="flex items-center gap-2">
              <input type="date" value={more.dateFrom} onChange={set('dateFrom')} aria-label="From date" className={`${selectCls} w-full`} />
              <span className="text-zinc-600">→</span>
              <input type="date" value={more.dateTo} onChange={set('dateTo')} aria-label="To date" className={`${selectCls} w-full`} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Amount (BOT)</p>
            <div className="flex items-center gap-2">
              <input value={more.min} onChange={set('min')} placeholder="Min" inputMode="decimal" aria-label="Minimum amount" className={`${selectCls} w-full`} />
              <input value={more.max} onChange={set('max')} placeholder="Max" inputMode="decimal" aria-label="Maximum amount" className={`${selectCls} w-full`} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => onChange({ provider: 'all', consumer: 'all', service: 'all', dateFrom: '', dateTo: '', min: '', max: '' })}
              className="text-[11px] text-zinc-400 hover:text-white">Reset</button>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-500">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Invoice row — compact 72-84px
// ---------------------------------------------------------------------------

const InvoiceRow = ({ inv, service, consumerName, providerName }) => {
  const categoryStyle = CATEGORY_STYLE[service?.category] || DEFAULT_CATEGORY_STYLE;
  const title = service?.title || 'Unknown service';
  const overdue = inv.status === 'pending' && inv.dueAt && new Date(inv.dueAt) < new Date();
  const names = { service, consumerName, providerName };

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-3 py-2.5 transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-900/60 cursor-pointer min-h-[72px]">
      {/* Left: Avatar + Service + Meta */}
      <div className="flex min-w-0 items-center gap-2.5 flex-1 min-w-0">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[12px] font-bold text-white ${categoryStyle}`}>
          {initials(title)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link to={`/developer/marketplace/invoices/${inv.invoiceId}`}
              className="truncate text-sm font-semibold text-white hover:text-blue-300 transition-colors" title={title}>
              {title}
            </Link>
            {inv.isLegacy && (
              <span className="shrink-0 rounded border border-zinc-700 bg-zinc-800/70 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400"
                title="Pre-migration debt">
                Legacy
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[10px] uppercase tracking-wide text-zinc-600">{invoiceNumber(inv.invoiceId)}</p>
          <p className="text-[11px] text-zinc-500 truncate">
            Provider: <span className="text-zinc-300">{providerName}</span>
            {' · '}
            Buyer: <span className="text-zinc-300">{consumerName}</span>
          </p>
        </div>
      </div>

      {/* Right: Amount + Date + Status + Actions */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Amount */}
        <div className="text-right min-w-[90px]">
          <p className="font-mono text-sm font-semibold text-white">{fmtBot(inv.amountBOT)} BOT</p>
          <p className="text-[10px] text-zinc-600">{inv.quantity} {inv.unit || 'request'}{inv.quantity > 1 ? 's' : ''}</p>
        </div>

        {/* Date */}
        <div className="text-right min-w-[80px]">
          {overdue ? (
            <p className="text-[11px] font-medium text-amber-400">
              Due {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}
            </p>
          ) : inv.status === 'pending' ? (
            <p className="text-[11px] text-zinc-500">
              Due {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-zinc-400">{formatDate(inv.paidAt || inv.createdAt)}</p>
              <p className="text-[10px] text-zinc-600">{formatTime(inv.paidAt || inv.createdAt)}</p>
            </>
          )}
        </div>

        {/* Status */}
        <StatusBadge inv={inv} />

        {/* Actions */}
        <Link to={`/developer/marketplace/invoices/${inv.invoiceId}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-blue-400 shrink-0">
          View <span className="text-[13px] leading-none">→</span>
        </Link>

        <RowMenu inv={inv} names={names} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EMPTY_MORE = { provider: 'all', consumer: 'all', service: 'all', dateFrom: '', dateTo: '', min: '', max: '' };

const DevMarketInvoices = () => {
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [more, setMore] = useState(EMPTY_MORE);
  const [page, setPage] = useState(1);
  const [mobileFilters, setMobileFilters] = useState(false);

  const account = useCurrentAccount();

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.invoices({ role, perPage: 100 }),
    deps: [role, account.organizationId, account.developerId]
  });

  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }), deps: [account.organizationId, account.developerId] });
  const marketState = useApi({ fetcher: () => developerApi.marketplace({ perPage: 100 }), deps: [account.organizationId, account.developerId] });

  const invoices = data?.invoices || [];
  const serviceMap = useMemo(() => Object.fromEntries((marketState.data?.services || []).map((s) => [s.serviceId, s])), [marketState.data]);
  const agentNameMap = useMemo(() => Object.fromEntries((agentsState.data?.agents || []).map((a) => [a.agentId, a.name])), [agentsState.data]);

  const namesFor = useMemo(() => {
    const m = {};
    invoices.forEach((i) => {
      const svc = serviceMap[i.serviceId];
      m[i.invoiceId] = {
        service: svc,
        consumerName: agentNameMap[i.consumerAgentId] || 'Unknown Consumer',
        providerName: svc?.provider?.name || agentNameMap[i.providerAgentId] || 'Unknown Provider'
      };
    });
    return m;
  }, [invoices, serviceMap, agentNameMap]);

  const options = useMemo(() => {
    const providers = new Map(); const consumers = new Map(); const services = new Map();
    invoices.forEach((i) => {
      const n = namesFor[i.invoiceId];
      providers.set(i.providerAgentId, n.providerName);
      consumers.set(i.consumerAgentId, n.consumerName);
      services.set(i.serviceId, n.service?.title || i.serviceId);
    });
    return { providers: Array.from(providers.entries()), consumers: Array.from(consumers.entries()), services: Array.from(services.entries()) };
  }, [invoices, namesFor]);

  const filtered = useMemo(() => {
    const from = more.dateFrom ? new Date(more.dateFrom + 'T00:00:00') : null;
    const to = more.dateTo ? new Date(more.dateTo + 'T23:59:59') : null;
    const min = more.min === '' ? null : Number(more.min);
    const max = more.max === '' ? null : Number(more.max);
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      const n = namesFor[i.invoiceId];
      if (status !== 'all' && i.status !== status) return false;
      if (more.provider !== 'all' && i.providerAgentId !== more.provider) return false;
      if (more.consumer !== 'all' && i.consumerAgentId !== more.consumer) return false;
      if (more.service !== 'all' && i.serviceId !== more.service) return false;
      if (from && new Date(i.createdAt) < from) return false;
      if (to && new Date(i.createdAt) > to) return false;
      const amt = Number(i.amountBOT || 0);
      if (min !== null && Number.isFinite(min) && amt < min) return false;
      if (max !== null && Number.isFinite(max) && amt > max) return false;
      if (q) {
        const hay = [n.service?.title, n.providerName, n.consumerName, invoiceNumber(i.invoiceId), i.status]
          .filter(Boolean).map((x) => String(x).toLowerCase());
        if (!hay.some((x) => x.includes(q))) return false;
      }
      return true;
    });
  }, [invoices, status, search, more, namesFor]);

  const metrics = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    let revenueMonth = 0, totalSettled = 0, pending = 0, failed = 0, totalAmount = 0;
    invoices.forEach((i) => {
      const amt = Number(i.amountBOT || 0);
      totalAmount += amt;
      if (i.status === 'paid') { totalSettled += amt; if ((i.paidAt || i.createdAt || '').startsWith(monthKey)) revenueMonth += amt; }
      else if (i.status === 'pending') pending += amt;
      else if (['cancelled', 'expired', 'failed'].includes(i.status)) failed += 1;
    });
    return { revenueMonth, averageInvoice: invoices.length ? totalAmount / invoices.length : 0, pending, totalSettled, failed };
  }, [invoices]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const resetPage = () => setPage(1);
  const clearAll = () => { setStatus('all'); setSearch(''); setMore(EMPTY_MORE); resetPage(); };
  const activeFilterCount = [status !== 'all', search.trim(), Object.values(more).some((v) => (typeof v === 'string' ? v : false) && v !== 'all' && v !== '')].filter(Boolean).length;

  const exportColumns = [
    { key: 'invoiceId', label: 'Invoice' }, { key: 'serviceId', label: 'Service' },
    { key: 'consumerAgentId', label: 'Consumer' }, { key: 'providerAgentId', label: 'Provider' },
    { key: 'quantity', label: 'Quantity' }, { key: 'amountBOT', label: 'Amount (BOT)' },
    { key: 'status', label: 'Status' }, { key: 'createdAt', label: 'Created' },
    { key: 'paidAt', label: 'Paid' }, { key: 'txHash', label: 'Tx Hash' }
  ];

  const filterControls = (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="relative flex-1 min-w-[200px]">
        <FiSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          placeholder="Search invoices…"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 py-1.5 pl-8 pr-3 text-xs text-white placeholder-zinc-600 transition-colors focus:border-blue-600 focus:outline-none"
          aria-label="Search invoices" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }} aria-label="Filter by status" className={`${selectCls} !py-1.5`}>
          <option value="all">Status</option>
          {Object.keys(INVOICE_STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={role} onChange={(e) => { setRole(e.target.value); resetPage(); }} aria-label="Invoice role" className={`${selectCls} !py-1.5`}>
          <option value="all">Role</option>
          <option value="consumer">I owe</option>
          <option value="provider">Owed to me</option>
        </select>
        <MoreFilters options={options} more={more} onChange={setMore}
          count={[more.provider !== 'all', more.consumer !== 'all', more.service !== 'all', more.dateFrom || more.dateTo, more.min !== '' || more.max !== ''].filter(Boolean).length} />
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearAll} className="text-[11px] text-zinc-400 hover:text-white">Clear</button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Auto-generated from marketplace usage."
        actions={
          <>
            <ExportButton filename="invoices.csv" rows={filtered} columns={exportColumns} disabled={filtered.length === 0} />
            <RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />
          </>
        }
      />

      {/* Summary stats — 80px cards */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <CompactStat label="Revenue" value={`${metrics.revenueMonth.toFixed(4)} BOT`} accent="text-emerald-400" />
        <CompactStat label="Avg Invoice" value={`${metrics.averageInvoice.toFixed(4)} BOT`} accent="text-blue-400" />
        <CompactStat label="Pending" value={`${metrics.pending.toFixed(4)} BOT`} accent="text-amber-400" />
        <CompactStat label="Settled" value={`${metrics.totalSettled.toFixed(4)} BOT`} accent="text-emerald-400" />
        <CompactStat label="Failed" value={String(metrics.failed)} accent="text-red-400" />
      </div>

      {/* Filter toolbar */}
      <div className="mb-3">
        <div className="md:hidden">
          <button type="button" onClick={() => setMobileFilters(o => !o)}
            className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300">
            <FiFilter size={12} /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>
        <div className={mobileFilters ? 'block' : 'hidden md:block'}>{filterControls}</div>
      </div>

      {/* Results count */}
      {filtered.length > 0 && (
        <p className="mb-2 text-[10px] text-zinc-600">{filtered.length} invoice{filtered.length === 1 ? '' : 's'}</p>
      )}

      {/* Invoice rows */}
      {loading && !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : error && !data ? (
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FiTrendingUp}
          title="No invoices yet"
          description="Invoices will appear automatically after purchases."
          primary={{ label: 'Browse Marketplace', href: '/developer/marketplace', icon: <FiExternalLink size={13} /> }}
        />
      ) : pageItems.length === 0 ? (
        <EmptyState compact title="No invoices match your filters" description="Loosen a filter or clear the search." primary={{ label: 'Clear filters', onClick: clearAll }} />
      ) : (
        <>
          <div className="space-y-1">
            {pageItems.map((inv) => {
              const names = namesFor[inv.invoiceId];
              return (
                <InvoiceRow key={inv.invoiceId} inv={inv} service={names.service}
                  consumerName={names.consumerName} providerName={names.providerName} />
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE}
            onChange={(p) => setPage(Math.max(1, Math.min(totalPages, p)))} />
        </>
      )}
    </div>
  );
};

export default DevMarketInvoices;
