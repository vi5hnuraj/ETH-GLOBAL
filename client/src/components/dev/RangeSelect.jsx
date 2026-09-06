import React from 'react';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' }
];

/**
 * RangeSelect — segmented time-range selector for metric panels.
 */
const RangeSelect = ({ value = '30d', onChange, ranges = RANGES, className = '' }) => (
  <div className={`inline-flex items-center gap-0.5 border border-zinc-700 rounded-lg p-0.5 bg-zinc-900/60 ${className}`} role="group" aria-label="Time range">
    {ranges.map((r) => {
      const id = typeof r === 'string' ? r : r.id;
      const label = typeof r === 'string' ? r : r.label;
      const active = value === id;
      return (
        <button
          type="button"
          key={id}
          onClick={() => onChange(id)}
          aria-pressed={active}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            active ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export default RangeSelect;
