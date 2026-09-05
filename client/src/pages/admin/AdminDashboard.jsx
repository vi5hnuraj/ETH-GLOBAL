import React from 'react';
import {
  FiUsers, FiGlobe, FiCpu, FiPackage, FiDollarSign, FiAlertTriangle,
  FiActivity, FiServer, FiDatabase, FiRadio, FiClock, FiRefreshCw,
  FiZap, FiShoppingBag, FiCheckCircle, FiXCircle, FiCreditCard
} from 'react-icons/fi';
import StatCard from '../../components/dev/StatCard';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const CHART_TOOLTIP = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 };

const StatusPill = ({ icon, label, value, ok }) => (
  <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
    <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-zinc-100 truncate">{value}</p>
    </div>
    <span className={`ml-auto h-2 w-2 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
  </div>
);

const AdminDashboard = () => {
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: adminApi.dashboard });
  const health = useApi({ fetcher: adminApi.platformHealth });

  if (loading && !data) {
    return (
      <div>
        <Skeleton className="h-8 w-56 rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        <ErrorBanner message={error.message} onRetry={refresh} />
      </div>
    );
  }

  const d = data || {};
  const h = health.data || {};
  const db = h.database || {};
  const api = h.api || {};
  const rpc = h.rpc || {};
  const workers = h.workers || {};

  const cards = [
    { icon: <FiUsers size={18} />, label: 'Total Developers', value: d.totalDevelopers ?? '—', accent: 'text-blue-400' },
    { icon: <FiGlobe size={18} />, label: 'Total Organizations', value: d.totalOrganizations ?? '—', accent: 'text-cyan-400' },
    { icon: <FiCpu size={18} />, label: 'Total AI Agents', value: d.totalAgents ?? '—', accent: 'text-violet-400' },
    { icon: <FiPackage size={18} />, label: 'Published Services', value: d.publishedServices ?? '—', accent: 'text-indigo-400' },
    { icon: <FiDollarSign size={18} />, label: 'Marketplace Revenue', value: d.marketplaceRevenue != null ? `$${Number(d.marketplaceRevenue).toFixed(2)}` : '—', accent: 'text-green-400' },
    { icon: <FiClock size={18} />, label: 'Pending Verifications', value: d.pendingVerifications ?? '—', accent: 'text-amber-400' },
    { icon: <FiXCircle size={18} />, label: 'Failed Payments', value: d.failedPayments ?? '—', accent: 'text-rose-400' },
    { icon: <FiActivity size={18} />, label: 'API Requests Today', value: d.apiRequestsToday?.toLocaleString() ?? '—', accent: 'text-emerald-400' },
    { icon: <FiZap size={18} />, label: 'Monthly Revenue', value: d.monthlyRevenue != null ? `$${Number(d.monthlyRevenue).toFixed(2)}` : '—', accent: 'text-green-400' },
    { icon: <FiShoppingBag size={18} />, label: 'Marketplace Installs', value: d.marketplaceInstalls?.toLocaleString() ?? '—', accent: 'text-purple-400' },
    { icon: <FiCreditCard size={18} />, label: 'Total Transactions', value: d.totalTransactions?.toLocaleString() ?? '—', accent: 'text-cyan-400' },
    { icon: <FiCheckCircle size={18} />, label: 'Successful Payments', value: d.successfulPayments ?? '—', accent: 'text-emerald-400' },
  ];

  const statusPills = [
    { icon: <FiServer size={16} />, label: 'API', value: `${(api?.environment || 'production').toUpperCase()} · v${api?.version || '—'}`, ok: api?.status === 'ok' },
    { icon: <FiClock size={16} />, label: 'Uptime', value: api?.uptimeSeconds != null ? `${Math.floor(api.uptimeSeconds / 3600)}h ${Math.floor((api.uptimeSeconds % 3600) / 60)}m` : '—', ok: true },
    { icon: <FiDatabase size={16} />, label: 'Database', value: db?.status === 'ok' && db?.latencyMs != null ? `${db.latencyMs}ms` : 'Unreachable', ok: db?.status === 'ok' },
    { icon: <FiRadio size={16} />, label: 'Ethereum RPC', value: rpc?.status === 'ok' && rpc?.blockNumber != null ? `Block #${Number(rpc.blockNumber).toLocaleString()} · ${rpc.latencyMs}ms` : 'Unreachable', ok: rpc?.status === 'ok' },
    { icon: <FiActivity size={16} />, label: 'Broadcast Worker', value: workers?.broadcastRecovery?.status === 'running' ? 'Running' : 'Stopped', ok: workers?.broadcastRecovery?.status === 'running' },
    { icon: <FiActivity size={16} />, label: 'Scheduler Worker', value: workers?.scheduledPayment?.status === 'running' ? 'Running' : 'Stopped', ok: workers?.scheduledPayment?.status === 'running' },
  ];

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Platform-wide overview of GlobalPay infrastructure.</p>
        </div>
        <button
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((crd) => <StatCard key={crd.label} {...crd} />)}
      </div>

      <Card title="Platform Health" subtitle="Live system status at request time" className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statusPills.map((p) => <StatusPill key={p.label} {...p} />)}
        </div>
      </Card>

      {/* Recent Activity Feed */}
      <Card title="Recent Activity" subtitle="Latest admin actions across the platform">
        {d.recentActivity && d.recentActivity.length > 0 ? (
          <div className="divide-y divide-zinc-800">
            {d.recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className={`shrink-0 rounded-full p-2 ${
                  item.type === 'danger' ? 'bg-red-950 text-red-400' :
                  item.type === 'warning' ? 'bg-amber-950 text-amber-400' :
                  'bg-blue-950 text-blue-400'
                }`}>
                  {item.type === 'danger' ? <FiXCircle size={14} /> :
                   item.type === 'warning' ? <FiAlertTriangle size={14} /> :
                   <FiCheckCircle size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">{item.action}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {item.admin && <span className="text-zinc-400">{item.admin}</span>}
                    {item.target && <span className="text-zinc-500"> → {item.target}</span>}
                    {item.timestamp && <span className="ml-2">{new Date(item.timestamp).toLocaleString()}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500">
            <FiActivity size={24} className="mx-auto mb-2 text-zinc-700" />
            <p className="text-sm">No recent activity</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminDashboard;
