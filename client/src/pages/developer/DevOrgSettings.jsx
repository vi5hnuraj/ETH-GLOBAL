import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FiSave, FiLoader, FiActivity } from 'react-icons/fi';
import developerApi from '../../utils/developerApi';
import { getOrganizationId, setOrganizationId } from '../../utils/identity';
import useApi from '../../hooks/useApi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';

const DevOrgSettings = () => {
  const storedOrgId = getOrganizationId();
  const currentRes = useApi({ fetcher: () => developerApi.currentOrganization(), enabled: !!storedOrgId, deps: [storedOrgId] });
  const orgId = currentRes.data?.organization?.id || storedOrgId;
  const settingsRes = useApi({ fetcher: () => developerApi.orgSettings(orgId), enabled: !!orgId, deps: [orgId] });
  const auditRes = useApi({ fetcher: () => developerApi.orgAuditLogs(orgId, { limit: 50 }), enabled: !!orgId, deps: [orgId] });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentRes.data?.organization?.id && currentRes.data.organization.id !== storedOrgId) {
      setOrganizationId(currentRes.data.organization.id);
    }
  }, [currentRes.data?.organization?.id, storedOrgId]);

  const saved = settingsRes.data;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await developerApi.saveOrgSettings(orgId, form);
      setForm(updated);
      settingsRes.refresh();
      toast.success('Organization settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if ((settingsRes.loading && !saved) || (storedOrgId && currentRes.loading && !currentRes.data)) {
    return (
      <div>
        <Skeleton className="h-8 w-56 rounded mb-6" />
        <Skeleton className="h-40 rounded-2xl mb-6" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (settingsRes.error && !saved) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Organization Settings</h1>
        <ErrorBanner message={settingsRes.error.message} onRetry={settingsRes.refresh} setupRequired={settingsRes.error.setupRequired} />
      </div>
    );
  }

  const current = form || saved || {};

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organization Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Settings for the active organization.</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !form}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2"
        >
          {saving ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />} Save Settings
        </button>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Organization profile" subtitle="Team-facing details">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1" htmlFor="org-billing-email">Billing email</label>
              <input
                id="org-billing-email"
                value={current.billingEmail || ''}
                onChange={(e) => set('billingEmail', e.target.value)}
                placeholder="billing@company.com"
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1" htmlFor="org-website">Company website</label>
              <input
                id="org-website"
                value={current.website || ''}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://company.com"
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1" htmlFor="org-timezone">Timezone</label>
              <input
                id="org-timezone"
                value={current.timezone || ''}
                onChange={(e) => set('timezone', e.target.value)}
                placeholder="UTC"
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </Card>

        <Card title="Audit log" subtitle="Security events for this organization">
          {auditRes.error && <ErrorBanner message={auditRes.error.message} onRetry={auditRes.refresh} />}
          <div className="max-h-80 overflow-y-auto">
            {!auditRes.error && auditRes.data?.length === 0 ? (
              <EmptyState icon={<FiActivity size={24} />} title="No events yet" description="Actions like member changes and settings updates appear here." />
            ) : (
              <div className="space-y-2">
                {(auditRes.data || []).map((e) => (
                  <div key={e.id} className="flex items-start gap-3 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 text-xs">
                    <span className="text-zinc-500 font-mono shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                    <div className="min-w-0">
                      <p className="font-mono text-blue-300">{e.action}</p>
                      <p className="text-zinc-600 truncate">by {e.actorId}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DevOrgSettings;
