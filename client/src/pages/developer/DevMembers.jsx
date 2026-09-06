import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FiUserPlus, FiTrash2, FiLoader, FiShield, FiLogOut, FiArrowRightCircle, FiCheck, FiUsers, FiMoreHorizontal, FiCopy, FiMail, FiClock } from 'react-icons/fi';
import developerApi from '../../utils/developerApi';
import { getOrganizationId, setOrganizationId, getDeveloperId } from '../../utils/identity';
import useApi from '../../hooks/useApi';
import Card from '../../components/dev/Card';
import Modal from '../../components/dev/Modal';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';

const INVITABLE_ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to org resources' },
  { value: 'developer', label: 'Developer', description: 'Manage agents, keys, webhooks, payments' },
  { value: 'billing_manager', label: 'Billing Manager', description: 'Manage billing, plans, invoices' },
  { value: 'admin', label: 'Admin', description: 'Manage members, settings, all resources' }
];

const ROLE_STYLES = {
  owner: 'bg-amber-500/20 text-amber-300 border-amber-700/50',
  admin: 'bg-purple-500/20 text-purple-300 border-purple-700/50',
  developer: 'bg-blue-500/20 text-blue-300 border-blue-700/50',
  billing_manager: 'bg-cyan-500/20 text-cyan-300 border-cyan-700/50',
  viewer: 'bg-zinc-500/20 text-zinc-300 border-zinc-700/50'
};

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  billing_manager: 'Billing Manager',
  viewer: 'Viewer'
};

const ROLE_DESCRIPTIONS = {
  owner: 'Full control of the organization',
  admin: 'Manage members, settings, all resources',
  developer: 'Manage agents, keys, webhooks, payments',
  billing_manager: 'Manage billing, plans, invoices',
  viewer: 'Read-only access to org resources'
};

const roleLabel = (role) => ROLE_LABELS[role] || ROLE_LABELS.viewer;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const prettyName = (m) => {
  if (m.fullName || m.name) return m.fullName || m.name;
  const local = String(m.email || '').split('@')[0];
  if (local) return local.split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (m.developerId || 'Member').slice(0, 8);
};

const StatTile = ({ icon, label, value, accent = 'text-zinc-400' }) => (
  <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
    <span className={`${accent} shrink-0`}>{icon}</span>
    <span className="min-w-0">
      <span className="block text-lg font-bold text-white tabular-nums leading-tight">{value}</span>
      <span className="block text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5 truncate">{label}</span>
    </span>
  </div>
);

const OverflowMenu = ({ items }) => {
  const [open, setOpen] = useState(false);
  if (!items || !items.length) return null;
  const fire = (item) => () => { setOpen(false); item.onClick(); };
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
        aria-label="More actions"
        aria-expanded={open}
      >
        <FiMoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={fire(it)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] ${
                  it.tone === 'danger' ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const DevMembers = () => {
  const storedOrgId = getOrganizationId();
  const [tab, setTab] = useState('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTag, setInviteTag] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [tagSearch, setTagSearch] = useState([]);
  const [tagSearching, setTagSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [editRoleTarget, setEditRoleTarget] = useState(null);

  const currentRes = useApi({ fetcher: () => developerApi.currentOrganization(), enabled: !!storedOrgId, deps: [storedOrgId] });
  const resolvedOrgId = currentRes.data?.organization?.id || storedOrgId;
  const orgId = resolvedOrgId;

  useEffect(() => {
    if (currentRes.data?.organization?.id && currentRes.data.organization.id !== storedOrgId) {
      setOrganizationId(currentRes.data.organization.id);
    }
  }, [currentRes.data?.organization?.id, storedOrgId]);

  const membersRes = useApi({ fetcher: () => developerApi.orgMembers(orgId), enabled: !!orgId, deps: [orgId] });
  const invitesRes = useApi({ fetcher: () => developerApi.orgInvitations(orgId), enabled: !!orgId, deps: [orgId] });
  const rolesRes = useApi({ fetcher: () => developerApi.rolesCatalog(orgId), enabled: !!orgId, deps: [orgId] });

  const members = membersRes.data || [];
  const invitations = invitesRes.data || [];
  const roles = rolesRes.data || [];
  const membership = currentRes.data?.membership || {};
  // Identify 'me' by matching devId OR email from JWT token
  const token = localStorage.getItem('token');
  let myEmail = '';
  try { if (token) { const payload = JSON.parse(atob(token.split('.')[1])); myEmail = payload.email || ''; } } catch {}
  const myDevId = getDeveloperId();
  const myMember = members.find((m) => m.developerId === myDevId || (myEmail && m.email === myEmail)) || { role: membership.role };
  const isOwner = myMember?.role === 'owner';
  const isAdmin = isOwner || myMember?.role === 'admin';
  const canManageMembers = isOwner || isAdmin;

  const searchTags = async (q) => {
    if (!q || q.length < 1) { setTagSearch([]); return; }
    setTagSearching(true);
    try {
      const users = await developerApi.searchUsersByTag(q);
      setTagSearch(users);
    } catch { setTagSearch([]); }
    finally { setTagSearching(false); }
  };

  const invite = async () => {
    const tag = inviteTag.trim();
    if (!tag) return toast.error('Enter a GlobalPay tag (e.g. @username_gl)');
    setBusy(true);
    try {
      const invitation = await developerApi.inviteByTag(orgId, tag, inviteRole);
      toast.success(`Invitation sent to ${invitation.name || tag}! They'll see it in their Notifications page.`, { duration: 8000 });
      setInviteTag('');
      setInviteRole('viewer');
      setTagSearch([]);
      setInviteOpen(false);
      invitesRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to send invitation');
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (token) => {
    try {
      await developerApi.cancelInvitation(orgId, token);
      toast.success('Invitation cancelled');
      invitesRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel invitation');
    }
  };

  const changeRole = async (memberId, role) => {
    try {
      await developerApi.changeMemberRole(orgId, memberId, role);
      toast.success('Role updated');
      membersRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to update role');
    }
  };

  const removeMember = async () => {
    setBusy(true);
    try {
      await developerApi.removeOrgMember(orgId, confirmRemoveId);
      toast.success('Member removed');
      setConfirmRemoveId(null);
      membersRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to remove member');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setConfirmLeave(true);
  };

  const performLeave = async () => {
    try {
      await developerApi.leaveOrganization(orgId);
      toast.success('You left the organization');
      setConfirmLeave(false);
      membersRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to leave organization');
      setConfirmLeave(false);
    }
  };

  const transfer = async () => {
    if (!transferTarget) return;
    setBusy(true);
    try {
      await developerApi.transferOwnership(orgId, transferTarget.developerId);
      toast.success(`Ownership transferred to ${transferTarget.email || transferTarget.developerId}`);
      setTransferOpen(false);
      setTransferTarget(null);
      membersRes.refresh();
      currentRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to transfer ownership');
    } finally {
      setBusy(false);
    }
  };

  if ((membersRes.loading && !membersRes.data) || (storedOrgId && currentRes.loading && !currentRes.data)) {
    return (
      <div>
        <Skeleton className="h-8 w-64 rounded mb-6" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (membersRes.error && !membersRes.data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Members &amp; Roles</h1>
        <ErrorBanner message={membersRes.error.message} onRetry={membersRes.refresh} setupRequired={membersRes.error.setupRequired} />
      </div>
    );
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Members &amp; Roles</h1>
          <p className="text-sm text-zinc-500 mt-1">RBAC for the active organization. You are a <span className="text-zinc-300 font-medium">{myMember?.role || membership?.role || 'member'}</span>.</p>
        </div>
        {canManageMembers && (
          <button type="button" onClick={() => setInviteOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
            <FiUserPlus size={14} /> Invite member
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatTile icon={<FiUsers size={16} />} label="Total members" value={members.length} accent="text-blue-400" />
        <StatTile icon={<FiMail size={16} />} label="Pending invites" value={invitesRes.loading ? '…' : invitations.length} accent="text-amber-400" />
        <StatTile icon={<FiShield size={16} />} label="Available roles" value={rolesRes.loading ? '…' : roles.length} accent="text-emerald-400" />
      </div>

      <div className="flex gap-2 mb-4" role="tablist" aria-label="Member sections">
        {[
          { id: 'members', label: `Members (${members.length})` },
          { id: 'invitations', label: `Invitations (${invitations.length})` },
          { id: 'roles', label: 'Roles & Permissions' }
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              tab === t.id ? 'bg-blue-600/20 text-blue-300 border-blue-800/60' : 'text-zinc-400 border-zinc-800 hover:border-zinc-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {currentRes.error && <ErrorBanner message={currentRes.error.message} onRetry={currentRes.refresh} />}

      {tab === 'members' && (
        <Card title="Members" subtitle="People with access to this organization">
          {members.length === 0 ? (
            <EmptyState
              icon={<FiUsers size={26} />}
              title="No members yet"
              description="Invite people to collaborate in this organization. Only you have access right now."
              primary={canManageMembers ? { label: 'Invite member', onClick: () => setInviteOpen(true), icon: <FiUserPlus size={13} /> } : undefined}
            />
          ) : (
            <div className="divide-y divide-zinc-800/60 -my-1">
              {members.map((m) => {
                const isSelf = m.developerId === myDevId || (myEmail && m.email === myEmail);
                const editable = canManageMembers && m.role !== 'owner' && !isSelf;
                const status = m.status ?? 'active';
                const lastActive = m.lastActiveAt ?? m.lastSeenAt ?? m.updatedAt;
                const menuItems = [];
                if (editable) {
                  menuItems.push({ label: 'Edit role', icon: <FiShield size={13} />, onClick: () => setEditRoleTarget(m) });
                  menuItems.push({ label: 'Remove member', icon: <FiTrash2 size={13} />, tone: 'danger', onClick: () => setConfirmRemoveId(m.id) });
                }
                if (isOwner && !isSelf) {
                  menuItems.push({ label: 'Transfer ownership', icon: <FiArrowRightCircle size={13} />, onClick: () => { setTransferTarget(m); setTransferOpen(true); } });
                }
                if (m.inviteUrl || m.inviteToken) {
                  menuItems.push({
                    label: 'Copy invite',
                    icon: <FiCopy size={13} />,
                    onClick: async () => { try { await navigator.clipboard.writeText(m.inviteUrl || `${window.location.origin}/developer/organizations/members`); toast.success('Invite link copied'); } catch { /* clipboard unavailable */ } }
                  });
                }
                const initials = prettyName(m).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 px-2 py-2.5">
                    <span className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200">
                      {initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate flex items-center gap-1.5">
                        {prettyName(m)}
                        {isSelf && <span className="text-[10px] uppercase tracking-wide bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded-full">You</span>}
                        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide ${status === 'active' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                          {status}
                        </span>
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono truncate">{m.globalPayTag || m.email || m.developerId}</p>
                      <p className="text-[11px] text-zinc-600 mt-0.5 flex items-center gap-1 truncate">
                        <FiClock size={10} /> Joined {fmtDate(m.joinedAt)} · Last active {lastActive ? fmtDate(lastActive) : '—'}
                      </p>
                    </div>
                    {editable ? (
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                        aria-label={`Role for ${prettyName(m)}`}
                        className="h-8 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2 text-xs font-medium text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        title={`Change role for ${prettyName(m)}`}
                      >
                        {INVITABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <div className="shrink-0 text-right min-w-[110px]">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_STYLES[m.role] || ROLE_STYLES.viewer}`}>
                          {roleLabel(m.role)}
                        </span>
                        <p className="text-[10px] text-zinc-600 mt-1 truncate">{ROLE_DESCRIPTIONS[m.role] || ''}</p>
                      </div>
                    )}
                    <OverflowMenu items={menuItems} />
                  </div>
                );
              })}
            </div>
          )}
          {!isOwner && (
            <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-end">
              <button type="button" onClick={leave} className="text-sm text-zinc-500 hover:text-red-400 flex items-center gap-1.5">
                <FiLogOut size={13} /> Leave organization
              </button>
            </div>
          )}
        </Card>
      )}

      {tab === 'invitations' && (
        <Card title="Pending invitations" subtitle="Invites that have not been accepted yet">
          {invitesRes.error && <ErrorBanner message={invitesRes.error.message} onRetry={invitesRes.refresh} />}
          {!invitesRes.error && invitations.length === 0 ? (
            <EmptyState
              icon={<FiMail size={26} />}
              title="No pending invitations"
              description="Invitations sent to new members appear here. Send an invite to start collaborating."
              primary={canManageMembers ? { label: 'Invite member', onClick: () => setInviteOpen(true), icon: <FiUserPlus size={13} /> } : undefined}
            />
          ) : (
            <div className="divide-y divide-zinc-800/60 -my-1">
              {invitations.map((inv) => {
                const inviteLink = `${window.location.origin}/accept-invite/${orgId}/${inv.token}`;
                return (
                <div key={inv.id} className="flex flex-wrap items-center gap-3 px-2 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate flex items-center gap-1.5">{inv.email}</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      {roleLabel(inv.role)} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                    {!inv.expired && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <input
                          readOnly
                          value={inviteLink}
                          className="flex-1 min-w-0 bg-zinc-800/60 border border-zinc-700 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 truncate"
                          onClick={(e) => e.target.select()}
                        />
                        <button
                          type="button"
                          onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); toast.success('Link copied!'); } catch { /* noop */ } }}
                          className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                          title="Copy invite link"
                        >
                          <FiCopy size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wide border px-2 py-0.5 rounded-full ${inv.expired ? 'bg-red-500/20 text-red-300 border-red-700/50' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                    {inv.expired ? 'Expired' : 'Pending'}
                  </span>
                  <OverflowMenu
                    items={[
                      ...(canManageMembers
                        ? [
                            {
                              label: 'Copy invite link',
                              icon: <FiCopy size={13} />,
                              onClick: async () => { try { await navigator.clipboard.writeText(inviteLink); toast.success('Invite link copied'); } catch { /* clipboard unavailable */ } }
                            },
                            { label: 'Cancel invitation', icon: <FiTrash2 size={13} />, tone: 'danger', onClick: () => cancelInvite(inv.token) }
                          ]
                        : [])
                    ]}
                  />
                </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'roles' && (
        <div className="space-y-3">
          {rolesRes.error && <ErrorBanner message={rolesRes.error.message} onRetry={rolesRes.refresh} />}
          {!rolesRes.error && roles.length === 0 ? (
            <EmptyState
              icon={<FiShield size={26} />}
              title="No roles defined"
              description="Roles define what members can do in this organization. Roles and their permissions are managed centrally."
            />
          ) : (
            <div className="grid lg:grid-cols-2 gap-3">
              {roles.map((r) => (
                <Card dense key={r.role} title={r.label} subtitle={r.description} className="h-full">
                  <div className="flex flex-wrap gap-1.5">
                    {r.permissions.map((p) => (
                      <span key={p} className="text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded">
                        {p}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
          <div className="text-xs text-zinc-600 flex items-center gap-2 pt-1">
            <FiShield size={13} /> Only the owner can transfer ownership or delete the organization.
          </div>
        </div>
      )}

      <Modal open={!!editRoleTarget} onClose={() => setEditRoleTarget(null)} title="Edit role" subtitle={editRoleTarget ? `Change the role for ${prettyName(editRoleTarget)}` : undefined}>
        <div className="space-y-1.5 mb-4">
          {INVITABLE_ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={editRoleTarget?.role === r.value}
              onClick={() => { changeRole(editRoleTarget.id, r.value); setEditRoleTarget(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${
                editRoleTarget?.role === r.value ? 'bg-blue-600/20 border-blue-700 text-blue-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-[11px] text-zinc-500">{r.description}</span>
              </span>
              {editRoleTarget?.role === r.value && <FiCheck size={14} />}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={inviteOpen} onClose={() => { setInviteOpen(false); setTagSearch([]); setInviteTag(''); }} title="Invite member" subtitle="Search by GlobalPay tag to send an in-app invitation">
        <label className="block text-xs text-zinc-500 mb-1" htmlFor="invite-tag">GlobalPay Tag</label>
        <div className="relative mb-4">
          <input
            id="invite-tag"
            value={inviteTag}
            onChange={(e) => { setInviteTag(e.target.value); searchTags(e.target.value); }}
            placeholder="@username_gl"
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {tagSearch.length > 0 && (
            <div className="absolute z-30 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
              {tagSearch.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setInviteTag(u.global_pay_tag); setTagSearch([]); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700/50 text-left"
                >
                  <span className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                    {(u.name || u.global_pay_tag || '?')[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{u.name}</p>
                    <p className="text-[11px] text-zinc-500 font-mono truncate">{u.global_pay_tag}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tagSearching && <p className="text-[10px] text-zinc-500 mt-1">Searching...</p>}
        </div>
        <span className="block text-xs text-zinc-500 mb-1">Role</span>
        <div className="space-y-1.5 mb-4">
          {INVITABLE_ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={inviteRole === r.value}
              onClick={() => setInviteRole(r.value)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${
                inviteRole === r.value ? 'bg-blue-600/20 border-blue-700 text-blue-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-[11px] text-zinc-500">{r.description}</span>
              </span>
              {inviteRole === r.value && <FiCheck size={14} />}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
          <button type="button" onClick={invite} disabled={busy} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
            {busy ? <FiLoader size={14} className="animate-spin" /> : <FiUserPlus size={14} />} Send invitation
          </button>
        </div>
      </Modal>

      <Modal open={!!confirmRemoveId} onClose={() => setConfirmRemoveId(null)} title="Remove member" subtitle="They will immediately lose access to this organization">
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmRemoveId(null)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
          <button type="button" onClick={removeMember} disabled={busy} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {busy ? <FiLoader size={14} className="animate-spin" /> : 'Remove'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={performLeave}
        title="Leave this organization?"
        description="You will immediately lose access to this organization's resources."
        confirmLabel="Leave organization"
      />

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer ownership" subtitle="You will become an admin; the new owner gains full control">
        {transferTarget && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Transfer ownership to <span className="text-zinc-100 font-medium">{transferTarget.email || transferTarget.developerId}</span>?
              The new owner can then delete the organization or transfer again.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTransferOpen(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
              <button type="button" onClick={transfer} disabled={busy} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                {busy ? <FiLoader size={14} className="animate-spin" /> : <FiArrowRightCircle size={14} />} Transfer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DevMembers;
