import React, { useState, useCallback } from 'react';
import {
  FiSearch, FiCreditCard, FiRefreshCw, FiAlertTriangle, FiExternalLink,
  FiCheckCircle, FiXCircle, FiFileText, FiArrowRight
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import Pagination from '../../components/dev/Pagination';
import ConfirmModal from '../../components/dev/ConfirmModal';
import EmptyState from '../../components/dev/EmptyState';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const PER_PAGE = 20;

const StatusBadge = ({ status }) => {
  const map = {
    completed: 'bg-emerald-950 text-emerald-400 border-emerald-900',
    pending: 'bg-amber-950 text-amber-400 border-amber-900',
    failed: 'bg-rose-950 text-rose-400 border-rose-900',
    refunded: 'bg-violet-950 text-violet-400 border-violet-900',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${map[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {status || 'unknown'}
    </span>
  );
};

const AdminPayments = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('all');
  const [confirmRefund, setConfirmRefund] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => {
    const params = { q: search || undefined, page, perPage: PER_PAGE };
    if (tab === 'failed') return adminApi.failedPayments(params);
    if (tab === 'receipts') return adminApi.paymentReceipts(params);
    return adminApi.payments(params);
  }, [search, page, tab]);

  const { data, loading, error, refresh, refreshing } = useApi({ fetcher });

  const payments = data?.payments || data?.results || data?.receipts || [];
  const total = data?.total || payments.length;
  const totalPages = Math.ceil(total / PER_PAGE);

  const handleRefund = async () => {
    if (!confirmRefund) return;
    setBusy(true);
    try {
      await adminApi.refundPayment(confirmRefund.id || confirmRefund.paymentId);
      toast.success('Payment refunded successfully');
      setConfirmRefund(null);
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to refund payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-zinc-400 mt-1">View sessions, receipts, failed payments, and blockchain transactions.</p>
        </div>
        <button
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-900/60 border border-zinc-800 rounded-lg p-1 w-fit">
        {[
          { key: 'all', label: 'All Payments' },
          { key: 'receipts', label: 'Receipts' },
          { key: 'failed', label: 'Failed' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card dense className="mb-6">
        <div className="relative">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by payment ID, transaction hash, or developer..."
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </Card>

      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : error && !data ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm">{error.message}</p>
          <button onClick={refresh} className="mt-3 text-blue-400 text-sm hover:underline">Retry</button>
        </div>
      ) : payments.length === 0 ? (
        <EmptyState icon={FiCreditCard} title="No payments found" description={search ? 'Try a different search term.' : 'No payment records yet.'} />
      ) : (
        <>
          <Card dense>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="pb-3 pr-4">Payment</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">TX Hash</th>
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {payments.map((p) => (
                    <tr key={p.id || p.paymentId} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-200 font-mono text-xs truncate">{p.id || p.paymentId}</p>
                          {p.developerName && <p className="text-xs text-zinc-500">{p.developerName}</p>}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-zinc-200 font-medium">
                          {p.amount != null ? `${Number(p.amount).toFixed(4)} ${p.currency || 'USDC'}` : '—'}
                        </span>
                        {p.amountUsd != null && (
                          <span className="text-xs text-zinc-500 ml-1">(${Number(p.amountUsd).toFixed(2)})</span>
                        )}
                      </td>
                      <td className="py-3 pr-4"><StatusBadge status={p.status} /></td>
                      <td className="py-3 pr-4">
                        {p.txHash ? (
                          <span className="font-mono text-xs text-zinc-400 truncate max-w-[120px] block">{p.txHash}</span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-zinc-500">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === 'completed' && (
                            <button
                              onClick={() => setConfirmRefund(p)}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-amber-950"
                              title="Refund payment"
                            >
                              <FiRefreshCw size={14} />
                            </button>
                          )}
                          {p.txHash && (
                            <span className="text-xs text-zinc-500 font-mono">{p.txHash.slice(0, 8)}…</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} onChange={setPage} />
        </>
      )}

      {confirmRefund && (
        <ConfirmModal
          open
          onClose={() => setConfirmRefund(null)}
          onConfirm={handleRefund}
          title="Refund Payment"
          description={`Refund ${confirmRefund.amount != null ? `${Number(confirmRefund.amount).toFixed(4)} ${confirmRefund.currency || 'USDC'}` : 'this payment'}? The funds will be returned to the developer's wallet.`}
          confirmLabel="Refund Payment"
          confirmClassName="bg-amber-600 hover:bg-amber-500"
          busy={busy}
        />
      )}
    </div>
  );
};

export default AdminPayments;
