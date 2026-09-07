import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router-dom';
import {
  FiArrowLeft, FiExternalLink, FiCheckCircle, FiFileText, FiCreditCard,
  FiClock, FiDollarSign, FiUser, FiShield, FiAlertCircle, FiChevronDown,
  FiChevronUp, FiCopy, FiRefreshCw
} from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import { SESSION_STATUS_META } from '../../utils/commerceStatus';
import { fmtBot, fmtWhen, invoiceNumber, initials } from '../../utils/present';

const STATUS_ORDER = ['Purchase Created', 'Payment Confirmed', 'Credits Granted', 'Invoice Finalized'];
const FAILED_STATUS_ORDER = ['Purchase Created', 'Payment Failed', 'Credits Not Granted'];

const formatAmountSafe = (wei) => {
  if (!wei && wei !== 0) return '—';
  try { return fmtBot(wei); } catch { return '—'; }
};

const formatDateSafe = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '—'; }
};

const formatTimeSafe = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; }
};

const formatDateTimeSafe = (iso) => {
  if (!iso) return '—';
  try { return fmtWhen(iso); } catch { return '—'; }
};

const getStatusMeta = (status) => SESSION_STATUS_META[status] || SESSION_STATUS_META.failed;

const TruncateId = ({ id, label }) => {
  const full = id || '—';
  const short = full.length > 18 ? `${full.slice(0, 8)}...${full.slice(-6)}` : full;
  const copy = () => { navigator.clipboard.writeText(full); toast.success(`${label || 'ID'} copied`); };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
      <span title={full}>{short}</span>
      <button onClick={copy} className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Copy">
        <FiCopy size={10} />
      </button>
    </span>
  );
};

const DevInvoiceDetail = () => {
  const { invoiceId } = useParams();
  const [showDevDetails, setShowDevDetails] = useState(false);

  const { data: invoiceRes, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.invoice(invoiceId)
  });
  const invoice = invoiceRes?.invoice;

  const { data: agentsData } = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const { data: servicesData } = useApi({ fetcher: () => developerApi.marketplace({ perPage: 100 }) });
  const { data: complianceData } = useApi({ fetcher: () => developerApi.commerceCompliance() });

  const agents = agentsData?.agents || [];
  const services = servicesData?.services || [];
  const consumerAgent = agents.find(a => a.agentId === invoice?.consumerAgentId);
  const providerAgent = agents.find(a => a.agentId === invoice?.providerAgentId);
  const service = services.find(s => s.serviceId === invoice?.serviceId);

  const statusMeta = invoice ? getStatusMeta(invoice.status) : SESSION_STATUS_META.failed;
  const isPaid = invoice?.status === 'paid';
  const isPending = invoice?.status === 'pending';

  const timelineSteps = useMemo(() => {
    if (!invoice) return [];
    const isFailed = ['failed', 'cancelled', 'expired'].includes(invoice.status);
    const base = isPaid ? STATUS_ORDER : FAILED_STATUS_ORDER;
    return base.map((label, idx) => ({
      label,
      time: idx === 0 ? invoice.createdAt : invoice.paidAt,
      state: isPaid || (!isFailed && idx < 2) ? 'done' : isFailed && idx === 1 ? 'error' : 'pending'
    }));
  }, [invoice]);

  const paymentMethod = useMemo(() => {
    if (!invoice || !isPaid) return null;
    return {
      method: 'Internal MPC Wallet',
      wallet: consumerAgent?.wallet || '0x144A...',
      amount: formatAmountSafe(invoice.amountBOT),
      status: 'Paid',
      txHash: invoice.txHash
    };
  }, [invoice, consumerAgent, isPaid]);

  if (loading && !invoice) return <Skeleton className="h-96 rounded-2xl" />;
  if (error && !invoice) return (
    <div>
      <PageHeader title="Invoice" subtitle={invoiceId} />
      <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
    </div>
  );
  if (!invoice) return (
    <div>
      <PageHeader title="Invoice Not Found" subtitle="The invoice may have been deleted or the link is invalid." />
      <div className="text-center py-12">
        <FiFileText size={48} className="text-zinc-600 mx-auto mb-4" />
        <p className="text-zinc-400 mb-6">Invoice not found</p>
        <Link to="/developer/marketplace/invoices" className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium">
          <FiArrowLeft size={14} /> Back to Invoices
        </Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── 1. Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to="/developer/marketplace/invoices" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-1.5">
            <FiArrowLeft size={12} /> Back to Invoices
          </Link>
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold text-white">{invoiceNumber(invoice.invoiceId)}</h1>
            <span className="text-sm text-zinc-400">{service?.title || 'Marketplace Purchase'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />
          {isPaid && invoice.txHash && (
            <a href={invoice.explorerUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
              <FiExternalLink size={12} /> View on Explorer
            </a>
          )}
        </div>
      </div>

      {/* ── 2. Summary Metrics ────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Amount', value: `${formatAmountSafe(invoice.amountBOT)} USDC`, sub: `${invoice.quantity} ${invoice.unit || 'Request'}` },
          { label: 'Status', value: null, badge: true },
          { label: 'Created', value: formatDateSafe(invoice.createdAt), sub: formatTimeSafe(invoice.createdAt) },
          { label: isPaid ? 'Paid On' : 'Status', value: isPaid ? formatDateSafe(invoice.paidAt) : 'Not paid', sub: isPaid ? formatTimeSafe(invoice.paidAt) : 'Awaiting settlement' }
        ].map((m, i) => (
          <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 flex flex-col justify-center min-h-[72px]">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">{m.label}</p>
            {m.badge ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold w-fit ${statusMeta.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot} ${invoice.status === 'pending' ? 'animate-pulse' : ''}`} />
                {statusMeta.label}
              </span>
            ) : (
              <p className="text-sm font-semibold text-white truncate">{m.value}</p>
            )}
            {m.sub && <p className="text-[10px] text-zinc-600 mt-0.5">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── 3+4. Purchase Details + Participants (side-by-side) ── */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">

        {/* Purchase Details */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Purchase Details</h3>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
            {[
              ['Service', service?.title || '—'],
              ['Category', service?.category || '—'],
              ['Pricing Model', service?.pricingModel || 'Per Request'],
              ['Quantity', `${invoice.quantity} ${invoice.unit || 'Request'}`],
              ['Unit Price', formatAmountSafe(invoice.unitPrice || invoice.amountBOT) + ' USDC'],
              ['Total Paid', formatAmountSafe(invoice.amountBOT) + ' USDC']
            ].map(([label, value], i) => (
              <div key={i} className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">{label}</span>
                <span className={`font-medium truncate ${i === 5 ? 'text-emerald-400 font-semibold' : 'text-white'}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Participants */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Participants</h3>
          <div className="space-y-3">
            {[
              { label: 'Buyer', agent: consumerAgent, fallback: 'Unknown Consumer', color: 'from-emerald-500 to-emerald-700' },
              { label: 'Seller', agent: providerAgent, fallback: 'Unknown Provider', color: 'from-purple-500 to-purple-700' }
            ].map(({ label, agent, fallback, color }) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-bold text-white ${color}`}>
                    {initials(agent?.name || fallback)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-white text-xs truncate">{agent?.name || fallback}</p>
                    <TruncateId id={agent?.agentId} label={label} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. Blockchain Payment ─────────────────────────── */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Blockchain Payment</h3>
        {isPaid && invoice.txHash ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Status</span>
                <span className="text-xs font-medium text-emerald-400 flex items-center gap-1"><FiCheckCircle size={11} /> Confirmed</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Network</span>
                <span className="text-xs font-medium text-white">Arc Chain</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Transaction Hash</span>
                <span className="font-mono text-[11px] text-blue-400 truncate max-w-[280px]" title={invoice.txHash}>
                  {invoice.txHash}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { navigator.clipboard.writeText(invoice.txHash); toast.success('Hash copied'); }}
                className="inline-flex items-center gap-1 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
              >
                <FiCopy size={10} /> Copy Hash
              </button>
              <a href={invoice.explorerUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors">
                <FiExternalLink size={10} /> Explorer
              </a>
            </div>
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-3 py-2">
            <FiClock size={16} className="text-amber-500 animate-pulse shrink-0" />
            <div>
              <p className="text-xs text-zinc-400">Waiting for payment</p>
              <p className="text-[11px] text-zinc-600">The consumer agent wallet will settle this invoice in USDC on Arc.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <FiAlertCircle size={16} className="text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-red-400">Payment failed</p>
              <p className="text-[11px] text-zinc-600">No blockchain transaction was created.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Timeline ──────────────────────────────────── */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Timeline</h3>
        {timelineSteps.length ? (
          <div className="flex flex-col gap-0">
            {timelineSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2.5 relative">
                <div className="flex items-center justify-center relative z-10">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] ${
                    step.state === 'done' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                    step.state === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                    'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}>
                    {step.state === 'done' && <FiCheckCircle size={10} />}
                    {step.state === 'error' && <FiAlertCircle size={10} />}
                    {step.state === 'pending' && <FiClock size={10} />}
                  </div>
                  {idx < timelineSteps.length - 1 && (
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 h-5 w-px bg-zinc-800" />
                  )}
                </div>
                <div className="flex items-center justify-between flex-1 min-w-0 py-1">
                  <span className="text-xs font-medium text-white">{step.label}</span>
                  <span className="text-[10px] text-zinc-600 shrink-0 ml-3">
                    {step.time ? formatDateTimeSafe(step.time) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-600">Timeline not available</p>
        )}
      </div>

      {/* ── 7. Payment History (table) ────────────────────── */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Payment History</h3>
        {paymentMethod ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-medium pb-2 pr-4">Payment Method</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-medium pb-2 pr-4">Wallet</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-medium pb-2 pr-4">Amount</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-medium pb-2 pr-4">Status</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-zinc-500 font-medium pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 text-zinc-300">{paymentMethod.method}</td>
                  <td className="py-2 pr-4 font-mono text-zinc-400">{paymentMethod.wallet}</td>
                  <td className="py-2 pr-4 font-semibold text-emerald-400">{paymentMethod.amount} USDC</td>
                  <td className="py-2 pr-4 text-emerald-400 font-medium">{paymentMethod.status}</td>
                  <td className="py-2 text-right">
                    {paymentMethod.txHash && (
                      <a href={invoice.explorerUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-zinc-400 hover:text-blue-400 transition-colors">
                        Explorer <FiExternalLink size={10} />
                      </a>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-600">No payment recorded for this invoice yet.</p>
        )}
      </div>

      {/* ── 8. Developer Information (collapsed accordion) ── */}
      <div className="border border-zinc-800 rounded-xl overflow-hidden mb-4">
        <button
          onClick={() => setShowDevDetails(!showDevDetails)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-900/50 hover:bg-zinc-900 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <FiFileText size={13} /> Developer Information
          </span>
          {showDevDetails ? <FiChevronUp size={13} className="text-zinc-500" /> : <FiChevronDown size={13} className="text-zinc-500" />}
        </button>
        {showDevDetails && (
          <div className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono">
              {[
                ['Invoice ID', invoice.invoiceId],
                ['Purchase ID', invoice.purchaseId || invoice.sessionId || '—'],
                ['Session ID', invoice.sessionId || '—'],
                ['Payment ID', invoice.paymentId || '—'],
                ['Provider Agent', invoice.providerAgentId],
                ['Consumer Agent', invoice.consumerAgentId],
                ['Created At', invoice.createdAt || '—'],
                ['Paid At', invoice.paidAt || '—'],
                ['Due At', invoice.dueAt || '—'],
                ['Metadata', JSON.stringify(invoice.metadata || {})]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-2.5 py-1.5">
                  <span className="text-zinc-500 shrink-0">{label}</span>
                  <span className="text-zinc-300 truncate ml-3 text-right max-w-[60%]" title={String(value)}>{value || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevInvoiceDetail;
