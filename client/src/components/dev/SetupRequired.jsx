import React from 'react';
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi';

const SetupRequired = ({ status, loading, error, onRefresh }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
      <FiAlertCircle size={32} className="text-amber-500 mb-4" />
      <p className="text-lg font-semibold text-zinc-200">Setup Required</p>
      <p className="text-sm text-zinc-500 mt-1 max-w-md">
        {loading ? 'Checking platform setup...' : error ? error.message || 'Configuration check failed.' : 'Complete the platform setup to access the developer console.'}
      </p>
      {!loading && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-lg"
        >
          <FiRefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
};

export default SetupRequired;
