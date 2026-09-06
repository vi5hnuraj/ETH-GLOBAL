import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiRefreshCw, FiEye, FiEyeOff, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import developerApi from '../../utils/developerApi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Modal from '../../components/dev/Modal';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Toggle from '../../components/dev/Toggle';
import EmptyState from '../../components/dev/EmptyState';
import CopyButton from '../../components/dev/CopyButton';
import useApi from '../../hooks/useApi';

const ALL_EVENTS = [
  'agent.created',
  'wallet.created',
  'payment.completed',
  'payment.failed',
  'api_key.rotated',
  'service.created',
  'service.updated',
  'usage.reported',
  'invoice.created',
  'invoice.paid',
  'invoice.failed',
  'marketplace.purchase',
  'policy.updated',
  'capability.updated',
  'purchase.session.created',
  'purchase.session.approved',
  'purchase.session.started',
  'purchase.session.cancelled',
  'purchase.session.completed',
  'purchase.session.invoice_generated',
  'purchase.session.paid',
  'purchase.session.closed',
  'profile.updated',
  'workflow.template.created',
  'workflow.deployed',
  'network.provider.switched',
  'agent.published',
  'agent.updated',
  'agent.installed',
  'agent.uninstalled',
  'agent.version.published',
  'agent.subscription.changed',
  'agent.invoked',
  'agent.review.submitted',
  'agent.removed'
];

const EVENT_LABELS = {
  'agent.created': 'Agent Created',
  'wallet.created': 'Wallet Created',
  'payment.completed': 'Payment Completed',
  'payment.failed': 'Payment Failed',
  'api_key.rotated': 'API Key Rotated',
  'service.created': 'Service Created',
  'service.updated': 'Service Updated',
  'usage.reported': 'Usage Reported',
  'invoice.created': 'Invoice Created',
  'invoice.paid': 'Invoice Paid',
  'invoice.failed': 'Invoice Failed',
  'marketplace.purchase': 'Marketplace Purchase',
  'policy.updated': 'Policy Updated',
  'capability.updated': 'Capability Updated',
  'purchase.session.created': 'Purchase Session Created',
  'purchase.session.approved': 'Purchase Session Approved',
  'purchase.session.started': 'Purchase Session Started',
  'purchase.session.cancelled': 'Purchase Session Cancelled',
  'purchase.session.completed': 'Purchase Session Completed',
  'purchase.session.invoice_generated': 'Invoice Generated',
  'purchase.session.paid': 'Session Paid',
  'purchase.session.closed': 'Session Closed',
  'profile.updated': 'Profile Updated',
  'workflow.template.created': 'Workflow Template Created',
  'workflow.deployed': 'Workflow Deployed',
  'network.provider.switched': 'Network Provider Switched',
  'agent.published': 'Agent Published',
  'agent.updated': 'Agent Updated',
  'agent.installed': 'Agent Installed',
  'agent.uninstalled': 'Agent Uninstalled',
  'agent.version.published': 'Agent Version Published',
  'agent.subscription.changed': 'Agent Subscription Changed',
  'agent.invoked': 'Agent Invoked',
  'agent.review.submitted': 'Agent Review Submitted',
  'agent.removed': 'Agent Removed'
};

const DevWebhooks = () => {
  const endpoints = useApi({ fetcher: developerApi.webhooks });
  const deliveries = useApi({ fetcher: developerApi.webhookDeliveries });

  const [allEvents, setAllEvents] = useState(ALL_EVENTS);

  useEffect(() => {
    let cancelled = false;
    developerApi.webhookEvents()
      .then((events) => {
        if (!cancelled && Array.isArray(events) && events.length) setAllEvents(events);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([...ALL_EVENTS]);
  const [saving, setSaving] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState({});
  const [createdSecret, setCreatedSecret] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setUrl(''); setDescription(''); setSelectedEvents([...allEvents]);
    setModal(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    setUrl(e.url); setDescription(e.description || ''); setSelectedEvents(e.events || []);
    setModal(true);
  };

  const save = async () => {
    if (!url.trim()) return toast.error('Enter a webhook URL');
    if (!/^https?:\/\//.test(url)) return toast.error('Use a valid http(s) URL');
    if (selectedEvents.length === 0) return toast.error('Select at least one event');
    setSaving(true);
    try {
      if (editing) {
        await developerApi.updateWebhook(editing.id, { url, description, events: selectedEvents });
        toast.success('Webhook endpoint updated');
      } else {
        const res = await developerApi.createWebhook({ url, description, events: selectedEvents });
        setCreatedSecret(res.secretKey);
        toast.success('Webhook endpoint created');
      }
      setModal(false);
      await Promise.all([endpoints.refresh(), deliveries.refresh({ background: true })]);
    } catch (err) {
      toast.error(err.message || 'Failed to save webhook');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await developerApi.deleteWebhook(confirmDelete.id);
      toast.success('Webhook endpoint deleted');
      await Promise.all([endpoints.refresh(), deliveries.refresh({ background: true })]);
    } catch (err) {
      toast.error(err.message || 'Failed to delete webhook');
    } finally {
      setConfirmDelete(null);
    }
  };

  const toggleActive = async (e) => {
    try {
      await developerApi.updateWebhook(e.id, { isActive: !e.isActive });
      toast.success(e.isActive ? 'Webhook disabled' : 'Webhook enabled');
      await endpoints.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to update webhook');
    }
  };

  const retry = async (d) => {
    setRetrying(d.id);
    try {
      await developerApi.retryWebhookDelivery(d.id);
      toast.success('Delivery retried');
      await deliveries.refresh();
    } catch (err) {
      toast.error(err.message || 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  if (endpoints.loading && !endpoints.data) {
    return (
      <div>
        <Skeleton className="h-8 w-48 rounded mb-6" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (endpoints.error && !endpoints.data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Webhooks</h1>
        <ErrorBanner message={endpoints.error.message} onRetry={endpoints.refresh} setupRequired={endpoints.error.setupRequired} />
      </div>
    );
  }

  const list = endpoints.data || [];

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-zinc-500 mt-1">Receive real-time events about your agents.</p>
        </div>
        <button type="button" onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2">
          <FiPlus /> Create Endpoint
        </button>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Endpoints */}
        <Card title={`Endpoints (${list.length})`} subtitle="Where GlobalPay posts signed events">
          {list.length === 0 ? (
            <EmptyState
              icon={<FiRefreshCw size={26} />}
              title="No webhook endpoints yet"
              description="Create an endpoint to receive agent.created, payment.completed and more."
              primary={{ label: 'Create Endpoint', onClick: openCreate, icon: <FiPlus size={15} /> }}
            />
          ) : (
            <div className="space-y-3">
              {list.map((e) => (
                <div key={e.id} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.description || e.url}</p>
                      <code className="font-mono text-xs text-zinc-500 break-all">{e.url}</code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle checked={e.isActive} onChange={() => toggleActive(e)} label="Enable/disable" />
                      <button type="button" onClick={() => openEdit(e)} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" title="Edit" aria-label="Edit webhook"><FiEdit2 size={14} /></button>
                      <button type="button" onClick={() => setConfirmDelete(e)} className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Delete" aria-label="Delete webhook"><FiTrash2 size={14} /></button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(e.events || []).map((ev) => (
                      <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/50">
                        {EVENT_LABELS[ev] || ev}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                    <span className="text-xs text-zinc-600 shrink-0">Secret:</span>
                    <code className="font-mono text-xs text-zinc-400 flex-1 truncate">
                      {revealedSecrets[e.id] ? e.secretKey : 'whsec_••••••••••••••••••'}
                    </code>
                    <button type="button" onClick={() => setRevealedSecrets((s) => ({ ...s, [e.id]: !s[e.id] }))} className="text-zinc-500 hover:text-white" title="Reveal secret" aria-label={revealedSecrets[e.id] ? 'Hide secret' : 'Reveal secret'} aria-pressed={!!revealedSecrets[e.id]}>
                      {revealedSecrets[e.id] ? <FiEyeOff size={13} /> : <FiEye size={13} />}
                    </button>
                    <CopyButton text={e.secretKey} label="" className="px-1.5 py-0.5" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Deliveries */}
        <Card title="Recent Deliveries" subtitle="Webhook event logs" action={
          <button type="button" onClick={() => deliveries.refresh({ background: true })} className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1">
            <FiRefreshCw size={12} /> Refresh
          </button>
        }>
          {deliveries.loading && !deliveries.data ? (
            <Skeleton className="h-10 w-full rounded-lg" lines={5} />
          ) : (deliveries.data || []).length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center">No deliveries yet. Events appear when agents are created or payments complete.</p>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {(deliveries.data || []).map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{EVENT_LABELS[d.event] || d.event}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">{new Date(d.createdAt).toLocaleString()} · {d.attempts} attempt{d.attempts !== 1 ? 's' : ''}{d.durationMs != null ? ` · ${d.durationMs}ms` : ''}</p>
                    {d.errorMessage && <p className="text-[11px] text-red-400/80 mt-0.5 truncate">⚠ {d.errorMessage}</p>}
                    <code className="text-[11px] text-zinc-400 block truncate">{d.endpointUrl}</code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {d.status === 'delivered' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase text-emerald-400"><FiCheckCircle size={12} /> Delivered</span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase text-red-400" title={d.errorMessage || undefined}>
                          <FiXCircle size={12} /> Failed{d.responseStatus ? ` · HTTP ${d.responseStatus}` : ''}
                        </span>
                        <button type="button" onClick={() => retry(d)} disabled={retrying === d.id} className="text-[11px] text-amber-400 hover:text-amber-300">
                          {retrying === d.id ? 'Retrying…' : 'Retry'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Create/edit modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Webhook Endpoint' : 'Create Webhook Endpoint'}
        subtitle="Subscribe to agent lifecycle and payment events"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block" htmlFor="webhook-url">Endpoint URL</label>
            <input
              id="webhook-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.com/webhooks/globalpay"
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block" htmlFor="webhook-description">Description</label>
            <input
              id="webhook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Payment notifications"
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <span className="text-xs text-zinc-500 mb-2 block">Events</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allEvents.map((ev) => {
                const checked = selectedEvents.includes(ev);
                return (
                  <button
                    key={ev}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => setSelectedEvents((s) => checked ? s.filter((x) => x !== ev) : [...s, ev])}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left ${
                      checked ? 'bg-blue-600/20 border-blue-700 text-blue-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${checked ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                    {EVENT_LABELS[ev] || ev}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Endpoint'}
          </button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Delete webhook endpoint?"
        description="This deletes the endpoint and its delivery logs. This cannot be undone."
        confirmLabel="Delete"
      />

      {/* One-time secret reveal */}
      {createdSecret && (
        <div className="mt-6 bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4">
          <p className="text-sm text-emerald-400 font-medium mb-2">🔑 Signing secret — save it now. Shown only once. Verify with <code className="text-emerald-300">x-globalpay-signature</code>.</p>
          <div className="flex items-center gap-2">
            <code className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm flex-1 truncate">{createdSecret}</code>
            <CopyButton text={createdSecret} label="Copy" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DevWebhooks;
