import React from 'react';
import { FiRefreshCw } from 'react-icons/fi';

const RefreshButton = ({ onClick, refreshing, label = 'Refresh', className = '', disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || refreshing}
    className={`inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
  >
    <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
    {label}
  </button>
);

export default RefreshButton;
