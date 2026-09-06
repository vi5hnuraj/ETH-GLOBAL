import React from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

const ErrorBanner = ({ message, onRetry, setupRequired = false }) => (
  <div role="alert" className="mb-6 text-sm bg-red-950/30 border border-red-800/60 rounded-xl p-4 flex items-start justify-between gap-4">
    <div className="flex items-start gap-2 text-red-300">
      <FiAlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">{setupRequired ? 'Setup required' : 'Something went wrong'}</p>
        <p className="text-red-400/80 text-xs mt-0.5">{message}</p>
      </div>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 inline-flex items-center gap-1.5 text-xs text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800"
      >
        <FiRefreshCw size={12} /> Retry
      </button>
    )}
  </div>
);

export default ErrorBanner;
