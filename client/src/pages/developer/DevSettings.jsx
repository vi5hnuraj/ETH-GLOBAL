import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiSave, FiLoader, FiGlobe, FiDollarSign, FiUser, FiMail, FiShield, FiKey, FiAlertTriangle } from 'react-icons/fi';
import developerApi from '../../utils/developerApi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';

const DevSettings = () => {
  const { data: saved, loading, error, refresh } = useApi({ fetcher: developerApi.getSettings });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saved && !form) setForm(saved);
  }, [saved, form]);

  const set = (path, value) => {
    setForm((f) => {
      if (!f) return f;
      const copy = { ...f };
      const parts = path.split('.');
      let cur = copy;
      for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await developerApi.saveSettings(form);
      setForm(updated);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !form) {
    return (
      <div>
        <Skeleton className="h-8 w-40 rounded mb-6" />
        <div className="grid lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure your developer environment.</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !form}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors"
        >
          {saving ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />} Save
        </button>
      </header>

      {/* Two-column grid */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* Environment */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <FiGlobe size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Environment</h3>
              <p className="text-xs text-zinc-500">API endpoints your agents target</p>
            </div>
          </div>
          <div className="flex gap-2">
            {['development', 'production'].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => set('environment', e)}
                className={`flex-1 px-3 py-3 rounded-lg border text-sm font-medium transition-all text-left ${
                  form?.environment === e
                    ? 'bg-emerald-600/15 text-emerald-300 border-emerald-600/30'
                    : 'text-zinc-400 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${e === 'production' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  {e[0].toUpperCase() + e.slice(1)}
                </div>
                <p className="text-[11px] text-zinc-600 mt-1">
                  {e === 'development' ? 'Sandbox wallets' : 'Live wallets'}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Wallet Provider */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <FiDollarSign size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Wallet Provider</h3>
              <p className="text-xs text-zinc-500">Used when creating new agent wallets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => set('walletProvider', 'mpc')}
            className={`w-full px-3 py-3 rounded-lg border text-left transition-all ${
              form?.walletProvider === 'mpc'
                ? 'bg-emerald-600/15 border-emerald-600/30 text-emerald-300'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <div className="font-medium text-sm">Go MPC</div>
            <div className="text-[11px] text-zinc-600 mt-0.5">Multi-Party Computation — no single point of failure</div>
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <FiUser size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Account</h3>
            <p className="text-xs text-zinc-500">Your developer account details</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <FiMail size={14} />, label: 'Email', value: form?.email || 'Not set' },
            { icon: <FiShield size={14} />, label: 'Plan', value: form?.plan ? form.plan[0].toUpperCase() + form.plan.slice(1) : 'Free' },
            { icon: <FiKey size={14} />, label: 'API Keys', value: `${form?.apiKeyCount || 0} active` },
            { icon: <FiGlobe size={14} />, label: 'Wallets', value: `${form?.walletCount || 0} created` },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-3 py-2.5">
              <span className="text-zinc-500">{item.icon}</span>
              <div>
                <p className="text-[11px] text-zinc-500">{item.label}</p>
                <p className="text-sm font-medium text-zinc-200">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-zinc-900/40 border border-red-900/30 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
            <FiAlertTriangle size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Danger Zone</h3>
            <p className="text-xs text-zinc-500">Irreversible actions</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-red-950/20 border border-red-900/30 rounded-lg px-4 py-3">
          <div>
            <p className="text-sm text-zinc-300">Reset all settings</p>
            <p className="text-xs text-zinc-500">Restore defaults for environment and wallet provider</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setForm((f) => ({ ...f, environment: 'development', walletProvider: 'mpc' }));
              toast.success('Settings reset to defaults');
            }}
            className="text-sm text-red-400 hover:text-red-300 border border-red-800 hover:border-red-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevSettings;
