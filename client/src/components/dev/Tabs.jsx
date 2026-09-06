import React from 'react';

const Tabs = ({ tabs = [], active, onChange, size = 'md', className = '' }) => (
  <div className={`flex flex-wrap gap-2 ${className}`} role="tablist" aria-label="Tabs">
    {tabs.map((tab) => {
      const id = typeof tab === 'string' ? tab : tab.id;
      const label = typeof tab === 'string' ? tab : tab.label;
      const icon = typeof tab === 'string' ? null : tab.icon;
      const activeId = active === id;
      return (
        <button
          key={id}
          role="tab"
          aria-selected={activeId}
          onClick={() => onChange(id)}
          className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors ${
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
          } ${
            activeId
              ? 'bg-blue-600/20 text-blue-300 border border-blue-800/60'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800 border border-transparent'
          }`}
        >
          {icon}
          {label}
        </button>
      );
    })}
  </div>
);

export default Tabs;
