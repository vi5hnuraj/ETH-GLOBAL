import React from 'react';
import { FiActivity, FiDollarSign, FiTrendingUp, FiTrendingDown, FiKey, FiPackage, FiUsers } from 'react-icons/fi';

const STAT_cards = [
  { label: 'Active API Keys', value: '12', icon: FiKey, change: '+2' },
  { label: 'Services Published', value: '5', icon: FiPackage, change: '+1' },
  { label: 'Team Members', value: '8', icon: FiUsers, change: '+3' },
  { label: 'API Calls (24h)', value: '45.2K', icon: FiActivity, change: '+12%' },
];

const DevDashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Developer Dashboard</h1>
        <p className="text-zinc-400 mt-1">Manage your APIs, services, and team</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_cards.map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <stat.icon size={20} className="text-blue-400" />
              <span className="text-xs font-medium text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full">
                {stat.change}
              </span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-zinc-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {[
              { action: 'API Key created', detail: 'sk_dev_7f3a...', time: '2 min ago' },
              { action: 'Service published', detail: 'Payment Processor v1.2', time: '1 hour ago' },
              { action: 'Webhook configured', detail: 'payment.completed', time: '3 hours ago' },
              { action: 'Team member added', detail: 'raj@globalpay.dev', time: '5 hours ago' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{item.action}</p>
                  <p className="text-xs text-zinc-500 truncate">{item.detail}</p>
                </div>
                <span className="text-xs text-zinc-600 shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Create API Key', to: '/developer/api/new', icon: FiKey },
              { label: 'Publish Service', to: '/developer/marketplace/services/publish', icon: FiPackage },
              { label: 'Invite Member', to: '/developer/organizations/members/invite', icon: FiUsers },
              { label: 'View Analytics', to: '/developer/analytics', icon: FiTrendingUp },
            ].map((action) => (
              <a
                key={action.label}
                href={action.to}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-blue-800/50 transition-colors group"
              >
                <action.icon size={24} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
                <span className="text-sm text-zinc-300">{action.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevDashboard;
