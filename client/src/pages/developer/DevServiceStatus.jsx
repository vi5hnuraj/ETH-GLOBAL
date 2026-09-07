/**
 * DevServiceStatus — live service status dashboard.
 * All values come from /developers/monitoring + /platform/health (real data).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiCpu,
  FiDatabase,
  FiLink,
  FiMail
} from 'react-icons/fi';
import developerApi from '../../utils/developerApi.js';
import StatusBadge from '../../components/dev/StatusBadge.jsx';
import ErrorBanner from '../../components/dev/ErrorBanner.jsx';
import Skeleton from '../../components/dev/Skeleton.jsx';

const COMPONENT_META = {
  api: { label: 'API', icon: FiActivity, detail: (m) => `v${m.api?.version || '0.1.0'} · ${m.api?.environment || 'development'}` },
  database: { label: 'Database', icon: FiDatabase, detail: (m) => `${m.database?.latencyMs ?? 0}ms round-trip` },
  rpc: { label: 'Arc Chain RPC', icon: FiLink, detail: (m) => `block #${m.rpc?.blockNumber || '—'} · ${m.rpc?.latencyMs ?? 0}ms` },
  workers: { label: 'Workers', icon: FiCpu, detail: (m) => Object.keys(m.workers || {}).join(', ') || '—' }
};

const SectionLabel = ({ children }) => (
  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{children}</p>
);

const Panel = ({ title, subtitle, children }) => (
  <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl shadow-sm">
    <div className="px-4 pt-3.5 pb-1">
      <h3 className="text-[13px] font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
    </div>
    <div className="px-4 pb-3">{children}</div>
  </div>
);

const MetricCard = ({ icon, label, value, accent = 'text-white' }) => (
  <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4 shadow-sm">
    <div className={`mb-2.5 ${accent}`}>{icon}</div>
    <p className="text-2xl font-bold tracking-tight text-white tabular-nums leading-none">{value}</p>
    <p className="mt-1.5 text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">{label}</p>
  </div>
);

const mapStatus = (s) => {
  if (s === 'ok') return 'active';
  if (s === 'down') return 'failed';
  return 'pending';
};

const humanizeName = (name) => String(name || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ');

const DevServiceStatus = () => {
  const [monitoring, setMonitoring] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [m, h] = await Promise.all([
          developerApi.monitoring(),
          developerApi.platformHealth()
        ]);
        if (!cancelled) { setMonitoring(m); setHealth(h); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const statusText = useMemo(() => {
    if (health?.maintenance) return 'In maintenance';
    if (!health) return 'Checking…';
    return health.status === 'ok' ? 'Operational' : health.status === 'down' ? 'Down' : 'Degraded';
  }, [health]);

  const statusBadge = useMemo(() => {
    if (health?.maintenance) return 'pending';
    if (!health) return 'pending';
    return health.status === 'ok' ? 'active' : 'failed';
  }, [health]);

  const incidents = useMemo(() => {
    const labelMap = { api: 'API', database: 'Database', rpc: 'Arc Chain RPC', workers: 'Workers', mpc: 'MPC' };
    return Object.entries(health?.components || {})
      .filter(([, s]) => s === 'down' || s === 'degraded')
      .map(([key, s]) => ({ label: labelMap[key] || humanizeName(key), status: s }));
  }, [health]);

  const workerRows = useMemo(
    () => Object.entries(monitoring?.workers || {}).map(([name, w]) => ({
      name: humanizeName(name),
      running: w?.status === 'running'
    })),
    [monitoring]
  );

  const fmtInt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—');
  const fmtMs = (n) => (typeof n === 'number' && Number.isFinite(n) ? `${n}ms` : '—');
  const fmtPct = (n) => (typeof n === 'number' && Number.isFinite(n) ? `${n}%` : '—');

  if (error && !monitoring) {
    return <ErrorBanner message={error} />;
  }

  const m = monitoring || {};
  const usage = m.usage || {};
  const pct = usage.percentileLatencyMs || {};
  const p99 = pct['99'];
  const lastChecked = health?.timestamp ? new Date(health.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-xl font-bold tracking-tight text-white">Service Status</h2>
          <StatusBadge status={statusBadge}>{statusText}</StatusBadge>
        </div>
        <p className="text-[13px] text-zinc-400 mt-1">Live health of the API, database, RPC and background workers.</p>
      </div>

      {loading && !monitoring ? (
        <div className="grid md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <>
          <section>
            <SectionLabel>Infrastructure</SectionLabel>
            <div className="grid md:grid-cols-4 gap-3">
              {Object.entries(COMPONENT_META).map(([key, meta]) => {
                const state = health?.components?.[key] || 'pending';
                const Icon = meta.icon;
                return (
                  <div key={key} className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className={state === 'ok' ? 'text-emerald-400' : state === 'down' ? 'text-red-400' : 'text-amber-400'}>
                        <Icon size={18} />
                      </span>
                      <StatusBadge status={mapStatus(state)}>{state}</StatusBadge>
                    </div>
                    <p className="mt-3 text-[13px] font-semibold text-white">{meta.label}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{meta.detail(m)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <SectionLabel>Metrics</SectionLabel>
            <div className="grid md:grid-cols-3 gap-3">
              <MetricCard icon={<FiMail size={16} />} label="Requests (24h)" value={fmtInt(usage.requestsLast24h)} />
              <MetricCard icon={<FiClock size={16} />} label="Avg Latency" value={fmtMs(usage.avgLatencyMs)} accent="text-violet-400" />
              <MetricCard icon={<FiAlertTriangle size={16} />} label="Error Rate" value={fmtPct(usage.errorRate)} accent="text-rose-400" />
            </div>
          </section>
        </>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <Panel title="Workers" subtitle="Background jobs">
          {workerRows.length ? (
            workerRows.map(({ name, running }) => (
              <div key={name} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
                <span className="text-[13px] text-zinc-300 truncate mr-2" title={name}>{name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <span className={`h-2 w-2 rounded-full ${running ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  {running ? 'Running' : 'Stopped'}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-zinc-500 py-1">No workers running.</p>
          )}
        </Panel>

        <Panel title="Latency percentiles" subtitle="24h">
          {['p50', 'p90', 'p95', 'p99'].map((p) => {
            const ms = pct[p.slice(1)];
            const width = p99 > 0 && typeof ms === 'number' ? Math.max(0, Math.min(100, (ms / p99) * 100)) : 0;
            return (
              <div key={p} className="py-2 border-b border-zinc-800/60 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-zinc-500">{p}</span>
                  <span className="text-[13px] font-semibold text-white tabular-nums">{fmtMs(ms)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </Panel>
      </div>

      <Panel title="Recent Incidents">
        {incidents.length ? (
          incidents.map((inc) => (
            <div key={inc.label} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
              <span className="inline-flex items-center gap-2 text-[13px] text-zinc-300">
                <span className={`h-2 w-2 rounded-full ${inc.status === 'down' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                {inc.label}
              </span>
              <StatusBadge status={inc.status === 'down' ? 'failed' : 'pending'}>{inc.status}</StatusBadge>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2.5 py-1">
            <FiCheckCircle className="text-emerald-400 shrink-0" size={16} />
            <div>
              <p className="text-[13px] font-medium text-white">No active incidents</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                All systems operational{lastChecked ? ` · last checked ${lastChecked}` : ''}.
              </p>
            </div>
          </div>
        )}
      </Panel>

      {health?.maintenance && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          Maintenance mode is currently active — write requests are rejected with 503 until it is disabled.
        </p>
      )}
    </div>
  );
};

export default DevServiceStatus;