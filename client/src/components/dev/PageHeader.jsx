import React from 'react';

const PageHeader = ({ title, subtitle, actions, lastUpdated }) => (
  <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-sm text-zinc-400 mt-1 max-w-2xl">{subtitle}</p>}
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
