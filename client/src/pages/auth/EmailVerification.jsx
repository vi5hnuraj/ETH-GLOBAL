import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiMail, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import api from '../../utils/api';

const EmailVerification = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    const verify = async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setStatus('success');
      } catch (err) {
        setStatus('error');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          {status === 'verifying' && (
            <>
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiMail className="text-emerald-500 text-3xl animate-pulse" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Verifying Email...</h1>
              <p className="text-zinc-400 text-sm">Please wait while we verify your email address.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiCheckCircle className="text-emerald-500 text-3xl" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Email Verified!</h1>
              <p className="text-zinc-400 text-sm mb-6">Your email has been successfully verified. You can now access all features.</p>
              <Link to="/login" className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-6 rounded-lg transition-colors">
                Go to Login
              </Link>
            </>
          )}

          {(status === 'error' || status === 'no-token') && (
            <>
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiXCircle className="text-red-500 text-3xl" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Verification Failed</h1>
              <p className="text-zinc-400 text-sm mb-6">
                {status === 'no-token' 
                  ? 'No verification token provided.' 
                  : 'This verification link is invalid or has expired.'}
              </p>
              <Link to="/login" className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-6 rounded-lg transition-colors">
                Go to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
