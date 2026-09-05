import React from 'react';
import { Link } from 'react-router-dom';
import { FiXCircle, FiArrowLeft } from 'react-icons/fi';

const PaymentFailed = () => {
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center font-sans p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border-2 border-red-500/20">
            <FiXCircle className="text-red-500 text-5xl" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-white tracking-tight mb-2">Payment Failed</h1>
        <p className="text-zinc-400 text-sm mb-3">
          Your payment could not be processed.
        </p>
        <p className="text-zinc-500 text-xs mb-8">
          Common reasons: insufficient balance, network congestion, or transaction rejected by wallet. Your funds were not deducted.
        </p>

        <div className="space-y-3">
          <Link
            to="/developer/billing"
            className="block w-full py-4 rounded-xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors"
          >
            Try Again
          </Link>
          <Link
            to="/overview"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm"
          >
            <FiArrowLeft size={14} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentFailed;
