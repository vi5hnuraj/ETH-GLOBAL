import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FiPlus, FiBookOpen, FiEdit2, FiCopy, FiPower, FiTrash2, FiRefreshCw, FiSearch,
  FiCheckCircle, FiXCircle, FiClock, FiZap, FiActivity, FiShield, FiX, FiDownload,
  FiChevronRight, FiKey, FiFilter, FiRadio, FiAlertTriangle, FiRotateCw, FiExternalLink
} from 'react-icons/fi';
import developerApi from '../../utils/developerApi';
import Card from '../../components/dev/Card';
import ErrorBanner from '../../components/dev/ErrorBanner';

/* ─────────────────────────── helpers ─────────────────────────── */

const timeAgo = (iso) => {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const prettyUrl = (u) => {
  try { const { hostname, pathname } = new URL(u); return `${hostname}${pathname}`; } catch { return u; }
};

const STATUS_STYLES = {
  delivered: { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'OK' },
  failed: { dot: 'bg-rose-400', text: 'text-rose-400', bg: 'bg-rose-500/10', label: 'Failed' },
  pending: { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Pending' }
};

const Code = ({ children, className = '' }) => (
  <code className={`font-mono text-[11px] rounded bg-zinc-950 px-1.5 py-0.5 text-zinc-300 ${className}`}>{children}</code>
);

const CopyBtn = ({ value, label = 'Copy', className = '' }) => (
  <button
    onClick={() => { navigator.clipboard.writeText(value ?? ''); toast.success('Copied'); }}
    className={`inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors ${className}`}
    title="Copy to clipboard"
  >
    <FiCopy size={11} />{label}
  </button>
);

/* ─────────────────────────── skeletons ─────────────────────────── */

const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded bg-zinc-800/70 ${className}`} />;

const StatsSkeleton = () => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
  </div>
);

const RowsSkeleton = ({ rows = 5 }) => (
  <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
);

/* ─────────────────────────── stats strip ─────────────────────────── */

const StatTile = ({ label, value, sub, tone = 'text-white', icon: Icon }) => (
  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      {Icon && <Icon size={13} className="text-zinc-600" />}
    </div>
    <p className={`mt-1.5 text-xl font-semibold ${tone}`}>{value}</p>
    {sub && <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>}
  </div>
);

/* ─────────────────────────── endpoint card ─────────────────────────── */

const EndpointCard = ({ ep, onEdit, onRotate, onToggle, onDelete, busy }) => {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ep.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700/40 text-zinc-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${ep.isActive ? 'animate-pulse bg-emerald-400' : 'bg-zinc-500'}`} />
              {ep.isActive ? 'Active' : 'Disabled'}
            </span>
            <span className="text-[10px] text-zinc-600">Created {timeAgo(ep.createdAt)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <a href={ep.url} target="_blank" rel="noreferrer" className="truncate font-mono text-sm text-zinc-100 hover:text-cyan-300 hover:underline" title={ep.url}>
              {ep.url}
            </a>
            <FiExternalLink size={11} className="shrink-0 text-zinc-600" />
          </div>
          {ep.description && <p className="mt-1 text-xs text-zinc-500">{ep.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn title="Edit endpoint" onClick={onEdit} disabled={busy}><FiEdit2 size={13} /></IconBtn>
          <IconBtn title="Rotate signing secret" onClick={onRotate} disabled={busy}><FiRotateCw size={13} /></IconBtn>
          <IconBtn title={ep.isActive ? 'Disable endpoint' : 'Enable endpoint'} onClick={onToggle} disabled={busy}>
            <FiPower size={13} className={ep.isActive ? 'text-amber-400' : 'text-emerald-400'} />
          </IconBtn>
          <IconBtn title="Delete endpoint" onClick={onDelete} disabled={busy} danger><FiTrash2 size={13} /></IconBtn>
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-t border-zinc-800/60 pt-3 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Signing secret</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate font-mono text-xs text-zinc-300">
              {reveal ? ep.secretKey : `••••••••${ep.secretKey?.slice(-4) || ''}`}
            </span>
            <button onClick={() => setReveal((v) => !v)} className="text-[10px] text-zinc-500 hover:text-zinc-300">{reveal ? 'Hide' : 'Reveal'}</button>
            <CopyBtn value={ep.secretKey} />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Events · {ep.events?.length ?? 0}</p>
          <div className="mt-1 flex max-h-[52px] flex-wrap gap-1 overflow-hidden">
            {(ep.events || []).slice(0, 6).map((e) => <Code key={e}>{e}</Code>)}
            {(ep.events?.length || 0) > 6 && <span className="text-[10px] text-zinc-500">+{ep.events.length - 6} more</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

const IconBtn = ({ children, title, onClick, disabled, danger }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-40 ${danger ? 'hover:border-rose-500/50 hover:text-rose-400' : ''}`}
  >
    {children}
  </button>
);

/* ─────────────────────────── delivery row ─────────────────────────── */

const DeliveryRow = ({ d, onOpen }) => {
  const ok = d.status === 'delivered';
  const st = STATUS_STYLES[d.status] || STATUS_STYLES.pending;
  return (
    <button
      onClick={() => onOpen(d)}
      className="grid w-full grid-cols-[64px_1fr] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/40 md:grid-cols-[70px_1fr_1fr_90px_70px_54px_28px]"
    >
      <span className={`inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold font-mono ${ok ? 'bg-emerald-500/10 text-emerald-400' : d.responseStatus ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
        {d.responseStatus || (ok ? '2xx' : '—')}
      </span>
      <span className="truncate font-mono text-xs text-zinc-200">{d.event}</span>
      <span className="hidden truncate text-xs text-zinc-500 md:block">{d.endpointUrl ? prettyUrl(d.endpointUrl) : '—'}</span>
      <span className="hidden text-xs text-zinc-500 md:block">{timeAgo(d.createdAt)}</span>
      <span className="hidden font-mono text-xs text-zinc-500 md:block">{d.durationMs != null ? `${d.durationMs} ms` : '—'}</span>
      <span className="hidden font-mono text-xs md:block">
        <span className={d.attempts > 1 ? 'text-amber-400' : 'text-zinc-500'}>{d.attempts ?? 0}</span>
      </span>
      <FiChevronRight size={13} className="hidden text-zinc-600 md:block" />
    </button>
  );
};

/* ─────────────────────────── delivery drawer ─────────────────────────── */

const DeliveryDrawer = ({ id, onClose, onReplay, onRetry }) => {
  const { data: d, loading, error } = useQuery({
    queryKey: ['webhook-delivery', id],
    queryFn: () => developerApi.webhookDelivery(id),
    enabled: !!id
  });
  const [tab, setTab] = useState('payload');
  const ok = d?.status === 'delivered';

  const download = () => {
    const blob = new Blob([JSON.stringify(d?.payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d?.event?.replace(/\./g, '_')}_${d?.id?.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
              {d?.responseStatus || (ok ? 'OK' : 'ERR')}
            </span>
            <div>
              <p className="font-mono text-sm text-zinc-100">{d?.event || '…'}</p>
              <p className="text-[11px] text-zinc-500">{d?.endpointUrl ? prettyUrl(d.endpointUrl) : ''} · {timeAgo(d?.createdAt)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"><FiX size={16} /></button>
        </div>

        {loading && <div className="p-5"><RowsSkeleton rows={6} /></div>}
        {error && <div className="p-5"><ErrorBanner message={error.message} onRetry={onClose} /></div>}

        {d && (
          <>
            <div className="grid grid-cols-4 gap-2 border-b border-zinc-800 px-5 py-3 text-center">
              {[
                ['Status', ok ? 'Delivered' : 'Failed'],
                ['Duration', d.durationMs != null ? `${d.durationMs} ms` : '—'],
                ['Attempts', d.attempts ?? 0],
                ['Dead letter', d.deadLetter ? 'Yes' : 'No']
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600">{k}</p>
                  <p className={`mt-0.5 text-xs font-semibold ${k === 'Status' ? (ok ? 'text-emerald-400' : 'text-rose-400') : 'text-zinc-200'}`}>{v}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-1 border-b border-zinc-800 px-5 pt-3">
              {['payload', 'headers', 'response', 'security'].map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-t-lg px-3 py-2 text-xs font-medium capitalize transition-colors ${tab === t ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'payload' && (
                <pre className="max-h-full overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
                  {JSON.stringify(d.payload, null, 2)}
                </pre>
              )}
              {tab === 'headers' && (
                <div className="space-y-1.5">
                  {Object.entries(d.sentHeaders || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                      <span className="font-mono text-[11px] text-zinc-500">{k}</span>
                      <span className="truncate font-mono text-[11px] text-zinc-300">{v || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'response' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>HTTP {d.responseStatus || '—'}</span>
                    {d.errorMessage && <span className="text-zinc-500">· {d.errorMessage}</span>}
                  </div>
                  <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-[11px] text-zinc-300">
                    {d.responseBody || 'No response body captured.'}
                  </pre>
                </div>
              )}
              {tab === 'security' && (
                <div className="space-y-3 text-xs">
                  {[
                    ['Request ID', d.requestId],
                    ['Signature header', d.signatureHeader],
                    ['Signature', d.signature],
                    ['Timestamp header', d.timestampHeader]
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-600">{k}</p>
                        {v && <CopyBtn value={v} />}
                      </div>
                      <p className="mt-1 break-all font-mono text-[11px] text-zinc-300">{v || '—'}</p>
                    </div>
                  ))}
                  <p className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-[11px] text-violet-300">
                    <FiShield className="mr-1 inline" size={11} />
                    Every delivery is HMAC-SHA256 signed with your endpoint secret and timestamped. Reject signatures older than 5 minutes to block replay attacks.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-zinc-800 px-5 py-3">
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(d.payload, null, 2)); toast.success('Payload copied'); }}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white">
                <FiCopy size={12} /> Copy Payload
              </button>
              <button onClick={download}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white">
                <FiDownload size={12} /> Download JSON
              </button>
              <div className="flex-1" />
              <button onClick={() => onRetry(d.id)}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white">
                <FiRefreshCw size={12} /> Redeliver
              </button>
              <button onClick={() => onReplay(d.id)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">
                <FiZap size={12} /> Replay Event
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────── create/edit modal ─────────────────────────── */

const EndpointModal = ({ initial, events, onClose, onSave, saving, created }) => {
  const [url, setUrl] = useState(initial?.url || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [selected, setSelected] = useState(new Set(initial?.events || events));

  const toggle = (e) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(e) ? next.delete(e) : next.add(e);
    return next;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        {created ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><FiCheckCircle size={24} /></div>
            <h3 className="mt-3 text-lg font-semibold text-white">Endpoint created</h3>
            <p className="mt-1 text-xs text-zinc-500">Save your signing secret now — it is shown only once per rotation.</p>
            <div className="mt-5 space-y-3 text-left">
              {[['Webhook ID', created.id], ['Signing Secret', created.secretKey], ['Created', new Date(created.createdAt || Date.now()).toLocaleString()]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">{k}</p>
                    <CopyBtn value={v} />
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-zinc-200">{String(v)}</p>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="mt-5 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">Done</button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-white">{initial ? 'Edit endpoint' : 'Create endpoint'}</h3>
            <p className="mt-1 text-xs text-zinc-500">GlobalPay will POST signed JSON events to this URL.</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400">Endpoint URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/webhooks/globalpay"
                  className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400">Description <span className="text-zinc-600">(optional)</span></label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Production server"
                  className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">Events <span className="text-zinc-600">({selected.size}/{events.length})</span></label>
                  <button onClick={() => setSelected(selected.size === events.length ? new Set() : new Set(events))} className="text-[11px] text-violet-400 hover:text-violet-300">
                    {selected.size === events.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="mt-2 grid max-h-52 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 sm:grid-cols-2">
                  {events.map((e) => (
                    <label key={e} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800/50">
                      <input type="checkbox" checked={selected.has(e)} onChange={() => toggle(e)} className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-violet-500" />
                      <span className="font-mono text-[11px] text-zinc-300">{e}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400">Retry policy</label>
                <div className="mt-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-xs text-zinc-400">
                  Exponential backoff — up to <span className="font-semibold text-zinc-200">6 attempts</span> over 24h, then dead-letter. Configured per environment.
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:border-zinc-500">Cancel</button>
              <button onClick={() => onSave({ url, description, events: [...selected] })} disabled={saving}
                className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                {saving ? 'Saving…' : initial ? 'Save changes' : 'Create Endpoint'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────── test event modal ─────────────────────────── */

const TestEventModal = ({ events, defaultEndpointId, onClose }) => {
  const [event, setEvent] = useState(events[0] || 'agent.created');
  const [endpointId, setEndpointId] = useState(defaultEndpointId || '');
  const [result, setResult] = useState(null);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => developerApi.testWebhook({ event }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Test '${event}' dispatched`);
      qc.invalidateQueries({ queryKey: ['webhook-deliveries'] });
      qc.invalidateQueries({ queryKey: ['webhook-stats'] });
    },
    onError: (e) => toast.error(e.message)
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Send test event</h3>
        <p className="mt-1 text-xs text-zinc-500">Dispatches a signed payload to every active endpoint subscribed to the event.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-400">Event</label>
            <select value={event} onChange={(e) => setEvent(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-white focus:border-violet-500 focus:outline-none">
              {events.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Example payload</p>
            <pre className="mt-1 overflow-x-auto font-mono text-[10px] text-zinc-400">{`{
  "test": true,
  "event": "${event}",
  "timestamp": "<now>",
  "message": "GlobalPay webhook test event"
}`}</pre>
          </div>
          {result && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300">
              <FiCheckCircle className="mr-1 inline" size={12} />{result.message}
            </div>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
            {mutation.isPending ? 'Sending…' : 'Send Test Event'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── docs sidebar ─────────────────────────── */

const DOCS_SNIPPETS = {
  'Node.js': `import crypto from 'crypto';

export function verifyGlobalPayWebhook(req, secret) {
  const signature = req.headers['x-globalpay-signature'];
  const timestamp = req.headers['x-globalpay-timestamp'];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${JSON.stringify(req.body)}\`)
    .digest('hex');
  if (!crypto.timingSafeEqual(
    Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid webhook signature');
  }
}`,
  Python: `import hmac, hashlib, time

def verify_globalpay_webhook(body: bytes, headers: dict, secret: str):
    signature = headers["x-globalpay-signature"]
    timestamp = headers["x-globalpay-timestamp"]
    if time.time() - int(timestamp) > 300:
        raise ValueError("Signature expired (replay?)")
    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.".encode() + body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid webhook signature")`,
  Go: `func verifyGlobalPayWebhook(body []byte, sig, ts, secret string) error {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(append([]byte(ts+"."), body...))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return errors.New("invalid webhook signature")
	}
	return nil
}`,
  Rust: `use hmac::{Hmac, Mac};
use sha2::Sha256;

fn verify_globalpay_webhook(
    body: &[u8], sig: &str, ts: &str, secret: &str,
) -> Result<(), ()> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|_| ())?;
    mac.update(ts.as_bytes());
    mac.update(b".");
    mac.update(body);
    let expected = hex::encode(mac.finalize().into_bytes());
    if expected != sig { return Err(()); }
    Ok(())
}`
};

const DocsPanel = () => {
  const [lang, setLang] = useState('Node.js');
  return (
    <div className="hidden w-80 shrink-0 space-y-3 xl:block">
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><FiBookOpen size={13} className="text-violet-400" /> Verify signatures</h3>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          Every delivery is signed with <Code>x-globalpay-signature</Code> (HMAC-SHA256 of <Code>{'{timestamp}.{body}'}</Code>) and sent with <Code>x-globalpay-timestamp</Code>.
        </p>
        <div className="mt-3 flex gap-1">
          {Object.keys(DOCS_SNIPPETS).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`rounded-md px-2 py-1 text-[10px] font-medium ${lang === l ? 'bg-violet-600/20 text-violet-300' : 'text-zinc-500 hover:text-zinc-300'}`}>{l}</button>
          ))}
        </div>
        <div className="relative mt-2">
          <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">{DOCS_SNIPPETS[lang]}</pre>
          <button onClick={() => { navigator.clipboard.writeText(DOCS_SNIPPETS[lang]); toast.success('Snippet copied'); }}
            className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">
            <FiCopy size={10} />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><FiShield size={13} className="text-emerald-400" /> Security</h3>
        <ul className="mt-2 space-y-1.5 text-[11px] text-zinc-500">
          {[
            'HMAC-SHA256 signatures on every delivery',
            'Timestamp verification blocks replays (>5 min rejected)',
            'Secret rotation invalidates the previous secret instantly',
            'Delivery retries use exponential backoff, then dead-letter'
          ].map((t) => (
            <li key={t} className="flex gap-1.5"><FiCheckCircle size={11} className="mt-0.5 shrink-0 text-emerald-500" />{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* ─────────────────────────── main page ─────────────────────────── */

export default function DevWebhooks() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // { initial } | { created }
  const [showTest, setShowTest] = useState(false);
  const [drawerId, setDrawerId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [confirm, setConfirm] = useState(null); // { type, endpoint }

  const endpoints = useQuery({ queryKey: ['webhooks'], queryFn: developerApi.webhooks });
  const events = useQuery({ queryKey: ['webhook-events'], queryFn: developerApi.webhookEvents, staleTime: 5 * 60_000 });
  const stats = useQuery({ queryKey: ['webhook-stats'], queryFn: developerApi.webhookStats, refetchInterval: 15_000 });
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: () => developerApi.webhookDeliveries({ limit: 100 }),
    refetchInterval: 5_000
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['webhooks'] });
    qc.invalidateQueries({ queryKey: ['webhook-stats'] });
    qc.invalidateQueries({ queryKey: ['webhook-deliveries'] });
  };

  const createMut = useMutation({
    mutationFn: developerApi.createWebhook,
    onSuccess: (created) => { invalidate(); setModal({ created }); toast.success('Endpoint created'); },
    onError: (e) => toast.error(e.message)
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }) => developerApi.updateWebhook(id, body),
    onSuccess: () => { invalidate(); setModal(null); toast.success('Endpoint updated'); },
    onError: (e) => toast.error(e.message)
  });
  const deleteMut = useMutation({
    mutationFn: developerApi.deleteWebhook,
    onSuccess: () => { invalidate(); setConfirm(null); toast.success('Endpoint deleted'); },
    onError: (e) => toast.error(e.message)
  });
  const rotateMut = useMutation({
    mutationFn: developerApi.rotateWebhookSecret,
    onSuccess: (res) => { invalidate(); setModal({ created: { ...res, createdAt: new Date().toISOString() } }); toast.success('Secret rotated'); },
    onError: (e) => toast.error(e.message)
  });
  const retryMut = useMutation({
    mutationFn: developerApi.retryWebhookDelivery,
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['webhook-deliveries'] }); toast[res.ok ? 'success' : 'error'](res.ok ? `Redelivered — ${res.responseStatus}` : `Endpoint responded ${res.responseStatus}`); },
    onError: (e) => toast.error(e.message)
  });
  const replayMut = useMutation({
    mutationFn: developerApi.replayWebhookDelivery,
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['webhook-deliveries'] }); setDrawerId(null); toast[res.ok ? 'success' : 'error'](res.ok ? `Replayed — ${res.responseStatus}` : `Endpoint responded ${res.responseStatus}`); },
    onError: (e) => toast.error(e.message)
  });

  const allEvents = events.data || [];
  const filteredDeliveries = useMemo(() => {
    let list = deliveries.data || [];
    if (statusFilter !== 'all') list = list.filter((d) => statusFilter === 'failed' ? d.status === 'failed' : d.status === 'delivered');
    if (eventFilter !== 'all') list = list.filter((d) => d.event === eventFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.event?.toLowerCase().includes(q) || d.endpointUrl?.toLowerCase().includes(q));
    }
    return list;
  }, [deliveries.data, statusFilter, eventFilter, search]);

  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending || rotateMut.isPending;
  const endpointList = endpoints.data || [];

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Webhooks</h1>
          <p className="mt-1 text-sm text-zinc-500">Receive real-time events from GlobalPay.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTest(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
            <FiZap size={13} /> Send Test Event
          </button>
          <a href="/developer/docs" className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
            <FiBookOpen size={13} /> Documentation
          </a>
          <button onClick={() => setModal({ initial: null })} disabled={events.isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50">
            <FiPlus size={14} /> Create Endpoint
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-5">
        {stats.isLoading ? <StatsSkeleton /> : stats.error ? <ErrorBanner message={stats.error.message} onRetry={() => stats.refetch()} /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Endpoints" value={stats.data?.endpointsTotal ?? 0} sub={`${stats.data?.endpointsActive ?? 0} active`} icon={FiRadio} />
            <StatTile label="Deliveries 24h" value={stats.data?.deliveries24h ?? 0} icon={FiActivity} />
            <StatTile label="Success Rate" tone="text-emerald-400" value={stats.data?.successRate24h != null ? `${(stats.data.successRate24h * 100).toFixed(1)}%` : '—'} icon={FiCheckCircle} />
            <StatTile label="Failed 24h" tone={(stats.data?.failed24h || 0) > 0 ? 'text-rose-400' : 'text-white'} value={stats.data?.failed24h ?? 0} icon={FiXCircle} />
            <StatTile label="Avg Latency" value={stats.data?.avgLatencyMs != null ? `${stats.data.avgLatencyMs} ms` : '—'} icon={FiClock} />
            <StatTile label="Retry Queue" tone={(stats.data?.retryQueue || 0) > 0 ? 'text-amber-400' : 'text-white'} value={stats.data?.retryQueue ?? 0} sub={stats.data?.deadLettered24h ? `${stats.data.deadLettered24h} dead-lettered` : null} icon={FiAlertTriangle} />
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-5">
        <div className="min-w-0 flex-1 space-y-5">
          {/* Endpoints */}
          <Card title="Endpoints" subtitle={`${endpointList.length} configured`} action={
            <button onClick={() => endpoints.refetch()} className="text-zinc-500 transition-colors hover:text-white" title="Refresh"><FiRefreshCw size={13} className={endpoints.isFetching ? 'animate-spin' : ''} /></button>
          }>
            {endpoints.isLoading ? <RowsSkeleton rows={2} /> : endpoints.error ? <ErrorBanner message={endpoints.error.message} onRetry={() => endpoints.refetch()} /> : (
              endpointList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/10" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400">
                      <FiRadio size={26} />
                    </div>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-200">No webhook endpoints</h3>
                  <p className="mt-1 max-w-xs text-xs text-zinc-500">Create an endpoint to receive real-time events from GlobalPay — payments, agents, invoices and more.</p>
                  <button onClick={() => setModal({ initial: null })} className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
                    <FiPlus size={14} /> Create Endpoint
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {endpointList.map((ep) => (
                    <EndpointCard key={ep.id} ep={ep} busy={busy}
                      onEdit={() => setModal({ initial: ep })}
                      onRotate={() => setConfirm({ type: 'rotate', endpoint: ep })}
                      onToggle={() => updateMut.mutate({ id: ep.id, body: { isActive: !ep.isActive } })}
                      onDelete={() => setConfirm({ type: 'delete', endpoint: ep })}
                    />
                  ))}
                </div>
              )
            )}
          </Card>

          {/* Deliveries */}
          <Card
            title="Recent Deliveries"
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live · auto-refresh 5s
              </span>
            }
            action={<button onClick={() => deliveries.refetch()} className="text-zinc-500 hover:text-white" title="Refresh"><FiRefreshCw size={13} className={deliveries.isFetching ? 'animate-spin' : ''} /></button>}
          >
            {/* Filters */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <FiSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event or endpoint…"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300 focus:border-violet-500 focus:outline-none">
                <option value="all">All statuses</option>
                <option value="delivered">Successful</option>
                <option value="failed">Failed</option>
              </select>
              <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
                className="max-w-[170px] rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-300 focus:border-violet-500 focus:outline-none">
                <option value="all">All events</option>
                {[...new Set((deliveries.data || []).map((d) => d.event))].map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>

            {deliveries.isLoading ? <RowsSkeleton rows={5} /> : deliveries.error ? <ErrorBanner message={deliveries.error.message} onRetry={() => deliveries.refetch()} /> : (
              filteredDeliveries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-600"><FiActivity size={20} /></div>
                  <p className="mt-3 text-sm font-medium text-zinc-400">No deliveries{statusFilter !== 'all' || eventFilter !== 'all' ? ' match your filters' : ' yet'}</p>
                  <p className="mt-1 text-xs text-zinc-600">{endpointList.length === 0 ? 'Create an endpoint, then send a test event.' : 'Use “Send Test Event” to see a delivery appear live.'}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="hidden grid-cols-[70px_1fr_1fr_90px_70px_54px_28px] gap-3 px-3 pb-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600 md:grid">
                    <span>Status</span><span>Event</span><span>Endpoint</span><span>Time</span><span className="text-right">Duration</span><span className="text-right">Tries</span><span />
                  </div>
                  {filteredDeliveries.slice(0, 50).map((d) => <DeliveryRow key={d.id} d={d} onOpen={setDrawerId} />)}
                  {filteredDeliveries.length > 50 && <p className="pt-2 text-center text-[11px] text-zinc-600">Showing 50 most recent of {filteredDeliveries.length}</p>}
                </div>
              )
            )}
          </Card>
        </div>

        <DocsPanel />
      </div>

      {/* Modals & drawers */}
      {modal?.created && <EndpointModal created={modal.created} onClose={() => setModal(null)} />}
      {modal && modal.created === undefined && (
        <EndpointModal
          initial={modal.initial}
          events={allEvents}
          saving={createMut.isPending || updateMut.isPending}
          onClose={() => setModal(null)}
          onSave={({ url, description, events: evts }) => {
            if (!url.trim()) return toast.error('Enter a webhook URL');
            if (!/^https?:\/\//.test(url)) return toast.error('Use a valid http(s) URL');
            if (evts.length === 0) return toast.error('Select at least one event');
            modal.initial
              ? updateMut.mutate({ id: modal.initial.id, body: { url, description, events: evts } })
              : createMut.mutate({ url, description, events: evts });
          }}
        />
      )}
      {showTest && <TestEventModal events={allEvents} defaultEndpointId={endpointList.find((e) => e.isActive)?.id} onClose={() => setShowTest(false)} />}
      {drawerId && (
        <DeliveryDrawer id={drawerId} onClose={() => setDrawerId(null)}
          onRetry={(id) => retryMut.mutate(id)}
          onReplay={(id) => replayMut.mutate(id)}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${confirm.type === 'delete' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
              {confirm.type === 'delete' ? <FiTrash2 size={18} /> : <FiKey size={18} />}
            </div>
            <h3 className="mt-3 text-center text-base font-semibold text-white">
              {confirm.type === 'delete' ? 'Delete endpoint?' : 'Rotate signing secret?'}
            </h3>
            <p className="mt-1.5 text-center text-xs leading-relaxed text-zinc-500">
              {confirm.type === 'delete'
                ? `“${prettyUrl(confirm.endpoint.url)}” will stop receiving events immediately. Delivery history is kept. This cannot be undone.`
                : 'The previous secret stops verifying immediately. Update your server with the new secret shown after rotation.'}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:border-zinc-500">Cancel</button>
              <button
                onClick={() => confirm.type === 'delete' ? deleteMut.mutate(confirm.endpoint.id) : rotateMut.mutate(confirm.endpoint.id)}
                disabled={busy}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${confirm.type === 'delete' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'}`}
              >
                {busy ? 'Working…' : confirm.type === 'delete' ? 'Delete' : 'Rotate Secret'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
