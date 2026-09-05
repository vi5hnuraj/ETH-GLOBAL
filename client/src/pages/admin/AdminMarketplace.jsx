import React, { useState, useCallback } from 'react';
import {
  FiSearch, FiCheckCircle, FiXCircle, FiEyeOff, FiEye, FiStar, FiTrash2,
  FiRefreshCw, FiPackage, FiShoppingBag, FiExternalLink
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
    published: 'bg-emerald-950 text-emerald-400 border-emerald-900',
    pending: 'bg-amber-950 text-amber-400 border-amber-900',
    rejected: 'bg-rose-950 text-rose-400 border-rose-900',
    hidden: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    featured: 'bg-violet-950 text-violet-400 border-violet-900',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${map[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {status || 'unknown'}
    </span>
  );
};

const AdminMarketplace = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: useCallback(() => adminApi.marketplaceServices({
      q: search || undefined,
      status: filter || undefined,
      page,
      perPage: PER_PAGE
    }), [search, page, filter])
  });

  const services = data?.services || data?.results || [];
  const total = data?.total || services.length;
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

  return (
    <div>
      <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <p className="text-sm text-zinc-400 mt-1">Review, approve, and manage marketplace services.</p>
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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search services..."
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
            <option value="rejected">Rejected</option>
            <option value="featured">Featured</option>
          </select>
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
      ) : services.length === 0 ? (
        <EmptyState icon={FiShoppingBag} title="No services found" description={search || filter ? 'Try a different search or filter.' : 'No services have been published yet.'} />
      ) : (
        <>
          <Card dense>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="pb-3 pr-4">Service</th>
                    <th className="pb-3 pr-4">Developer</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Installs</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {services.map((svc) => (
                    <tr key={svc.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-200 truncate">{svc.name}</p>
                          <p className="text-xs text-zinc-500 truncate">{svc.description || svc.id}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs text-zinc-400">{svc.developerName || svc.developerId || '—'}</td>
                      <td className="py-3 pr-4"><StatusBadge status={svc.status} /></td>
                      <td className="py-3 pr-4 text-zinc-400">{svc.installCount?.toLocaleString() ?? '—'}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {svc.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setConfirmAction({ type: 'approve', svc })}
                                className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-950"
                                title="Approve service"
                              >
                                <FiCheckCircle size={14} />
                              </button>
                              <button
                                onClick={() => setConfirmAction({ type: 'reject', svc })}
                                className="p-1.5 rounded-md text-rose-400 hover:bg-rose-950"
                                title="Reject service"
                              >
                                <FiXCircle size={14} />
                              </button>
                            </>
                          )}
                          {svc.status === 'hidden' ? (
                            <button
                              onClick={() => setConfirmAction({ type: 'unhide', svc })}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-emerald-950"
                              title="Unhide service"
                            >
                              <FiEye size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ type: 'hide', svc })}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-amber-950"
                              title="Hide service"
                            >
                              <FiEyeOff size={14} />
                            </button>
                          )}
                          {svc.featured ? (
                            <button
                              onClick={() => setConfirmAction({ type: 'unfeature', svc })}
                              className="p-1.5 rounded-md text-amber-400 hover:bg-amber-950"
                              title="Unfeature"
                            >
                              <FiStar size={14} fill="currentColor" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ type: 'feature', svc })}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-amber-950"
                              title="Feature service"
                            >
                              <FiStar size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmAction({ type: 'remove', svc })}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-950"
                            title="Remove abusive service"
                          >
                            <FiTrash2 size={14} />
                          </button>
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

      {confirmAction?.type === 'approve' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.approveService(confirmAction.svc.id), 'Service approved')}
          title="Approve Service"
          description={`Approve "${confirmAction.svc.name}" for the marketplace?`}
          confirmLabel="Approve" confirmClassName="bg-emerald-600 hover:bg-emerald-500" danger={false} busy={busy}
        />
      )}
      {confirmAction?.type === 'reject' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.rejectService(confirmAction.svc.id), 'Service rejected')}
          title="Reject Service"
          description={`Reject "${confirmAction.svc.name}"? The developer will be notified.`}
          confirmLabel="Reject" busy={busy}
        />
      )}
      {confirmAction?.type === 'hide' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.hideService(confirmAction.svc.id), 'Service hidden')}
          title="Hide Service"
          description={`Hide "${confirmAction.svc.name}" from the marketplace? Existing users can still access it.`}
          confirmLabel="Hide" confirmClassName="bg-amber-600 hover:bg-amber-500" danger={false} busy={busy}
        />
      )}
      {confirmAction?.type === 'unhide' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.unhideService(confirmAction.svc.id), 'Service unhidden')}
          title="Unhide Service"
          description={`Make "${confirmAction.svc.name}" visible again in the marketplace?`}
          confirmLabel="Unhide" confirmClassName="bg-emerald-600 hover:bg-emerald-500" danger={false} busy={busy}
        />
      )}
      {confirmAction?.type === 'feature' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.featureService(confirmAction.svc.id), 'Service featured')}
          title="Feature Service"
          description={`Feature "${confirmAction.svc.name}" in the marketplace spotlight?`}
          confirmLabel="Feature" confirmClassName="bg-violet-600 hover:bg-violet-500" danger={false} busy={busy}
        />
      )}
      {confirmAction?.type === 'unfeature' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.unfeatureService(confirmAction.svc.id), 'Service unfeatured')}
          title="Unfeature Service"
          description={`Remove "${confirmAction.svc.name}" from the featured spotlight?`}
          confirmLabel="Unfeature" confirmClassName="bg-zinc-600 hover:bg-zinc-500" danger={false} busy={busy}
        />
      )}
      {confirmAction?.type === 'remove' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.removeService(confirmAction.svc.id), 'Service removed')}
          title="Remove Service"
          description={`Permanently remove "${confirmAction.svc.name}" for abuse? This action cannot be undone.`}
          confirmLabel="Remove Service" busy={busy}
        />
      )}
    </div>
  );
};

export default AdminMarketplace;
