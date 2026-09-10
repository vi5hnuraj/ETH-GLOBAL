import React, { useState, useCallback } from 'react';
import {
  FiSearch, FiUserX, FiUserCheck, FiTrash2, FiKey, FiEye, FiRefreshCw,
  FiUsers, FiCreditCard, FiChevronDown, FiChevronUp, FiShield, FiX
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import Pagination from '../../components/dev/Pagination';
import ConfirmModal from '../../components/dev/ConfirmModal';
import EmptyState from '../../components/dev/EmptyState';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Modal from '../../components/dev/Modal';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const PER_PAGE = 20;

const StatusBadge = ({ status }) => {
  const cls = status === 'suspended'
    ? 'bg-red-950 text-red-400 border-red-900'
    : status === 'verified'
    ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
    : 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${cls}`}>
      {status || 'active'}
    </span>
  );
};

const AdminDevelopers = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: useCallback(() => adminApi.developers({ q: search || undefined, page, perPage: PER_PAGE }), [search, page])
  });

  const developers = data?.developers || data?.results || [];
  const total = data?.total || developers.length;
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

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div>
      <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Developers</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage all platform developers and their accounts.</p>
        </div>
        <button
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {/* Search */}
      <Card dense className="mb-6">
        <div className="relative">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, email, or ID..."
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </Card>

      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : error && !data ? (
        <ErrorBanner message={error.message} onRetry={refresh} />
      ) : developers.length === 0 ? (
        <EmptyState icon={FiUsers} title="No developers found" description={search ? 'Try a different search term.' : 'No developers have signed up yet.'} />
      ) : (
        <>
          <Card dense>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="pb-3 pr-4">Developer</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Agents</th>
                    <th className="pb-3 pr-4">Joined</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {developers.map((dev) => (
                    <React.Fragment key={dev.id || dev.developerId}>
                      <tr className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-xs font-bold shrink-0">
                              {(dev.name || dev.email || '?')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-zinc-200 truncate">{dev.name || dev.email || dev.id}</p>
                              {dev.email && <p className="text-xs text-zinc-500 truncate">{dev.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={dev.status} />
                        </td>
                        <td className="py-3 pr-4 text-zinc-400">{dev.agentCount ?? '—'}</td>
                        <td className="py-3 pr-4 text-zinc-500 text-xs">
                          {dev.createdAt ? new Date(dev.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => toggleExpand(dev.id || dev.developerId)}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                              title="Expand actions"
                            >
                              {expandedId === (dev.id || dev.developerId) ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                            </button>
                            {dev.status === 'suspended' ? (
                              <button
                                onClick={() => setConfirmAction({ type: 'unsuspend', dev })}
                                className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-950"
                                title="Unsuspend developer"
                              >
                                <FiUserCheck size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmAction({ type: 'suspend', dev })}
                                className="p-1.5 rounded-md text-amber-400 hover:bg-amber-950"
                                title="Suspend developer"
                              >
                                <FiUserX size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmAction({ type: 'resetKeys', dev })}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-blue-400 hover:bg-blue-950"
                              title="Reset API keys"
                            >
                              <FiKey size={14} />
                            </button>
                            {(dev.world_verified || dev.world_nullifier || Number(dev.verified_agent_count) > 0) && (
                              <button
                                onClick={() => setConfirmAction({ type: 'revokeWorld', dev })}
                                className="p-1.5 rounded-md text-violet-400 hover:bg-violet-950"
                                title="Revoke World verification"
                              >
                                <FiShield size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmAction({ type: 'delete', dev })}
                              className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-950"
                              title="Delete developer"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === (dev.id || dev.developerId) && (
                        <tr>
                          <td colSpan={5} className="pb-3 px-4">
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <p className="text-zinc-500">Developer ID</p>
                                  <p className="text-zinc-300 font-mono truncate">{dev.id || dev.developerId}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Email</p>
                                  <p className="text-zinc-300">{dev.email || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">Organizations</p>
                                  <p className="text-zinc-300">{dev.orgCount ?? '—'}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500">API Keys</p>
                                  <p className="text-zinc-300">{dev.apiKeyCount ?? '—'}</p>
                                </div>
                              </div>
                              {dev.lastLoginAt && (
                                <p className="text-xs text-zinc-500">Last login: {new Date(dev.lastLoginAt).toLocaleString()}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} onChange={setPage} />
        </>
      )}

      {/* Confirmation Dialogs */}
      {confirmAction?.type === 'suspend' && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.suspendDeveloper(confirmAction.dev.id || confirmAction.dev.developerId),
            'Developer suspended'
          )}
          title="Suspend Developer"
          description={`This will prevent ${confirmAction.dev.name || confirmAction.dev.email || 'this developer'} from accessing the platform. Their agents and services will continue to run but they won't be able to make changes.`}
          confirmLabel="Suspend Developer"
          busy={busy}
        />
      )}
      {confirmAction?.type === 'unsuspend' && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.unsuspendDeveloper(confirmAction.dev.id || confirmAction.dev.developerId),
            'Developer unsuspended'
          )}
          title="Unsuspend Developer"
          description={`Restore access for ${confirmAction.dev.name || confirmAction.dev.email || 'this developer'}.`}
          confirmLabel="Unsuspend"
          confirmClassName="bg-emerald-600 hover:bg-emerald-500"
          danger={false}
          busy={busy}
        />
      )}
      {confirmAction?.type === 'resetKeys' && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.resetDeveloperKeys(confirmAction.dev.id || confirmAction.dev.developerId),
            'API keys reset'
          )}
          title="Reset API Keys"
          description={`All API keys for ${confirmAction.dev.name || confirmAction.dev.email || 'this developer'} will be revoked and new keys generated. Active integrations will break.`}
          confirmLabel="Reset Keys"
          confirmClassName="bg-amber-600 hover:bg-amber-500"
          danger={false}
          busy={busy}
        />
      )}
      {confirmAction?.type === 'revokeWorld' && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.revokeWorldVerification(confirmAction.dev.id || confirmAction.dev.developerId),
            'World verification revoked'
          )}
          title="Revoke World Verification"
          description={`This disables World publishing authorization for ${confirmAction.dev.name || confirmAction.dev.email || 'this developer'} and resets their agents. Nullifier history is preserved for audit and replay protection.`}
          confirmLabel="Revoke Verification"
          confirmClassName="bg-violet-600 hover:bg-violet-500"
          danger
          busy={busy}
        />
      )}
      {confirmAction?.type === 'delete' && (
        <ConfirmModal
          open
          onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(
            () => adminApi.deleteDeveloper(confirmAction.dev.id || confirmAction.dev.developerId),
            'Developer deleted'
          )}
          title="Delete Developer"
          description={`Permanently delete ${confirmAction.dev.name || confirmAction.dev.email || 'this developer'} and all associated data. This action cannot be undone.`}
          confirmLabel="Delete Developer"
          busy={busy}
        />
      )}
    </div>
  );
};

export default AdminDevelopers;
