import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiRefreshCw, FiSend, FiCpu, FiActivity, FiDownload, FiRefreshCcw
} from 'react-icons/fi';
import { saveAs } from 'file-saver';
import developerApi from '../../utils/developerApi';
import CopyButton from '../../components/dev/CopyButton';
import StatusBadge from '../../components/dev/StatusBadge';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import ApiKeyField from '../../components/dev/ApiKeyField';
import useApi from '../../hooks/useApi';

const DevAgentDetail = () => {
  const { agentId } = useParams();

  const detail = useApi({ fetcher: () => developerApi.agentDetail(agentId), deps: [agentId] });
  const history = useApi({ fetcher: () => developerApi.agentHistory(agentId), deps: [agentId] });
  const balance = useApi({ fetcher: () => developerApi.agentBalance(agentId), deps: [agentId] });

  const agent = detail.data;
  const [payTo, setPayTo] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const refreshAll = async () => {
    await Promise.all([detail.refresh({ background: true }), history.refresh({ background: true }), balance.refresh({ background: true })]);
  };

  const rotate = async () => {
    setRotating(true);
    try {
      const res = await developerApi.agentRotateKey(agentId);
      setNewKey(res.apiKey);
      toast.success('API key rotated — previous key is now invalid');
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Failed to rotate key');
    } finally {
      setRotating(false);
    }
  };

  const pay = async () => {
    if (!payTo || !payAmount) return toast.error('Enter destination and amount');
    setPaying(true);
    try {
      const res = await developerApi.agentPay(agentId, { to: payTo.trim(), amount: Number(payAmount) });
      toast.success(`Sent ${res.amount} BOT`);
      setPayTo(''); setPayAmount('');
      await refreshAll();
    } catch (err) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setPaying(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(history.data || [], null, 2)], { type: 'application/json' });
    saveAs(blob, `${agentId}-history.json`);
  };

  if (detail.loading && !detail.data) {
    return (
      <div>
        <Skeleton className="h-8 w-48 rounded mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (detail.error && !detail.data) {
    return (
      <div>
        <Link to="/developer/agents" className="text-sm text-zinc-500 hover:text-white inline-flex items-center gap-1 mb-4">
          <FiArrowLeft size={14} /> Back to agents
        </Link>
        <ErrorBanner message={detail.error.message} onRetry={detail.refresh} setupRequired={detail.error.setupRequired} />
      </div>
    );
  }

  if (!agent) return null;
  const txHistory = history.data || [];

  return (
    <div className="pb-12">
      <Link to="/developer/agents" className="text-sm text-zinc-500 hover:text-white inline-flex items-center gap-1 mb-4">
        <FiArrowLeft size={14} /> Back to agents
      </Link>

      {/* Header with agent info */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-zinc-700/30 flex items-center justify-center text-white text-2xl font-bold shrink-0">
          {(agent.name || 'A')[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-sm text-zinc-500">{agent.description || 'No description'}</p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> BOT Chain · {agent.chainId || 677}
            </span>
            <span className="text-[11px] text-zinc-500">Created {new Date(agent.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className="border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1.5 text-sm"
          >
            <FiRefreshCcw size={13} /> Refresh
          </button>
          <button type="button" onClick={rotate} disabled={rotating} className="bg-amber-600/10 border border-amber-700/30 text-amber-400 hover:bg-amber-600/20 font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
            <FiRefreshCw size={13} className={rotating ? 'animate-spin' : ''} /> Rotate Key
          </button>
        </div>
      </div>

      {newKey && (
        <div className="mb-6 bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4">
          <p className="text-sm text-emerald-400 font-medium mb-2">🔑 New API key issued — save it now. Shown only once.</p>
          <div className="flex items-center gap-2">
            <code className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm flex-1 truncate">{newKey}</code>
            <CopyButton text={newKey} label="Copy" />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: Credentials + Send Payment */}
        <div className="space-y-4">
          {/* Credentials */}
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Credentials</h3>
            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Wallet Address</label>
                <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2">
                  <code className="font-mono text-[11px] text-zinc-400 truncate">{agent.wallet}</code>
                  <CopyButton text={agent.wallet} label="" className="shrink-0 px-1 py-0.5" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">API Key</label>
                <ApiKeyField value="" prefix={agent.apiKeyPrefix ? `${agent.apiKeyPrefix}••••••••` : '—'} />
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800/50">
                <span className="text-zinc-500">Balance</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {balance.loading ? '...' : (balance.data?.balance ?? '0 BOT')}
                </span>
              </div>
            </div>
          </div>

          {/* Send Payment */}
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Send Payment</h3>
            <div className="flex gap-2 items-center">
              <input
                value={payTo}
                onChange={(e) => setPayTo(e.target.value)}
                placeholder="0x... destination"
                className="flex-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="BOT"
                type="number"
                inputMode="decimal"
                className="w-24 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                type="button"
                onClick={pay}
                disabled={paying || !payTo.trim() || !(Number(payAmount) > 0)}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 text-sm transition-colors shrink-0"
              >
                {paying ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend size={12} />}
                Send
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Requests', value: agent.requestCount ?? 0 },
              { label: 'Payments', value: agent.totalPayments ?? 0 },
              { label: 'Volume', value: `${Number(agent.totalVolumeBOT ?? 0).toFixed(4)}` }
            ].map((s) => (
              <div key={s.label} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-3 py-3 text-center">
                <p className="text-[10px] text-zinc-500 uppercase">{s.label}</p>
                <p className="text-lg font-bold text-zinc-200 font-mono">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Transactions + Quick Actions */}
        <div className="space-y-4">
          {/* Transactions */}
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Transactions</h3>
              {txHistory.length > 0 && (
                <button type="button" onClick={downloadLogs} className="text-[11px] text-zinc-500 hover:text-white inline-flex items-center gap-1">
                  <FiDownload size={10} /> Export
                </button>
              )}
            </div>
            {history.loading && !history.data ? (
              <Skeleton className="h-8 w-full rounded" lines={2} />
            ) : txHistory.length === 0 ? (
              <div className="py-6 text-center">
                <FiActivity size={20} className="text-zinc-700 mx-auto mb-1.5" />
                <p className="text-xs text-zinc-600">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {txHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between bg-zinc-950/40 border border-zinc-800/40 rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <code className="font-mono text-[11px] text-zinc-400 block truncate">{tx.to}</code>
                      <span className="text-[10px] text-zinc-600">{new Date(tx.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-xs font-semibold text-emerald-400 font-mono">-{tx.amount}</span>
                      <StatusBadge status={tx.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { to: '/developer/playground', icon: <FiActivity size={14} />, label: 'Playground', color: 'text-blue-400' },
                { to: '/developer/webhooks', icon: <FiCpu size={14} />, label: 'Webhooks', color: 'text-emerald-400' },
                { to: '/developer/marketplace', icon: <FiSend size={14} />, label: 'Services', color: 'text-violet-400' }
              ].map((a) => (
                <Link key={a.to} to={a.to} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/60 border border-zinc-800/50 hover:border-zinc-700 transition-all text-center">
                  <span className={a.color}>{a.icon}</span>
                  <span className="text-[11px] text-zinc-400 hover:text-white">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevAgentDetail;
