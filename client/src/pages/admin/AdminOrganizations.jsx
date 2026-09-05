import React, { useState, useCallback, useMemo } from 'react';
import {
  FiSearch, FiUsers, FiGlobe, FiCheckCircle, FiXCircle, FiTrash2,
  FiRefreshCw, FiShield, FiUserX, FiChevronDown, FiChevronRight, FiMail
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import Pagination from '../../components/dev/Pagination';
import ConfirmModal from '../../components/dev/ConfirmModal';
import EmptyState from '../../components/dev/EmptyState';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const PER_PAGE = 50;

const StatusBadge = ({ status }) => {
  const map = {
    suspended: 'bg-red-950 text-red-400 border-red-900',
    verified_company: 'bg-emerald-950 text-emerald-400 border-emerald-900',
    enterprise: 'bg-emerald-950 text-emerald-400 border-emerald-900',
    pending: 'bg-amber-950 text-amber-400 border-amber-900',
    unverified: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  };
  const label = status === 'verified_company' ? 'verified' : status || 'active';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${map[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {label}
    </span>
  );
};

const AdminOrganizations = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedOwner, setExpandedOwner] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: useCallback(() => adminApi.organizations({ q: search || undefined, page, perPage: PER_PAGE }), [search, page])
  });

  const orgs = data?.organizations || [];
  const total = data?.meta?.total || orgs.length;
  const totalPages = data?.meta?.totalPages || Math.ceil(total / PER_PAGE);

  // Group orgs by owner email
  const grouped = useMemo(() => {
    const groups = {};
    orgs.forEach((org) => {
      const key = org.owner_email || 'unknown';
      if (!groups[key]) {
        groups[key] = {
          email: org.owner_email || 'Unknown',
          name: org.owner_name || org.owner_email?.split('@')[0] || 'Unknown',
          orgs: [],
        };
      }
      groups[key].orgs.push(org);
    });
    return Object.values(groups).sort((a, b) => a.email.localeCompare(b.email));
  }, [orgs]);

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
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-sm text-zinc-400 mt-1">{total} organizations across {grouped.length} users</p>
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
            placeholder="Search by name, slug, or email..."
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
      ) : grouped.length === 0 ? (
        <EmptyState icon={FiGlobe} title="No organizations found" description={search ? 'Try a different search term.' : 'No organizations exist yet.'} />
      ) : (
        <>
          <div className="space-y-3">
            {grouped.map((group) => {
              const isExpanded = expandedOwner === group.email || expandedOwner === null;
              const orgCount = group.orgs.length;
              const totalMembers = group.orgs.reduce((s, o) => s + (o.member_count || 0), 0);
              const totalAgents = group.orgs.reduce((s, o) => s + (o.agent_count || 0), 0);

              return (
                <Card key={group.email} dense>
                  {/* User header — clickable to expand/collapse */}
                  <button
                    type="button"
                    onClick={() => setExpandedOwner(expandedOwner === group.email ? null : group.email)}
                    className="w-full flex items-center gap-3 text-left hover:bg-zinc-800/30 -mx-3 -my-2 px-3 py-2 rounded-lg transition-colors"
                  >
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {group.name[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-200">{group.name}</span>
                        <FiMail size={11} className="text-zinc-500" />
                        <span className="text-xs text-zinc-500">{group.email}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-500">
                        <span>{orgCount} org{orgCount !== 1 ? 's' : ''}</span>
                        {totalMembers > 0 && <span>{totalMembers} member{totalMembers !== 1 ? 's' : ''}</span>}
                        {totalAgents > 0 && <span>{totalAgents} agent{totalAgents !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    {expandedOwner === group.email ? (
                      <FiChevronDown size={16} className="text-zinc-500 shrink-0" />
                    ) : (
                      <FiChevronRight size={16} className="text-zinc-500 shrink-0" />
                    )}
                  </button>

                  {/* Org list under this user */}
                  {expandedOwner === group.email && (
                    <div className="mt-3 space-y-2 pl-12">
                      {group.orgs.map((org) => (
                        <div key={org.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-200 truncate">{org.name}</span>
                              {org.is_personal && (
                                <span className="text-[9px] uppercase tracking-wider text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">personal</span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-mono truncate">{org.slug}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge status={org.profile_status} />
                            {org.member_count > 0 && (
                              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                                <FiUsers size={10} />{org.member_count}
                              </span>
                            )}
                            {org.agent_count > 0 && (
                              <span className="text-[11px] text-violet-400">{org.agent_count} agents</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {org.profile_status === 'unverified' && (
                              <button
                                onClick={() => setConfirmAction({ type: 'approveProfile', org })}
                                className="p-1 rounded text-emerald-400 hover:bg-emerald-950"
                                title="Approve profile"
                              >
                                <FiGlobe size={13} />
                              </button>
                            )}
                            {org.status === 'suspended' ? (
                              <button
                                onClick={() => setConfirmAction({ type: 'unsuspend', org })}
                                className="p-1 rounded text-emerald-400 hover:bg-emerald-950"
                                title="Unsuspend"
                              >
                                <FiCheckCircle size={13} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmAction({ type: 'suspend', org })}
                                className="p-1 rounded text-amber-400 hover:bg-amber-950"
                                title="Suspend"
                              >
                                <FiUserX size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} onChange={setPage} />
        </>
      )}

      {confirmAction?.type === 'suspend' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.suspendOrganization(confirmAction.org.id), 'Suspended')}
          title="Suspend Organization" description={`Suspend ${confirmAction.org.name}?`}
          confirmLabel="Suspend" busy={busy}
        />
      )}
      {confirmAction?.type === 'unsuspend' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.unsuspendOrganization(confirmAction.org.id), 'Unsuspended')}
          title="Unsuspend Organization" description={`Restore ${confirmAction.org.name}.`}
          confirmLabel="Unsuspend" confirmClassName="bg-emerald-600 hover:bg-emerald-500" danger={false} busy={busy}
        />
      )}
      {confirmAction?.type === 'approveProfile' && (
        <ConfirmModal
          open onClose={() => setConfirmAction(null)}
          onConfirm={() => handleAction(() => adminApi.approveOrganizationProfile(confirmAction.org.id), 'Approved')}
          title="Approve Profile" description={`Approve ${confirmAction.org.name}'s public profile?`}
          confirmLabel="Approve" confirmClassName="bg-emerald-600 hover:bg-emerald-500" danger={false} busy={busy}
        />
      )}
    </div>
  );
};

export default AdminOrganizations;
