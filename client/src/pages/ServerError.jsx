import React from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

const ServerError = () => {
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center font-sans p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border-2 border-red-500/20">
            <FiAlertTriangle className="text-red-500 text-5xl" />
          </div>
        </div>

        <p className="text-emerald-400 text-6xl font-black mb-4">500</p>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Server Error</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Something went wrong on our end. Our team has been notified and is working on a fix.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors"
          >
            <FiRefreshCw size={14} />
            Try Again
          </button>
          <Link
            to="/"
            className="block w-full py-4 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ServerError;
