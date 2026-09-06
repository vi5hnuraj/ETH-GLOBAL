import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiTrash2, FiUsers, FiCheck, FiLoader, FiSettings, FiArrowRight, FiEdit3, FiSave } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import developerApi from '../../utils/developerApi';
import { getOrganizationId, setOrganizationId } from '../../utils/identity';
import useApi from '../../hooks/useApi';
import Card from '../../components/dev/Card';
import Modal from '../../components/dev/Modal';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';

const SLUG_RE = /^[a-z0-9-]+$/;
const INPUT_CLASS = 'w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white';
const INPUT_ERROR_CLASS = 'w-full bg-zinc-800/60 border border-red-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-white';

const DevOrganizations = () => {
  const { data, loading, error, refresh } = useApi({ fetcher: developerApi.organizations });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState(getOrganizationId());

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [editing, setEditing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast.error('Organization name is required');
    setCreating(true);
    try {
      const org = await developerApi.createOrganization({ name: name.trim(), slug: slug.trim() || undefined });
      toast.success(`Created “${org.name}”`);
      setOrganizationId(org.id);
      setActiveId(org.id);
      setName('');
      setSlug('');
      refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const switchTo = (id) => {
    setOrganizationId(id);
    setActiveId(id);
    toast.success('Active organization switched');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await developerApi.deleteOrganization(confirmId);
      toast.success('Organization deleted');
      if (getOrganizationId() === confirmId) setOrganizationId(null);
      setConfirmId(null);
      refresh();
      window.dispatchEvent(new CustomEvent('organizationchange', { detail: { id: getOrganizationId() || null } }));
    } catch (err) {
      toast.error(err.message || 'Failed to delete organization');
    } finally {
      setBusy(false);
    }
  };

  const canEditOrg = (org) => org.role === 'owner';

  const openEdit = (org) => {
    setEditForm({
      name: org.name || '',
      slug: org.slug || '',
      description: (org.metadata && typeof org.metadata === 'object' ? org.metadata.description : '') || ''
    });
    setEditErrors({});
    setEditTarget(org);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditForm(null);
    setEditErrors({});
    setDiscardOpen(false);
  };

  const setField = (key, value) => setEditForm((f) => ({ ...f, [key]: value }));

  const editDirty = !!editForm && !!editTarget && (
    editForm.name !== editTarget.name ||
    editForm.slug !== editTarget.slug ||
    (editForm.description || '') !== ((editTarget.metadata && editTarget.metadata.description) || '')
  );

  const requestClose = () => {
    if (editing) return;
    if (editDirty) {
      setDiscardOpen(true);
      return;
    }
    closeEdit();
  };

  const validateEdit = () => {
    const errors = {};
    const cleanName = (editForm.name || '').trim();
    const cleanSlug = (editForm.slug || '').trim().toLowerCase();
    if (!cleanName) errors.name = 'Organization name is required';
    else if (cleanName.length < 2) errors.name = 'Name must be at least 2 characters';
    if (!cleanSlug) errors.slug = 'Slug is required';
    else if (!SLUG_RE.test(cleanSlug)) errors.slug = 'Lowercase letters, numbers and hyphens only';
    else if (cleanSlug.length < 3 || cleanSlug.length > 63) errors.slug = 'Slug must be 3–63 characters';
    return errors;
  };

  const saveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editForm || !editTarget) return;
    const errors = validateEdit();
    if (Object.keys(errors).length) {
      setEditErrors(errors);
      return;
    }
    setEditing(true);
    setEditErrors({});
    try {
      const updated = await developerApi.updateOrganization(editTarget.id, {
        name: editForm.name.trim(),
        slug: editForm.slug.trim().toLowerCase(),
        metadata: { ...(editTarget.metadata || {}), description: editForm.description.trim() }
      });
      toast.success(`“${updated.name || editForm.name.trim()}” updated`);
      closeEdit();
      refresh();
      window.dispatchEvent(new CustomEvent('organizationchange', { detail: { id: getOrganizationId() || null } }));
    } catch (err) {
      const message = err.message || 'Failed to update organization';
      if (err.status === 404 || err.code === 'ORG_NOT_FOUND' || /not found|no longer exists/i.test(message)) {
        toast.error('This organization no longer exists. Refreshing…');
        closeEdit();
        refresh();
        window.dispatchEvent(new CustomEvent('organizationchange', { detail: { id: getOrganizationId() || null } }));
        return;
      }
      const errors = {};
      if (/slug/i.test(message)) errors.slug = message;
      else if (/name/i.test(message)) errors.name = message;
      else errors.form = message;
      setEditErrors(errors);
      toast.error(message);
    } finally {
      setEditing(false);
    }
  };

  if (loading && !data) {
    return (
      <div>
        <Skeleton className="h-8 w-64 rounded mb-6" />
        <Skeleton className="h-32 rounded-2xl mb-4" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Organizations</h1>
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      </div>
    );
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-zinc-500 mt-1">Multi-tenant workspaces. Each org isolates agents, keys, webhooks, billing and analytics.</p>
        </div>
        <Link to="/developer/organizations/members" className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 font-medium px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
          <FiUsers size={14} /> Members &amp; Roles
        </Link>
      </header>

      <Card dense title="Create organization" subtitle="A new org starts empty — invite members to share it" className="mb-4">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name (e.g. Acme Corp)"
            aria-label="Organization name"
            className="flex-1 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug (optional)"
            aria-label="Organization slug"
            className="sm:w-40 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            {creating ? <FiLoader size={14} className="animate-spin" /> : <FiPlus size={14} />} Create
          </button>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Your organizations</h2>
        <span className="text-xs text-zinc-500">{(data || []).length} org{data?.length === 1 ? '' : 's'}</span>
      </div>

      <div className="space-y-2">
        {(data || []).length === 0 ? (
          <EmptyState icon={<FiUsers size={28} />} title="No organizations yet" description="Create your first organization to get started." />
        ) : (
          data.map((org) => {
            const isActive = org.id === activeId;
            const md = org.metadata && typeof org.metadata === 'object' ? org.metadata : {};
            const members = md.memberCount ?? md.membersCount;
            const projects = md.projectCount ?? md.projectsCount;
            const apiKeys = md.apiKeyCount ?? md.apiKeys;
            const metaParts = [];
            if (org.createdAt) {
              metaParts.push(`Created ${new Date(org.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`);
            }
            if (members != null) metaParts.push(`${members} member${members === 1 ? '' : 's'}`);
            if (projects != null) metaParts.push(`${projects} project${projects === 1 ? '' : 's'}`);
            if (apiKeys != null) metaParts.push(`${apiKeys} API key${apiKeys === 1 ? '' : 's'}`);
            return (
              <div key={org.id} className={`flex flex-wrap items-center gap-3 bg-zinc-900/50 border rounded-xl px-4 py-3 ${isActive ? 'border-blue-700/60' : 'border-zinc-800/70'}`}>
                <span className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                  {org.name?.[0]?.toUpperCase() || 'O'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-100 flex items-center gap-2">
                    {org.name}
                    {org.isPersonal && <span className="text-[10px] uppercase tracking-wide bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">Personal</span>}
                    {isActive && <span className="text-[10px] uppercase tracking-wide bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full">Active</span>}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">/{org.slug} · you are {org.role}</p>
                  {metaParts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-zinc-500">
                      {metaParts.map((part, idx) => (
                        <span key={part} className="flex items-center gap-2">
                          {idx > 0 && <span className="text-zinc-700">·</span>}
                          {part}
                        </span>
                      ))}
                    </div>
                  )}
                  {md.description && <p className="text-xs text-zinc-500 mt-1 truncate">{md.description}</p>}
                </div>
                <div className="flex items-center gap-2.5">
                  {canEditOrg(org) && (
                    <button
                      type="button"
                      onClick={() => openEdit(org)}
                      className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg"
                      title="Edit organization"
                      aria-label={`Edit ${org.name}`}
                    >
                      <FiEdit3 size={13} /> Edit
                    </button>
                  )}
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => switchTo(org.id)}
                      className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg"
                    >
                      <FiCheck size={13} /> Switch
                    </button>
                  )}
                  <Link to="/developer/organizations/members" className="text-sm text-zinc-400 hover:text-white p-2" title="Manage members" aria-label="Manage members">
                    <FiUsers size={15} />
                  </Link>
                  {!org.isPersonal && (
                    <button
                      type="button"
                      onClick={() => setConfirmId(org.id)}
                      className="text-sm text-zinc-500 hover:text-red-400 p-2"
                      title="Delete organization"
                      aria-label="Delete organization"
                    >
                      <FiTrash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal open={!!confirmId} onClose={() => setConfirmId(null)} title="Delete organization" subtitle="This permanently deletes the organization and its shared settings.">
        <p className="text-sm text-zinc-400 mb-4">
          Organizations with active resources (agents, API keys, webhooks, subscriptions) cannot be deleted. You must be the owner to delete an organization.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmId(null)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            {busy ? <FiLoader size={14} className="animate-spin" /> : <FiTrash2 size={14} />} Delete
          </button>
        </div>
      </Modal>

      <Modal open={!!editTarget && !discardOpen} onClose={requestClose} title="Edit organization" subtitle={editTarget ? `Update ${editTarget.name}` : undefined}>
        {editForm && (
          <form onSubmit={saveEdit} noValidate>
            {editErrors.form && (
              <div className="mb-4">
                <ErrorBanner message={editErrors.form} onRetry={() => setEditErrors((er) => ({ ...er, form: undefined }))} />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1" htmlFor="org-edit-name">Organization name</label>
                <input
                  id="org-edit-name"
                  value={editForm.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Acme Corp"
                  className={editErrors.name ? INPUT_ERROR_CLASS : INPUT_CLASS}
                  aria-invalid={!!editErrors.name}
                  aria-describedby={editErrors.name ? 'org-edit-name-error' : undefined}
                />
                {editErrors.name && <p id="org-edit-name-error" role="alert" className="text-xs text-red-400 mt-1">{editErrors.name}</p>}
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1" htmlFor="org-edit-slug">Slug</label>
                <div className="flex items-center gap-1 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="text-sm text-zinc-500 font-mono shrink-0">/</span>
                  <input
                    id="org-edit-slug"
                    value={editForm.slug}
                    onChange={(e) => setField('slug', e.target.value.toLowerCase())}
                    placeholder="acme-corp"
                    className="flex-1 bg-transparent text-sm font-mono focus:outline-none text-white"
                    aria-invalid={!!editErrors.slug}
                    aria-describedby={editErrors.slug ? 'org-edit-slug-error' : undefined}
                  />
                </div>
                {editErrors.slug && <p id="org-edit-slug-error" role="alert" className="text-xs text-red-400 mt-1">{editErrors.slug}</p>}
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1" htmlFor="org-edit-desc">Description</label>
                <textarea
                  id="org-edit-desc"
                  value={editForm.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="What does this organization do?"
                  rows={3}
                  className={`${INPUT_CLASS} resize-none`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={requestClose}
                disabled={editing}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editing}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold"
              >
                {editing ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />}
                {editing ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          closeEdit();
        }}
        title="Discard changes?"
        description="You have unsaved changes to this organization. They will be lost if you continue."
        confirmLabel="Discard"
        confirmClassName="bg-red-600 hover:bg-red-500"
      />

      <div className="mt-4">
        <Link to="/developer/organizations/settings" className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-300 transition-colors">
          <FiSettings size={14} /> Active organization settings
          <FiArrowRight size={14} className="text-zinc-500" />
        </Link>
      </div>
    </div>
  );
};

export default DevOrganizations;
