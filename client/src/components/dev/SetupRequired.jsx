import React, { useState } from 'react';
import { FiDatabase, FiBookOpen, FiRefreshCw, FiCheckCircle } from 'react-icons/fi';
import Modal from './Modal';
import CopyButton from './CopyButton';
import Skeleton from './Skeleton';

/**
 * SetupRequired — Phase 1: graceful detection of missing Supabase tables.
 * Shown by the DevPlatform shell until /api/developers/status reports ready.
 */
const SetupRequired = ({ status, loading, error, onRefresh }) => {
  const [guideOpen, setGuideOpen] = useState(false);

  if (loading && !status) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto mt-16">
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-4 w-full rounded" lines={3} />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <h1 className="text-xl font-bold">Cannot reach the platform API</h1>
        <p className="text-sm text-zinc-500 mt-2">{error}</p>
        <p className="text-sm text-zinc-600 mt-1">
          Confirm the backend is running (default <code className="text-blue-400">http://localhost:5550</code>) and that CORS allows your origin.
        </p>
        <button
          onClick={onRefresh}
          className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const missing = status?.missing || [];
  const sql = status?.migrationSql || '';

  return (
    <div className="max-w-3xl mx-auto mt-12">
      <div className="bg-zinc-900/70 border border-amber-800/60 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-amber-900/30 border border-amber-800/60 grid place-items-center text-amber-400">
            <FiDatabase size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Setup Required</h1>
            <p className="text-sm text-zinc-500">Your database is not provisioned yet.</p>
          </div>
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed">
          The GlobalPay developer platform stores agents, usage, webhooks and billing in Supabase.
          The following tables could not be detected:
        </p>

        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {missing.map((t) => (
            <div key={t} className="flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <code className="font-mono text-xs text-zinc-400">{t}</code>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-lg"
          >
            <FiBookOpen size={15} /> Run Setup Guide
          </button>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-medium px-4 py-2.5 rounded-lg"
          >
            <FiRefreshCw size={15} /> I ran it — Refresh
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-6">
          One idempotent SQL migration provisions everything. No other configuration is required.
        </p>
      </div>

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="Setup Guide" subtitle="Run this once in the Supabase SQL Editor" maxWidth="max-w-3xl">
        <div className="space-y-5">
          {status?.steps?.map((s, i) => (
            <div key={s.title} className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-600/20 border border-blue-800/60 text-blue-400 grid place-items-center text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div>
                <p className="font-medium text-sm text-white">{s.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-zinc-400 font-medium">
                {status?.migrationFile || 'agents_migration.sql'}
              </p>
              <CopyButton text={sql} label="Copy SQL" />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950">
              <pre className="p-4 text-[12px] leading-relaxed font-mono text-zinc-400 whitespace-pre-wrap">{sql}</pre>
            </div>
          </div>

          <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-900/20 border border-emerald-800/50 rounded-lg px-3 py-2.5">
            <FiCheckCircle size={14} /> Idempotent — safe to run more than once. Creates all 9 tables plus indexes.
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SetupRequired;
