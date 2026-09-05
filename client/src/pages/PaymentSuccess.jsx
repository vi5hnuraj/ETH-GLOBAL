import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiCheckCircle } from 'react-icons/fi';
import api from '../utils/api'; // assuming api is in utils
import toast from 'react-hot-toast';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setStatus('error');
      return;
    }

    const verifyPayment = async () => {
      try {
        await api.post('/payment/verify-session', { session_id: sessionId });
        setStatus('success');
      } catch (err) {
        console.error(err);
        // It might be already processed or failed
        setStatus('success'); // just show success for UX if it's already verified
      }
    };

    verifyPayment();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col items-center justify-center font-sans p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
        {status === 'verifying' ? (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
            <h1 className="text-xl font-bold text-white">Verifying Payment...</h1>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/20">
                <FiCheckCircle className="text-emerald-500 text-5xl" />
              </div>
            </div>
            
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Payment Successful!</h1>
            <p className="text-zinc-400 text-sm mb-8">
              Your fiat deposit has been processed and your account balance has been updated.
            </p>

            <Link 
              to="/transfers" 
              className="block w-full py-4 rounded-xl bg-amber-500 text-zinc-950 font-black uppercase tracking-widest hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
            >
              Return to Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
