import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiXCircle, FiCheckCircle } from 'react-icons/fi';

const CancelSubscription = () => {
  const [status, setStatus] = useState('confirming'); // confirming | processing | cancelled
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setStatus('cancelled');
      setLoading(false);
    }, 2000);
  };

  if (status === 'cancelled') {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiCheckCircle className="text-emerald-500 text-3xl" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Subscription Cancelled</h1>
          <p className="text-zinc-400 text-sm mb-6">
            Your Pro subscription has been cancelled. Your access will continue until the end of the current billing period.
          </p>
          <div className="space-y-3">
            <Link to="/developer/billing" className="block w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors">
              View Billing
            </Link>
            <Link to="/overview" className="block w-full py-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/developer/billing" className="inline-flex items-center gap-2 text-zinc-500 hover:text-emerald-400 transition-colors mb-8 text-sm">
          <FiArrowLeft size={14} />
          Back to Billing
        </Link>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
              <FiXCircle className="text-red-500 text-3xl" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2 text-center">Cancel Pro Subscription?</h1>
          <p className="text-zinc-400 text-sm mb-6 text-center">
            You'll lose access to Pro features after the current billing period ends.
          </p>

          <div className="bg-zinc-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-zinc-300 font-medium mb-2">You will lose:</p>
            <ul className="space-y-1 text-sm text-zinc-400">
              <li>• Priority support</li>
              <li>• Advanced analytics</li>
              <li>• Reduced marketplace fees</li>
              <li>• Unlimited agent creation</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-bold transition-colors disabled:opacity-50"
            >
              {loading ? 'Cancelling...' : 'Yes, Cancel Subscription'}
            </button>
            <Link to="/developer/billing" className="block w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors text-center">
              Keep Pro Subscription
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancelSubscription;
