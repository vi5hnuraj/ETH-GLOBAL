import React from 'react';

const StatCard = ({ icon, label, value, sub, accent = 'text-blue-400' }) => (
  <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-1">
    <div className={`${accent} mb-2`}>{icon}</div>
    <p className="text-2xl font-black text-white leading-tight">{value}</p>
    <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{label}</p>
    {sub && <p className="text-[11px] text-zinc-400 mt-1">{sub}</p>}
  </div>
);

export default StatCard;