import React from 'react';
import { Link } from 'react-router-dom';
import { FiLock, FiArrowLeft } from 'react-icons/fi';

const Forbidden = () => {
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center font-sans p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center border-2 border-amber-500/20">
            <FiLock className="text-amber-500 text-5xl" />
          </div>
        </div>

        <p className="text-emerald-400 text-6xl font-black mb-4">403</p>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Access Denied</h1>
        <p className="text-zinc-400 text-sm mb-8">
          You don't have permission to access this page. Contact your organization admin to request access.
        </p>

        <Link
          to="/overview"
          className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors"
        >
          <FiArrowLeft size={14} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default Forbidden;
