import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiClock, FiArrowLeft } from 'react-icons/fi';

const SessionExpired = () => {
  useEffect(() => {
    // Clear auth tokens on session expiry
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center font-sans p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center border-2 border-amber-500/20">
            <FiClock className="text-amber-500 text-5xl" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Session Expired</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Your session has expired for security reasons. Please log in again to continue.
        </p>

        <div className="space-y-3">
          <Link
            to="/login"
            className="block w-full py-4 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors"
          >
            Log In Again
          </Link>
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm"
          >
            <FiArrowLeft size={14} />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SessionExpired;
