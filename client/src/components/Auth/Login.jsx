import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { invalidateUserCache } from '../../utils/api';
import toast, { Toaster } from 'react-hot-toast';
import Cookies from "js-cookie"

const notify = () => toast('Login Successfully');

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      
      // Derive and store session key client-side for non-custodial wallet decryption
      const { deriveSessionKey } = await import('../../utils/cryptoHelper');
      const sessionKey = await deriveSessionKey(email, password);
      sessionStorage.setItem('wallet_session_key', sessionKey);

      invalidateUserCache();
      // Clear stale org ID from previous user — each login starts fresh
      localStorage.removeItem('gpay_org_id');
      Cookies.set('token', response.data.token, { expires: 1 });
      Cookies.set('refreshToken', response.data.refreshToken, { expires: 30 });
      Cookies.set('userEmail', email, { expires: 1 });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      if (response.data.platformRole) {
        localStorage.setItem('userRole', response.data.platformRole);
      } else {
        localStorage.removeItem('userRole');
      }
      // Admin users go to admin console, everyone else to home
      const isAdmin = response.data.platformRole === 'super_admin';
      window.location.href = isAdmin ? '/admin' : '/'
      notify();
    } catch (error) {
      if (error.response?.status === 429) {
        setError('Too many login attempts. Please wait a moment and try again.');
      } else {
        setError('Invalid email or password. Please try again.');
      }
      console.error('Login error:', error);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-[700px] space-y-8 bg-zinc-900 p-5 sm:p-8 rounded-lg shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">Sign in to your account</h2>
        </div>
        <form className="mt-8 space-y-6 " onSubmit={handleSubmit}>
          <input type="hidden" name="remember" defaultValue="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 bg-zinc-700 border border-zinc-600 placeholder-gray-400 text-white focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 bg-zinc-700 border border-zinc-600 placeholder-gray-400 text-white focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-zinc rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-white">Remember me</label>
            </div>

            <div className="text-sm">
              <Link to="/forgot-password" className="font-medium text-green-400 hover:text-green-500">Forgot your password?</Link>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 text-sm rounded-md p-3 text-center">
              {error}
            </div>
          )}
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-gray-400">or</p>
        </form>

        <div className="flex flex-col gap-1">
          <button
            onClick={() => toast.error("Google login is currently disabled.")}
            className="group relative flex items-center justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-300 ease-in-out"
          >
            <span className="mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M19 10c0-1.55-.41-2.99-1.12-4.23H10v8.05h5.53c-.23 1.2-.86 2.26-1.78 3.09v2.55h2.88c1.68-1.55 2.64-3.82 2.64-6.46z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M10 20c2.4 0 4.37-.82 5.86-2.22l-2.88-2.55c-.8.53-1.81.84-2.98.84-2.28 0-4.21-1.54-4.88-3.63H1V15c1.68 3.32 5.38 5.74 9 5.74z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M5.12 12c-.11-.54-.17-1.11-.17-1.69s.06-1.15.17-1.69V7.39H1c-.57 1.05-.88 2.25-.88 3.61s.31 2.56.88 3.61l4.12-3.62z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M10 3.13c1.25 0 2.37.42 3.26 1.25l2.33-2.33C14.37.53 12.4 0 10 0 5.38 0 1.68 2.42 0 5.74l2.88 2.55C5.79 4.67 7.72 3.13 10 3.13z" clipRule="evenodd" />
              </svg>
            </span>
            Sign in with Google
          </button>

          <button
            onClick={() => toast.error("GitHub login is currently disabled.")}
            className="group relative flex items-center justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-700 transition duration-300 ease-in-out"
          >
            <span className="mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </span>
            Sign in with GitHub
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-400">
          Don't have an account yet?
          <Link to="/register" className="ml-1 font-medium text-green-400 hover:text-green-500">Register here</Link>
        </div>
      </div>
      <Toaster />
    </div>
  );
};

export default Login;
