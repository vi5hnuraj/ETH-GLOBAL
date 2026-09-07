import React, { useState, useCallback } from 'react';
import {
  FiSearch, FiKey, FiLock, FiUnlock, FiRefreshCw, FiArrowUpRight,
  FiArrowDownLeft, FiActivity, FiCopy
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

const WalletStatusBadge = ({ frozen }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border ${
    frozen
      ? 'bg-red-950 text-red-400 border-red-900'
      : 'bg-emerald-950 text-emerald-400 border-emerald-900'
  }`}>
    {frozen ? <><FiLock size={9} /> Frozen</> : 'Active'}
  </span>
);

const AdminWallets = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [txWalletId, setTxWalletId] = useState(null);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: useCallback(() => adminApi.wallets({ q: search || undefined, page, perPage: PER_PAGE }), [search, page])
  });

  const txData = useApi({
    fetcher: useCallback(() => txWalletId ? adminApi.walletTransactions(txWalletId, { perPage: 50 }) : Promise.resolve({ transactions: [] }), [txWalletId]),
    enabled: !!txWalletId
  });

  const wallets = data?.wallets || data?.results || [];
  const total = data?.total || wallets.length;
  const totalPages = Math.ceil(total / PER_PAGE);

  const handleAction = async (action, label) => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      await action();
      toast.success(`${label} successfully`);
      setConfirmAction(null);
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || `Failed to ${label.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = (addr) => {
    navigator.clipboard.writeText(addr);
    toast.success('Address copied');
  };

  return (
    <div>
      <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Wallets</h1>
          <p className="text-sm text-zinc-400 mt-1">View all MPC wallets, balances, and transactions. Freeze/unfreeze wallets as needed.</p>
        </div>
        <button
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <Card dense className="mb-6">
        <div className="relative">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by wallet address or developer..."
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
      ) : wallets.length === 0 ? (
        <EmptyState icon={FiKey} title="No wallets found" description={search ? 'Try a different search term.' : 'No wallets have been created yet.'} />
      ) : (
        <>
          <Card dense>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="pb-3 pr-4">Wallet Address</th>
                    <th className="pb-3 pr-4">Developer</th>
                    <th className="pb-3 pr-4">Balance</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {wallets.map((w) => (
                    <tr key={w.id || w.address} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-300 truncate max-w-[200px]">
                            {w.address || w.id}
                          </span>
                          {w.address && (
                            <button onClick={() => copyAddress(w.address)} className="text-zinc-500 hover:text-zinc-300">
                              <FiCopy size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs text-zinc-400">{w.developerName || w.developerId || '—'}</td>
                      <td className="py-3 pr-4">
                        <span className="text-zinc-200 font-medium">
                          {w.balance != null ? `${Number(w.balance).toFixed(4)} USDC` : '—'}
                        </span>
                      </td>
                      <td className="py-3 pr-4"><WalletStatusBadge frozen={w.frozen} /></td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setTxWalletId(txWalletId === (w.id || w.address) ? null : (w.id || w.address))}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-blue-400 hover:bg-blue-950"
                            title="View transactions"
                          >
                            <FiActivity size={14} />
                          </button>
                          {w.frozen ? (
                            <button
                              onClick={() => setConfirmAction({ type: 'unfreeze', wallet: w })}
                              className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-950"
                              title="Unfreeze wallet"
                            >
                              <FiUnlock size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ type: 'freeze', wallet: w })}
                              className="p-1.5 rounded-md text-amber-400 hover:bg-amber-950"
                              title="Freeze wallet"
                            >
                              <FiLock size={14} />
                            </button>
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

          {/* Inline Transaction History */}
          {txWalletId && (
            <Card title="Transactions" subtitle={`For wallet ${txWalletId.slice(0, 12)}…`} className="mt-6" action={
              <button onClick={() => setTxWalletId(null)} className="text-xs text-zinc-400 hover:text-white">Close</button>
            }>
              {txData.loading ? (
                <Skeleton className="h-32 rounded-xl" />
              ) : (txData.data?.transactions || []).length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">No transactions for this wallet.</p>
              ) : (
                <div className="space-y-2">
                  {(txData.data?.transactions || []).map((tx, idx) => (
                    <div key={tx.hash || idx} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                      <span className={tx.type === 'outgoing' ? 'text-rose-400' : 'text-emerald-400'}>
                        {tx.type === 'outgoing' ? <FiArrowUpRight size={14} /> : <FiArrowDownLeft size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-300 truncate font-mono">{tx.hash || '—'}</p>
                        <p className="text-[11px] text-zinc-500">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}</p>
                      </div>
                      <span className={`text-xs font-medium ${tx.type === 'outgoing' ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {tx.type === 'outgoing' ? '-' : '+'}{tx.amount != null ? `${Number(tx.amount).toFixed(4)}` : '—'} USDC
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {confirmAction?.type === 'freeze' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.freezeWallet(confirmAction.wallet.id || confirmAction.wallet.address),
            'Wallet frozen'
          )}
          title="Freeze Wallet"
          description={`Freeze wallet ${confirmAction.wallet.address?.slice(0, 16)}…? This prevents all outgoing transactions.`}
          confirmLabel="Freeze Wallet"
          confirmClassName="bg-amber-600 hover:bg-amber-500"
          busy={busy}
        />
      )}
      {confirmAction?.type === 'unfreeze' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.unfreezeWallet(confirmAction.wallet.id || confirmAction.wallet.address),
            'Wallet unfrozen'
          )}
          title="Unfreeze Wallet"
          description={`Unfreeze wallet ${confirmAction.wallet.address?.slice(0, 16)}…? This restores normal transaction capabilities.`}
          confirmLabel="Unfreeze Wallet"
          confirmClassName="bg-emerald-600 hover:bg-emerald-500"
          danger={false}
          busy={busy}
        />
      )}
    </div>
  );
};

export default AdminWallets;
