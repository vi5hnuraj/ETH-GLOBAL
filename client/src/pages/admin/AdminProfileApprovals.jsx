import React, { useState, useCallback } from 'react';
import { FiGlobe, FiCheckCircle, FiXCircle, FiRefreshCw, FiClock, FiExternalLink, FiBriefcase, FiMapPin, FiLink, FiMail, FiFileText, FiGithub, FiUsers, FiHome } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import EmptyState from '../../components/dev/EmptyState';
import ConfirmModal from '../../components/dev/ConfirmModal';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const Field = ({ icon: Icon, label, value, href }) => (
  <div className="flex items-start gap-2 py-1.5">
    <Icon size={13} className="text-zinc-500 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[11px] text-zinc-500">{label}</p>
      {href && value ? <a href={href} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline break-all">{value}</a> : <p className="text-sm text-zinc-200">{value || <span className="text-zinc-600">—</span>}</p>}
    </div>
  </div>
);

const AdminProfileApprovals = () => {
  const [expandedId, setExpandedId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: profiles, loading, error, refresh, refreshing } = useApi({ fetcher: useCallback(() => adminApi.pendingProfiles(), []) });

  const list = profiles || [];

  const handleApprove = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      await adminApi.approveOrganizationProfile(confirmAction.orgId);
      toast.success('Profile approved');
      setConfirmAction(null);
      setExpandedId(null);
      refresh({ background: true });
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const handleReject = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      await adminApi.rejectOrganizationProfile(confirmAction.orgId);
      toast.success('Profile rejected');
      setConfirmAction(null);
      setExpandedId(null);
      refresh({ background: true });
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const filledCount = (p) => [p.name, p.description, p.industry, p.country, p.website, p.logo_url, p.support_email, p.contact_email, p.docs_url, p.github_url].filter(Boolean).length;

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Profile Approvals</h1>
          <p className="text-sm text-zinc-400 mt-1">{list.length} pending profile{list.length !== 1 ? 's' : ''} awaiting review</p>
        </div>
        <button onClick={() => refresh({ background: true })} disabled={refreshing} className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg">
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {loading && !profiles ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : error ? (
        <div className="text-center py-12 text-zinc-500"><p className="text-sm">{error.message}</p><button onClick={refresh} className="mt-3 text-blue-400 text-sm hover:underline">Retry</button></div>
      ) : list.length === 0 ? (
        <EmptyState icon={FiCheckCircle} title="No pending profiles" description="All organization profiles have been reviewed." />
      ) : (
        <div className="space-y-3">
          {list.map((p) => {
            const isExpanded = expandedId === p.id;
            const fc = filledCount(p);
            return (
              <Card key={p.id} dense>
                {/* Header row */}
                <button type="button" onClick={() => setExpandedId(isExpanded ? null : p.id)} className="w-full flex items-center gap-3 text-left">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-600/20 to-orange-600/20 border border-amber-800/30 flex items-center justify-center shrink-0">
                    <FiClock size={18} className="text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-200">{p.name || p.org_name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{p.slug || p.org_slug}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-500">
                      <span>{p.owner_email || 'Unknown'}</span>
                      <span>{fc}/10 fields filled</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'approve', orgId: p.organization_id, name: p.name }); }} className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                      <FiCheckCircle size={13} /> Approve
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'reject', orgId: p.organization_id, name: p.name }); }} className="inline-flex items-center gap-1 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium px-3 py-1.5 rounded-lg">
                      <FiXCircle size={13} /> Reject
                    </button>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-800/50">
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
                      <Field icon={FiBriefcase} label="Category" value={p.industry} />
                      <Field icon={FiMapPin} label="Headquarters" value={p.country || p.headquarters} />
                      <Field icon={FiHome} label="Company Size" value={p.company_size} />
                      <Field icon={FiLink} label="Website" value={p.website} href={p.website} />
                      <Field icon={FiMail} label="Support Email" value={p.support_email} href={p.support_email ? `mailto:${p.support_email}` : undefined} />
                      <Field icon={FiMail} label="Contact Email" value={p.contact_email} href={p.contact_email ? `mailto:${p.contact_email}` : undefined} />
                      <Field icon={FiFileText} label="Documentation" value={p.docs_url} href={p.docs_url} />
                      <Field icon={FiGithub} label="GitHub" value={p.github_url} href={p.github_url} />
                    </div>
                    {p.description && (
                      <div className="mt-3 pt-3 border-t border-zinc-800/50">
                        <p className="text-[11px] text-zinc-500 mb-1">About</p>
                        <p className="text-sm text-zinc-300 leading-relaxed">{p.description}</p>
                      </div>
                    )}
                    {p.logo_url && (
                      <div className="mt-3 pt-3 border-t border-zinc-800/50">
                        <p className="text-[11px] text-zinc-500 mb-1">Logo</p>
                        <img src={p.logo_url} alt="Logo" className="h-12 w-12 rounded-lg object-cover border border-zinc-700" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-zinc-800/50 flex items-center gap-4 text-[11px] text-zinc-500">
                      <span>Created: {new Date(p.created_at).toLocaleDateString()}</span>
                      <span>Updated: {new Date(p.updated_at).toLocaleDateString()}</span>
                      {p.is_public && <span className="text-emerald-400">Listed on marketplace</span>}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {confirmAction?.type === 'approve' && (
        <ConfirmModal open onClose={() => setConfirmAction(null)} onConfirm={handleApprove} title="Approve Profile" description={`Verify and approve ${confirmAction.name}? This gives them a verified badge on the marketplace.`} confirmLabel="Approve" confirmClassName="bg-emerald-600 hover:bg-emerald-500" danger={false} busy={busy} />
      )}
      {confirmAction?.type === 'reject' && (
        <ConfirmModal open onClose={() => setConfirmAction(null)} onConfirm={handleReject} title="Reject Profile" description={`Reject ${confirmAction.name}'s profile? They will remain unverified.`} confirmLabel="Reject" busy={busy} />
      )}
    </div>
  );
};

export default AdminProfileApprovals;
