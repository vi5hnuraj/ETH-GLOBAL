import React from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiSearch } from 'react-icons/fi';

const NotFound = () => {
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center font-sans p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center border-2 border-zinc-700">
            <FiSearch className="text-zinc-500 text-5xl" />
          </div>
        </div>

        <p className="text-emerald-400 text-6xl font-black mb-4">404</p>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Page Not Found</h1>
        <p className="text-zinc-400 text-sm mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="space-y-3">
          <Link
            to="/"
            className="block w-full py-4 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors"
          >
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm"
          >
            <FiArrowLeft size={14} />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
