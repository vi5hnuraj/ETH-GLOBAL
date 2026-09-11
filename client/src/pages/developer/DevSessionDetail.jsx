import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FiArrowLeft, FiCheck, FiPlay, FiXCircle, FiClock, FiExternalLink,
  FiCopy, FiChevronRight, FiRefreshCw, FiShoppingCart,
  FiCreditCard, FiMapPin, FiUser, FiCpu, FiTerminal, FiZap,
  FiTrash2
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Timeline from '../../components/dev/Timeline';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import ConfirmModal from '../../components/dev/ConfirmModal';
import { SESSION_STATUS_META, SESSION_FLOW, TERMINAL_SESSION_STATUSES } from '../../utils/commerceStatus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtBot = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n < 0.001) return String(parseFloat(n.toFixed(8)));
  if (n < 1) return String(parseFloat(n.toFixed(6)));
  return String(parseFloat(n.toFixed(4)));
};

const fmtWhen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${date} • ${time}`;
};

const fmtShort = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};

const fmtDuration = (sec) => {
  if (sec == null) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const pricingLabel = (svc) => {
  if (!svc) return null;
  const price = `${fmtBot(svc.unitPriceBOT)} USDC`;
  const unit = svc.unitLabel || 'unit';
  switch (svc.pricingModel) {
    case 'subscription': return `${price} / month`;
    case 'per_hour': return `${price} / hour`;
    case 'per_mb_day': return `${price} / MB·day`;
    case 'flat': return price;
    default: return `${price} / ${unit}`;
  }
};

const USER_STATUS_LABEL = {
  added_to_cart: 'Added to Cart',
  awaiting_payment: 'Awaiting Payment',
  processing: 'Processing Payment',
  paid: 'Paid',
  active: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  expired: 'Expired',
  payment_failed: 'Failed'
};

const ACTIVITY_LABELS = {
  'session.created': { label: 'Purchase created', tone: 'bg-blue-500' },
  'session.awaiting_payment': { label: 'Awaiting payment', tone: 'bg-amber-500' },
  'payment.confirmed': { label: 'Payment confirmed', tone: 'bg-emerald-500' },
  'session.started': { label: 'Started', tone: 'bg-emerald-400' },
  'session.completed': { label: 'Completed', tone: 'bg-sky-500' },
  'session.cancelled': { label: 'Cancelled', tone: 'bg-red-500' },
  'invoice.paid': { label: 'Invoice paid', tone: 'bg-emerald-500' },
  'invoice.created': { label: 'Invoice created', tone: 'bg-violet-500' },
  'payment.initiated': { label: 'Payment initiated', tone: 'bg-amber-500' },
  'invoice.cancelled': { label: 'Invoice cancelled', tone: 'bg-zinc-500' },
  'session.expired': { label: 'Expired', tone: 'bg-zinc-500' }
};

const prettify = (action) => String(action || 'event').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Small UI primitives
// ---------------------------------------------------------------------------

const SectionTitle = ({ children, className = '' }) => (
  <p className={`mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${className}`}>{children}</p>
);

const Card = ({ title, children, className = '', titleRight, id }) => (
  <div id={id} className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 ${className}`}>
    {title && (
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-zinc-200">{title}</h3>
        {titleRight}
      </div>
    )}
    {children}
  </div>
);

const KV = ({ k, children }) => (
  <div className="flex items-center justify-between gap-3 border-b border-zinc-800/50 py-1.5 last:border-0">
    <span className="text-xs text-zinc-500">{k}</span>
    <span className="text-right text-xs text-zinc-200">{children}</span>
  </div>
);

const CopyText = ({ value, className = '' }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Copied', { icon: '📋' });
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={copy} title={`Copy ${value}`} className={`group inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 hover:text-white ${className}`}>
      <span className="truncate">{value}</span>
      <FiCopy size={11} className="shrink-0 text-zinc-700 group-hover:text-zinc-400" />
    </button>
  );
};

const StatusBadge = ({ status }) => {
  const meta = SESSION_STATUS_META[status] || SESSION_STATUS_META.expired;
  const pulsating = ['awaiting_payment', 'processing'].includes(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.cls}`}>
      {pulsating ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        </span>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      )}
      {USER_STATUS_LABEL[status] || meta.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Timeline — adapts by status
// ---------------------------------------------------------------------------

const buildTimeline = (status, invoice, createdAt, startedAt, completedAt) => {
  const terminal = ['cancelled', 'failed', 'expired', 'payment_failed'].includes(status);
  const idx = SESSION_FLOW.indexOf(status);

  if (status === 'added_to_cart') {
    return [
      { label: 'Added to Cart', time: fmtShort(createdAt), state: 'done' },
      { label: 'Payment', time: undefined, state: 'pending' },
      { label: 'Credits Granted', time: undefined, state: 'pending' },
      { label: 'Completed', time: undefined, state: 'pending' }
    ];
  }

  const stateOf = (key) => {
    const pos = SESSION_FLOW.indexOf(key);
    if (terminal) return pos <= idx ? 'done' : 'skipped';
    return pos < idx ? 'done' : pos === idx ? 'active' : 'pending';
  };

  return [
    { label: 'Awaiting Payment', time: fmtShort(createdAt), state: stateOf('awaiting_payment') },
    { label: 'Paid', time: invoice?.paidAt ? fmtShort(invoice.paidAt) : completedAt ? fmtShort(completedAt) : undefined, state: stateOf('paid') },
    { label: 'Credits Granted', time: startedAt ? fmtShort(startedAt) : undefined, state: stateOf('active') },
    { label: 'Completed', time: fmtShort(completedAt), state: stateOf('completed') }
  ];
};

// ---------------------------------------------------------------------------
// Invoice section
// ---------------------------------------------------------------------------

const InvoiceSection = ({ invoice, service, onDownload }) => {
  if (!invoice) return null;
  const unitPrice = invoice.quantity > 0 ? Number(invoice.amountBOT || 0) / invoice.quantity : null;
  return (
    <Card title="Invoice" titleRight={<StatusBadge status={invoice.status === 'paid' ? 'paid' : 'cancelled'} />}>
      <div className="space-y-0">
        <KV k="Usage">{invoice.quantity} {invoice.unit || 'unit'}{invoice.quantity > 1 ? 's' : ''}</KV>
        {unitPrice != null && <KV k="Unit price">{fmtBot(unitPrice)} {invoice.currency || 'USDC'}</KV>}
        <KV k="Total"><span className="font-semibold text-white">{fmtBot(invoice.amountBOT)} {invoice.currency || 'USDC'}</span></KV>
        <KV k="Payment">{invoice.paidAt ? `Paid ${fmtShort(invoice.paidAt)}` : invoice.status}</KV>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => onDownload(invoice)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800">
          <FiCreditCard size={12} /> Download invoice
        </button>
        <Link to={`/developer/marketplace/invoices/${invoice.invoiceId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300">
          Details <FiExternalLink size={11} />
        </Link>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

const EventRow = ({ item }) => {
  const [open, setOpen] = useState(false);
  const known = ACTIVITY_LABELS[item.action] || { label: prettify(item.action), tone: 'bg-zinc-600' };
  const hasPayload = item.metadata && Object.keys(item.metadata).length;
  return (
    <div className="border-b border-zinc-800/50 py-2 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${known.tone}`} />
          <span className="truncate text-[13px] text-zinc-200">{known.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-zinc-500">{fmtWhen(item.createdAt)}</span>
          {hasPayload && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300">
              {open ? 'Hide' : 'Inspect'}
              <FiChevronRight size={11} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {open && hasPayload && (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-400">
          {JSON.stringify(item.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const DevSessionDetail = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data: session, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.commerceSession(sessionId) });
  const complianceState = useApi({ fetcher: () => developerApi.commerceCompliance() });
  const invoiceState = useApi({ fetcher: () => (session?.invoiceId ? developerApi.invoice(session.invoiceId) : Promise.resolve(null)), deps: [session?.invoiceId] });

  const s = session;
  const [acting, setActing] = useState(null);
  const [paying, setPaying] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmBuyAgain, setConfirmBuyAgain] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  const marketState = useApi({ fetcher: () => developerApi.marketplace({ perPage: 100 }) });
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const service = s ? (marketState.data?.services || []).find((x) => x.serviceId === s.serviceId) : undefined;
  const invoiceForDisplay = invoiceState.data && s && ['paid', 'active', 'completed'].includes(s.status)
    ? {
      ...invoiceState.data,
      status: 'paid',
      amountBOT: Number(invoiceState.data.amountBOT || s.actualCostBOT || s.estimatedCostBOT || 0) || 0,
      paidAt: invoiceState.data.paidAt || s.completedAt || s.updatedAt,
      txHash: invoiceState.data.txHash || s.paymentTxHash || null
    }
    : invoiceState.data;
  const agentName = (id) => {
    if (!id) return null;
    const a = (agentsState.data?.agents || []).find((x) => x.agentId === id);
    return a?.name || null;
  };

  const activity = useMemo(() => {
    if (!s || !complianceState.data) return [];
    return complianceState.data
      .filter((l) => l.resourceId === s.sessionId || l.metadata?.sessionId === s.sessionId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [complianceState.data, s]);

  const timelineSteps = useMemo(() => {
    if (!s) return [];
    return buildTimeline(s.status, invoiceState.data, s.createdAt, s.startedAt, s.completedAt);
  }, [s, invoiceState.data]);

  const duration = s?.startedAt && s?.completedAt
    ? (new Date(s.completedAt) - new Date(s.startedAt)) / 1000
    : null;

  const act = async (action, successMsg) => {
    setActing(action);
    try {
      await developerApi.sessionAction(sessionId, action);
      toast.success(successMsg);
      refresh({ background: true });
      complianceState.refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  const payNow = async () => {
    if (!s) return;
    setPaying(true);
    try {
      const r = await developerApi.confirmPrepaidPurchase(s.sessionId);
      if (r.success) {
        toast.success(`Paid ${fmtBot(r.amountBOT)} USDC — ${r.credits} credits granted.`);
      } else {
        toast.error(r.failureReason || 'Payment failed');
      }
      invoiceState.refresh({ background: true });
      refresh({ background: true });
      complianceState.refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Payment failed');
      refresh({ background: true });
    } finally {
      setPaying(false);
    }
  };

  const removePurchase = async () => {
    setActing('cancel');
    try {
      await developerApi.sessionAction(sessionId, 'cancel');
      toast.success('Removed from cart');
      navigate('/developer/commerce/sessions');
    } catch (err) {
      toast.error(err.message || 'Failed to remove');
    } finally {
      setActing(null);
      setConfirmRemove(false);
    }
  };

  const buyAgain = async () => {
    if (!s) return;
    setActing('reorder');
    try {
      const intent = await developerApi.prepaidIntent({
        serviceId: s.serviceId,
        consumerAgentId: s.consumerAgentId,
        quantity: s.quantity || '1',
        reason: 'Reorder from previous purchase'
      });
      const r = await developerApi.confirmPrepaidPurchase(intent.sessionId);
      const targetId = r.session && (r.session.sessionId || r.session);
      if (r.success) {
        toast.success(`Paid ${fmtBot(r.amountBOT)} USDC — ${r.credits} credits granted.`);
      } else {
        toast.error(r.failureReason || 'Payment failed');
      }
      navigate(`/developer/commerce/sessions/${typeof targetId === 'object' ? targetId.sessionId : targetId}`);
    } catch (err) {
      toast.error(err.message || 'Could not start a new purchase');
    } finally {
      setActing(null);
      setConfirmBuyAgain(false);
    }
  };

  const downloadInvoice = (inv) => {
    const now = new Date();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoiceId}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:40px auto;color:#111;padding:0 20px}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0ea5e9;padding-bottom:14px}
h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #eee}
.amount{font-weight:600;font-size:16px}.muted{color:#666;font-size:12px}</style></head><body>
<header><div><h1>GlobalPay Invoice</h1><p class="muted">${inv.invoiceId}</p></div><div class="muted">Issued ${fmtWhen(inv.createdAt)}</div></header>
<table><tr><th>Service</th><td>${service?.title || inv.serviceId}</td></tr>
<tr><th>Usage</th><td>${inv.quantity} ${inv.unit || 'unit'}${inv.quantity > 1 ? 's' : ''}</td></tr>
<tr><th>Status</th><td>${inv.status}</td></tr>
<tr><th>Total</th><td class="amount">${fmtBot(inv.amountBOT)} ${inv.currency || 'USDC'}</td></tr></table>
<p class="muted" style="margin-top:28px">Generated ${now.toLocaleString()} · GlobalPay Developer Console</p></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${inv.invoiceId}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Invoice downloaded');
  };

  if (loading && !session) return <Skeleton className="h-72 rounded-xl" />;
  if (error && !session) return (
    <div>
      <Link to="/developer/commerce/sessions" className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
        <FiArrowLeft size={14} /> Purchases
      </Link>
      <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
    </div>
  );

  const title = service?.title || s.serviceId;
  const providerName = service?.provider?.name || agentName(s.providerAgentId) || s.providerAgentId;
  const consumerName = agentName(s.consumerAgentId) || s.consumerAgentId;
  const region = service?.metadata?.region || service?.metadata?.location;
  const isCart = s.status === 'added_to_cart';

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Link to="/developer/commerce/sessions" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white">
        <FiArrowLeft size={13} /> Purchases
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-xl font-bold text-white">{title}</h1>
            <StatusBadge status={s.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>by {providerName}</span>
            <span className="inline-flex items-center gap-1"><FiClock size={11} /> Purchased {fmtWhen(s.createdAt)}</span>
            <span>Est. {fmtBot(s.estimatedCostBOT)} USDC</span>
            <CopyText value={s.sessionId} className="text-zinc-600 hover:text-zinc-300" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => refresh({ background: true })} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-50" title="Refresh">
            <FiRefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>

          {isCart && (
            <>
              <button onClick={() => setConfirmRemove(true)} disabled={acting} className="inline-flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-950 disabled:opacity-50">
                <FiTrash2 size={13} /> Remove
              </button>
              <button onClick={payNow} disabled={acting || paying} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                <FiZap size={13} /> Buy Now
              </button>
            </>
          )}

          {s.status === 'awaiting_payment' && (
            <>
              <button onClick={payNow} disabled={acting || paying} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50">
                <FiCheck size={13} /> {paying ? 'Paying…' : 'Pay Now'}
              </button>
              <button onClick={() => setConfirmCancel(true)} disabled={acting} className="inline-flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-950 disabled:opacity-50">
                <FiXCircle size={13} /> Cancel
              </button>
            </>
          )}

          {(s.status === 'paid' || s.status === 'active' || s.status === 'completed') && (
            <button onClick={() => setConfirmBuyAgain(true)} disabled={acting === 'reorder'} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
              <FiShoppingCart size={13} /> Buy Again
            </button>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <SectionTitle>Status</SectionTitle>
          <div className="flex h-6 items-center"><StatusBadge status={s.status} /></div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <SectionTitle>Cost</SectionTitle>
          <p className="text-sm font-bold text-white">
            {s.actualCostBOT != null ? `${fmtBot(s.actualCostBOT)} USDC` : `${fmtBot(s.estimatedCostBOT)} USDC est.`}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{s.quantity} {s.unit || 'unit'}{Number(s.quantity) > 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <SectionTitle>Invoice</SectionTitle>
          {s.invoiceId ? (
            <div className="flex h-6 items-center">
              <Link to={`/developer/marketplace/invoices/${s.invoiceId}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-400 hover:text-blue-300">
                {s.invoiceId} <FiExternalLink size={11} />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Not generated</p>
          )}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <SectionTitle>Execution Time</SectionTitle>
          <p className="text-sm font-bold text-white">{duration != null ? fmtDuration(duration) : (s.startedAt ? 'Running…' : 'Not started')}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{s.startedAt ? fmtShort(s.startedAt) : '—'}</p>
        </div>
      </div>

      {/* Main: 70 / 30 */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left — Timeline + Activity */}
        <div className="col-span-12 space-y-4 xl:col-span-7">
          <Card title="Purchase Timeline" titleRight={<span className="text-[11px] font-medium text-zinc-500">{USER_STATUS_LABEL[s.status]}</span>}>
            <Timeline steps={timelineSteps} compact />
          </Card>

          <Card id="session-activity" title="Activity" titleRight={<span className="text-[11px] text-zinc-500">{activity.length} events</span>}>
            {activity.length ? (
              <div className="divide-y divide-zinc-800/50">
                {activity.map((l) => <EventRow key={l.id} item={l} />)}
              </div>
            ) : (
              <p className="py-2 text-xs text-zinc-500">No events recorded yet.</p>
            )}
          </Card>
        </div>

        {/* Right — Product + Invoice + Developer details */}
        <div className="col-span-12 space-y-4 xl:col-span-5">
          <Card title="Purchase Details">
            <div className="space-y-0">
              <KV k="Service"><span className="font-medium text-zinc-100">{service?.title || s.serviceId}</span></KV>
              <KV k="Provider"><span className="inline-flex items-center gap-1"><FiUser size={11} className="text-zinc-600" /> {providerName}</span></KV>
              <KV k="Consumer"><span className="inline-flex items-center gap-1"><FiCpu size={11} className="text-zinc-600" /> {consumerName}</span></KV>
              {region && <KV k="Region"><span className="inline-flex items-center gap-1"><FiMapPin size={11} className="text-zinc-600" /> {region}</span></KV>}
              <KV k="Pricing">{service ? pricingLabel(service) : (s.unit ? `${s.unit}-based` : '—')}</KV>
              <KV k="Credits"><span className="inline-flex items-center gap-1 font-semibold text-emerald-300"><FiZap size={11} /> {s.quantity} {s.unit || 'unit'}{Number(s.quantity) > 1 ? 's' : ''}</span></KV>
              <KV k="Payment"><span className={s.status === 'paid' || s.status === 'active' || s.status === 'completed' ? 'text-emerald-300' : 'text-amber-300'}>{isCart ? 'Pending' : 'Paid before use'}</span></KV>
            </div>
          </Card>

          <InvoiceSection invoice={invoiceForDisplay} service={service} onDownload={downloadInvoice} />

          {/* Developer details */}
          <Card
            title="Purchase ID"
            titleRight={
              <button type="button" onClick={() => setDevOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200">
                {devOpen ? 'Hide' : 'Show'}
                <FiChevronRight size={11} className={`transition-transform ${devOpen ? 'rotate-90' : ''}`} />
              </button>
            }
          >
            {devOpen ? (
              <>
                <p className="mb-2 text-[11px] text-zinc-600">Internal identifiers for debugging.</p>
                <div className="space-y-0">
                  <KV k="Purchase ID"><CopyText value={s.sessionId} /></KV>
                  <KV k="Service ID"><CopyText value={s.serviceId} /></KV>
                  <KV k="Consumer Agent"><CopyText value={s.consumerAgentId} /></KV>
                  <KV k="Provider Agent"><CopyText value={s.providerAgentId} /></KV>
                  <KV k="Transaction Hash">
                    {s.paymentTxHash ? (
                      s.explorerUrl ? (
                        <a href={s.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-400 hover:text-blue-300">
                          <span className="max-w-[160px] truncate">{s.paymentTxHash}</span> <FiExternalLink size={11} />
                        </a>
                      ) : <CopyText value={s.paymentTxHash} />
                    ) : <span className="font-mono text-[11px] text-zinc-600">—</span>}
                  </KV>
                  <KV k="Invoice ID">
                    {s.invoiceId ? (
                      <Link to={`/developer/marketplace/invoices/${s.invoiceId}`} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-400 hover:text-blue-300">
                        {s.invoiceId} <FiExternalLink size={11} />
                      </Link>
                    ) : <span className="font-mono text-[11px] text-zinc-600">—</span>}
                  </KV>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-600">Hidden — available for debugging when needed.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Confirm modals */}
      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => { setConfirmCancel(false); act('cancel', 'Purchase cancelled'); }}
        busy={acting === 'cancel'}
        title="Cancel this purchase?"
        description={`${title} will be cancelled. No invoice will be generated.`}
        confirmLabel="Cancel purchase"
      />
      <ConfirmModal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={removePurchase}
        busy={acting === 'cancel'}
        title="Remove from cart?"
        description={`${title} will be removed from your cart.`}
        confirmLabel="Remove"
      />
      <ConfirmModal
        open={confirmBuyAgain}
        onClose={() => setConfirmBuyAgain(false)}
        onConfirm={buyAgain}
        busy={acting === 'reorder'}
        title="Buy this again?"
        description={`Start a new purchase of ${title} from the same provider.`}
        confirmLabel="Buy again"
      />
    </div>
  );
};

export default DevSessionDetail;
