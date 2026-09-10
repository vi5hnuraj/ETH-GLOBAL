import React from 'react';

const PageHeader = ({ title, subtitle, actions, lastUpdated, compact = false }) => (
  <header className={`flex flex-col md:flex-row md:items-center md:justify-between ${compact ? 'gap-2 mb-4' : 'gap-3 mb-6'}`}>
    <div className="min-w-0">
      <h1 className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-white`}>{title}</h1>
      {subtitle && <p className={`${compact ? 'text-xs' : 'text-sm'} text-zinc-400 mt-1 max-w-2xl`}>{subtitle}</p>}
      {lastUpdated && (
        <p className="text-[11px] text-zinc-500 mt-1.5">
          Last updated {lastUpdated instanceof Date ? lastUpdated.toLocaleString() : lastUpdated}
        </p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>}
  </header>
);

export default PageHeader;
