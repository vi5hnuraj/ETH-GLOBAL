import React from 'react';

const STATUS_STYLES = {
  active: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  inactive: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  suspended: 'bg-amber-900/40 text-amber-400 border-amber-800',
  confirmed: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  pending: 'bg-amber-900/40 text-amber-400 border-amber-800',
  failed: 'bg-red-900/40 text-red-400 border-red-800',
  revoked: 'bg-red-900/40 text-red-400 border-red-800',
  paid: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  free: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  pro: 'bg-blue-900/40 text-blue-400 border-blue-800',
  enterprise: 'bg-purple-900/40 text-purple-400 border-purple-800',
  trialing: 'bg-sky-900/40 text-sky-400 border-sky-800',
  canceled: 'bg-red-900/40 text-red-400 border-red-800',
  past_due: 'bg-orange-900/40 text-orange-400 border-orange-800',
  requested: 'bg-amber-900/40 text-amber-400 border-amber-800',
  reserved: 'bg-blue-900/40 text-blue-400 border-blue-800',
  running: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  completed: 'bg-sky-900/40 text-sky-400 border-sky-800',
  closed: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  expired: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

const StatusBadge = ({ status, children }) => {
  const key = String(status || '').toLowerCase();
  const cls = STATUS_STYLES[key] || 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border capitalize ${cls}`}>
      {children || status}
    </span>
  );
};

export default StatusBadge;