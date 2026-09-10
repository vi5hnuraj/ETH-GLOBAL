import React from 'react';

const StatCard = ({ icon, label, value, sub, accent = 'text-blue-400', compact = false }) => (
  <div className={`bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col ${compact ? 'gap-0.5 p-3.5' : 'gap-1 p-5'}`}>
    <div className={`${accent} ${compact ? 'mb-1' : 'mb-2'}`}>{icon}</div>
    <p className={`${compact ? 'text-xl' : 'text-2xl'} font-black text-white leading-tight`}>{value}</p>
    <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{label}</p>
    {sub && <p className={`${compact ? 'mt-0.5' : 'mt-1'} text-[11px] text-zinc-400`}>{sub}</p>}
  </div>
);

export default StatCard;
