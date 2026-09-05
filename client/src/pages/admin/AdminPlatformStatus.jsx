import React, { useState } from 'react';
import {
  FiServer, FiDatabase, FiRadio, FiActivity, FiRefreshCw, FiZap,
  FiAlertTriangle, FiCheckCircle, FiClock, FiSettings, FiPower,
  FiToggleLeft, FiToggleRight, FiShield
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ConfirmModal from '../../components/dev/ConfirmModal';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const StatusPill = ({ icon, label, value, ok, sub }) => (
  <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
    <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-zinc-100 truncate">{value}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
    <span className={`h-2 w-2 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
  </div>
);

const AdminPlatformStatus = () => {
  const [confirmMaintenance, setConfirmMaintenance] = useState(null);
  const [busy, setBusy] = useState(false);

  const health = useApi({ fetcher: adminApi.platformHealth });
  const workers = useApi({ fetcher: adminApi.systemWorkers });
  const flags = useApi({ fetcher: adminApi.featureFlags });
  const maintenance = useApi({ fetcher: adminApi.maintenanceMode });

  const h = health.data || {};
  const w = workers.data || {};
  const f = flags.data || [];
  const m = maintenance.data || {};
  const db = h.database || {};
  const api = h.api || {};
  const rpc = h.rpc || {};

  const handleToggleMaintenance = async () => {
    setBusy(true);
    try {
      const newState = !m.enabled;
      await adminApi.setMaintenance(newState);
      toast.success(newState ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
      setConfirmMaintenance(null);
      maintenance.refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to toggle maintenance mode');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleFlag = async (flag) => {
    try {
      await adminApi.updateFeatureFlag(flag.id || flag.key, !flag.enabled);
      toast.success(`Flag "${flag.name || flag.key}" ${flag.enabled ? 'disabled' : 'enabled'}`);
      flags.refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to toggle flag');
    }
  };

  return (
    <div>
      <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform Status</h1>
          <p className="text-sm text-zinc-400 mt-1">System health, workers, feature flags, and maintenance controls.</p>
        </div>
        <button
          onClick={() => {
            health.refresh({ background: true });
            workers.refresh({ background: true });
            flags.refresh({ background: true });
            maintenance.refresh({ background: true });
          }}
          disabled={health.refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={health.refreshing ? 'animate-spin' : ''} /> Refresh All
        </button>
      </header>

      {/* System Health */}
      <Card title="System Health" subtitle="Live status of core infrastructure" className="mb-6">
        {health.loading && !h.api ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatusPill icon={<FiServer size={16} />} label="API Server" value={`${(api?.environment || 'production').toUpperCase()} · v${api?.version || '—'}`} ok={api?.status === 'ok'} sub={api?.uptimeSeconds != null ? `${Math.floor(api.uptimeSeconds / 3600)}h uptime` : undefined} />
            <StatusPill icon={<FiDatabase size={16} />} label="Database" value={db?.status === 'ok' && db?.latencyMs != null ? `${db.latencyMs}ms latency` : 'Unreachable'} ok={db?.status === 'ok'} sub={db?.connectionCount != null ? `${db.connectionCount} connections` : undefined} />
            <StatusPill icon={<FiRadio size={16} />} label="Blockchain RPC" value={rpc?.status === 'ok' && rpc?.blockNumber != null ? `Block #${Number(rpc.blockNumber).toLocaleString()} · ${rpc.latencyMs}ms` : 'Unreachable'} ok={rpc?.status === 'ok'} />
            <StatusPill icon={<FiZap size={16} />} label="p95 Latency" value={h.usage?.percentileLatencyMs?.['95'] != null ? `${h.usage.percentileLatencyMs['95']}ms` : '—'} ok={true} />
            <StatusPill icon={<FiAlertTriangle size={16} />} label="Error Rate" value={h.usage?.errorRate != null ? `${h.usage.errorRate}%` : '—'} ok={(h.usage?.errorRate ?? 0) < 5} />
            <StatusPill icon={<FiClock size={16} />} label="Uptime" value={api?.uptimeSeconds != null ? `${Math.floor(api.uptimeSeconds / 3600)}h ${Math.floor((api.uptimeSeconds % 3600) / 60)}m` : '—'} ok={true} />
          </div>
        )}
      </Card>

      {/* Workers */}
      <Card title="Workers" subtitle="Background job processors" className="mb-6">
        {workers.loading && !w.broadcastRecovery ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatusPill
              icon={<FiActivity size={16} />}
              label="Broadcast Recovery"
              value={w.broadcastRecovery?.status === 'running' ? 'Running' : 'Stopped'}
              ok={w.broadcastRecovery?.status === 'running'}
              sub={w.broadcastRecovery?.lastRun ? `Last run: ${new Date(w.broadcastRecovery.lastRun).toLocaleTimeString()}` : undefined}
            />
            <StatusPill
              icon={<FiActivity size={16} />}
              label="Scheduled Payments"
              value={w.scheduledPayment?.status === 'running' ? 'Running' : 'Stopped'}
              ok={w.scheduledPayment?.status === 'running'}
              sub={w.scheduledPayment?.lastRun ? `Last run: ${new Date(w.scheduledPayment.lastRun).toLocaleTimeString()}` : undefined}
            />
            <StatusPill
              icon={<FiActivity size={16} />}
              label="Queue Processor"
              value={w.queueProcessor?.status === 'running' ? 'Running' : 'Stopped'}
              ok={w.queueProcessor?.status === 'running'}
              sub={w.queueProcessor?.pendingJobs != null ? `${w.queueProcessor.pendingJobs} pending` : undefined}
            />
          </div>
        )}
      </Card>

      {/* Feature Flags */}
      <Card title="Feature Flags" subtitle="Toggle platform features" className="mb-6">
        {flags.loading && !f.length ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : f.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">No feature flags configured.</p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {f.map((flag) => (
              <div key={flag.id || flag.key} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{flag.name || flag.key}</p>
                  {flag.description && <p className="text-xs text-zinc-500 mt-0.5">{flag.description}</p>}
                </div>
                <button
                  onClick={() => handleToggleFlag(flag)}
                  className={`shrink-0 p-1 rounded-lg transition-colors ${flag.enabled ? 'text-emerald-400 hover:bg-emerald-950' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  {flag.enabled ? <FiToggleRight size={24} /> : <FiToggleLeft size={24} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Maintenance Mode */}
      <Card title="Maintenance Mode" subtitle="Put the platform into read-only mode">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-200">
              {m.enabled ? 'Maintenance mode is currently enabled.' : 'Maintenance mode is disabled.'}
            </p>
            {m.enabled && m.enabledAt && (
              <p className="text-xs text-zinc-500 mt-1">Enabled since {new Date(m.enabledAt).toLocaleString()}</p>
            )}
          </div>
          <button
            onClick={() => setConfirmMaintenance(true)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              m.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            <FiPower size={14} />
            {m.enabled ? 'Disable Maintenance' : 'Enable Maintenance'}
          </button>
        </div>
      </Card>

      {confirmMaintenance && (
        <ConfirmModal
          open
          onClose={() => setConfirmMaintenance(null)}
          onConfirm={handleToggleMaintenance}
          title={m.enabled ? 'Disable Maintenance Mode?' : 'Enable Maintenance Mode?'}
          description={
            m.enabled
              ? 'This will restore normal platform operations. All developer access will be restored.'
              : 'This will put the platform into read-only mode. Developers will not be able to make changes, create payments, or modify settings.'
          }
          confirmLabel={m.enabled ? 'Disable Maintenance' : 'Enable Maintenance'}
          confirmClassName={m.enabled ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}
          danger={!m.enabled}
          busy={busy}
        />
      )}
    </div>
  );
};

export default AdminPlatformStatus;
