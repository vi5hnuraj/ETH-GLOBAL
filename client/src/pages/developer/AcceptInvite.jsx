import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiUserPlus, FiCheckCircle, FiXCircle, FiLoader, FiShield, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import developerApi from '../../utils/developerApi';

const AcceptInvite = () => {
  const { orgId, token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | ready | accepted | declined | error
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    setBusy(true);
    try {
      const result = await developerApi.acceptInvitation(orgId, token);
      toast.success(`You joined ${result.name || 'the organization'}!`);
      setStatus('accepted');
      setOrgName(result.name || 'Organization');
    } catch (err) {
      toast.error(err.message || 'Failed to accept invitation');
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await developerApi.declineInvitation(orgId, token);
      toast.success('Invitation declined');
      setStatus('declined');
    } catch (err) {
      toast.error(err.message || 'Failed to decline invitation');
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'accepted') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-700/50 flex items-center justify-center mx-auto">
            <FiCheckCircle size={28} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-serif mb-2">Welcome to {orgName}!</h1>
            <p className="text-sm text-zinc-400">You've been added as a <span className="text-zinc-200 font-medium">{role}</span>.</p>
          </div>
          <button
            onClick={() => navigate('/developer/dashboard')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl flex items-center gap-2 mx-auto text-sm"
          >
            Go to Dashboard <FiArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-zinc-500/20 border border-zinc-700/50 flex items-center justify-center mx-auto">
            <FiXCircle size={28} className="text-zinc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-serif mb-2">Invitation Declined</h1>
            <p className="text-sm text-zinc-400">You've declined the invitation.</p>
          </div>
          <Link
            to="/developer/dashboard"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 rounded-xl text-sm"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-700/50 flex items-center justify-center mx-auto">
            <FiXCircle size={28} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-serif mb-2">Invalid Invitation</h1>
            <p className="text-sm text-zinc-400">This invitation may have expired, been cancelled, or is no longer valid.</p>
          </div>
          <Link
            to="/developer/dashboard"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 rounded-xl text-sm"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Logo / Brand */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-blue-500/20 border border-blue-700/50 flex items-center justify-center mx-auto mb-4">
            <FiUserPlus size={28} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white font-serif mb-1">You're Invited!</h1>
          <p className="text-sm text-zinc-400">You've been invited to join an organization on GlobalPay.</p>
        </div>

        {/* Invitation Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <FiShield size={13} />
              <span>Organization Invitation</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Organization</span>
              <span className="text-sm text-zinc-200 font-medium">{orgName || 'Loading...'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Your Role</span>
              <span className="text-sm text-blue-300 font-medium capitalize">{role || 'Loading...'}</span>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <button
              onClick={handleAccept}
              disabled={busy || status === 'loading'}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              {busy ? <FiLoader size={14} className="animate-spin" /> : <FiCheckCircle size={14} />}
              Accept Invitation
            </button>
            <button
              onClick={handleDecline}
              disabled={busy || status === 'loading'}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-400 font-medium px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              Decline
            </button>
          </div>

          <p className="text-[11px] text-zinc-600 text-center">
            You'll share the organization's agents, API keys, and billing with your team.
          </p>
        </div>

        <p className="text-center text-xs text-zinc-600">
          <Link to="/developer/dashboard" className="hover:text-zinc-400 underline">Go to Dashboard</Link>
        </p>
      </div>
    </div>
  );
};

export default AcceptInvite;
