import React from 'react';
import {
  FiDollarSign, FiTrendingUp, FiUsers, FiPercent, FiCpu, FiGrid, FiRefreshCw
} from 'react-icons/fi';
import StatCard from '../../components/dev/StatCard';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const fmtUsd = (n) => `$${Number(n || 0).toFixed(2)}`;

const DevRevenue = () => {
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: developerApi.revenue });

  if (loading && !data) {
    return (
      <div>
        <Skeleton className="h-8 w-56 rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Revenue</h1>
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      </div>
    );
  }

  const r = data || {};
  const cards = [
    { icon: <FiDollarSign size={18} />, label: 'Monthly Revenue', value: fmtUsd(r.monthlyRevenue), accent: 'text-green-400' },
    { icon: <FiTrendingUp size={18} />, label: 'MRR', value: fmtUsd(r.mrr), accent: 'text-blue-400' },
    { icon: <FiTrendingUp size={18} />, label: 'ARR', value: fmtUsd(r.arr), accent: 'text-violet-400' },
    { icon: <FiUsers size={18} />, label: 'Active Subscribers', value: r.activeSubscribers ?? 0, accent: 'text-cyan-400', sub: `${r.payingSubscribers ?? 0} paying` },
    { icon: <FiPercent size={18} />, label: 'Conversion Rate', value: `${r.conversionRate ?? 0}%`, accent: 'text-amber-400' },
    { icon: <FiCpu size={18} />, label: 'API Usage Revenue', value: fmtUsd(r.apiUsageRevenue), accent: 'text-blue-400' },
    { icon: <FiCpu size={18} />, label: 'Agent Revenue', value: fmtUsd(r.agentRevenue), accent: 'text-purple-400' },
    { icon: <FiGrid size={18} />, label: 'Wallet Creation Revenue', value: fmtUsd(r.walletCreationRevenue), accent: 'text-cyan-400' },
  ];

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Revenue</h1>
          <p className="text-sm text-zinc-500 mt-1">Platform business metrics across all developers.</p>
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
        {cards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Top Plans" subtitle="Revenue by plan">
          {(r.topPlans || []).length === 0 ? (
            <EmptyState title="No subscriptions yet" description="Plan revenue appears once developers subscribe." />
          ) : (
            <div className="space-y-2">
              {(r.topPlans || []).map((p) => (
                <div key={p.plan} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold capitalize">{p.plan}</span>
                    <span className="text-xs text-zinc-600">{p.count} active</span>
                  </div>
                  <span className="font-semibold text-emerald-400">{fmtUsd(p.revenue)}/mo</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Top Customers" subtitle="Agents by USDC transaction volume">
          {(r.topCustomers || []).length === 0 ? (
            <EmptyState title="No volume yet" description="Your most active agents appear here." />
          ) : (
            <div className="space-y-2">
              {(r.topCustomers || []).map((c) => (
                <div key={c.agentId} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <code className="font-mono text-xs text-zinc-600">{c.agentId}</code>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-semibold text-violet-400">{Number(c.volumeBOT).toFixed(4)} USDC</p>
                    <p className="text-[10px] uppercase text-zinc-600">volume</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DevRevenue;
