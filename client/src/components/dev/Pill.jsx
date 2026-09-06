import React from 'react';

const TONES = {
  blue: 'bg-blue-600/10 text-blue-300 border-blue-800/40',
  emerald: 'bg-emerald-600/10 text-emerald-300 border-emerald-800/40',
  amber: 'bg-amber-600/10 text-amber-300 border-amber-800/40',
  red: 'bg-red-600/10 text-red-300 border-red-800/40',
  violet: 'bg-violet-600/10 text-violet-300 border-violet-800/40',
  sky: 'bg-sky-600/10 text-sky-300 border-sky-800/40',
  zinc: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  green: 'bg-emerald-600/10 text-emerald-300 border-emerald-800/40'
};

/**
 * Pill — small neutral chip for category / region / provider / policy values.
 */
const Pill = ({ children, tone = 'zinc', dot = false, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${TONES[tone] || TONES.zinc} ${className}`}
  >
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />}
    {children}
  </span>
);

export default Pill;
