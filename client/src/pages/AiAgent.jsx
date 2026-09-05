import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  FiPlus, FiCopy, FiEye, FiEyeOff, FiRefreshCw, FiSend,
  FiActivity, FiUsers, FiCpu, FiCheckCircle, FiAlertCircle, FiExternalLink
} from 'react-icons/fi';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5550/api').replace(/\/$/, '');

const AiAgentHub = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null); // agent row from DB
  const [showKeys, setShowKeys] = useState({});
  const [rotatingId, setRotatingId] = useState(null);

  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [payTo, setPayTo] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/agents`);
      const data = await res.json();
      if (res.ok) setAgents(data.agents || []);
    } catch { /* backend down — keep last state */ }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const createAgent = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/agents/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setShowKeys((s) => ({ ...s, [data.agentId]: true }));
      toast.success('Agent created on Ethereum!');
      setName('');
      setDescription('');
      await fetchAgents();
    } catch (err) {
      toast.error(err.message || 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const loadAgent = async (agent) => {
    setSelected(agent);
    setDataLoading(true);
    setSendResult(null);
    try {
      const [balRes, histRes, statRes] = await Promise.all([
        fetch(`${API_URL}/agents/balance`, { headers: { Authorization: `Bearer ${agent.apiKey}` } }),
        fetch(`${API_URL}/agents/history`, { headers: { Authorization: `Bearer ${agent.apiKey}` } }),
        fetch(`${API_URL}/agents/stats`, { headers: { Authorization: `Bearer ${agent.apiKey}` } })
      ]);
      if (balRes.ok) setBalance((await balRes.json()).balance);
      if (histRes.ok) setHistory((await histRes.json()).transactions || []);
      if (statRes.ok) setStats(await statRes.json());
    } catch (err) {
      toast.error(err.message || 'Failed to load agent data');
    } finally {
      setDataLoading(false);
    }
  };

  const rotateKey = async (agent) => {
    setRotatingId(agent.agentId);
    try {
      const res = await fetch(`${API_URL}/agents/rotate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.apiKey}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success('API key rotated');
      setShowKeys((s) => ({ ...s, [agent.agentId]: true }));
      await fetchAgents();
      const updated = (await (await fetch(`${API_URL}/agents`)).json()).agents?.find(a => a.agentId === agent.agentId);
      if (updated) setSelected(updated);
    } catch (err) {
      toast.error(err.message || 'Failed to rotate key');
    } finally {
      setRotatingId(null);
    }
  };

  const sendPayment = async () => {
    if (!payTo || !payAmount) return toast.error('Enter destination and amount');
    setPaying(true);
    setSendResult(null);
    try {
      const res = await fetch(`${API_URL}/agents/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${selected.apiKey}` },
        body: JSON.stringify({ to: payTo.trim(), amount: Number(payAmount) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSendResult(data);
      toast.success(`Sent ${data.amount} ETH`);
      setPayTo('');
      setPayAmount('');
      loadAgent(selected);
    } catch (err) {
      toast.error(err.message || 'Failed to send payment');
    } finally {
      setPaying(false);
    }
  };

  const copy = (text, label = 'Copied') => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gradient">AI Agent Hub</h1>
          <p className="text-zinc-400 mt-1 flex items-center gap-2">
            <FiCpu className="inline" /> Financial infrastructure for autonomous AI agents on Ethereum.
          </p>
        </header>

        {/* Create */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FiPlus className="text-blue-500" /> Create AI Agent
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name (e.g. Travel AI, GPU Rent Bot)"
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (e.g. Books hotels and flights)"
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={createAgent}
            disabled={creating || !name.trim()}
            className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            {creating ? 'Creating…' : 'Create Agent'}
          </button>
        </section>

        {/* Agent list */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FiUsers className="text-blue-500" /> Your Agents
          </h2>
          {agents.length === 0 ? (
            <p className="text-zinc-600 text-sm">No agents yet. Create one above.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {agents.map((a) => (
                <div
                  key={a.agentId}
                  className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                    selected?.agentId === a.agentId
                      ? 'border-blue-500 bg-blue-900/20'
                      : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-600'
                  }`}
                  onClick={() => loadAgent(a)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{a.name}</div>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800">
                      {a.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 truncate font-mono">{a.wallet}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-zinc-600 font-mono">{a.apiKeyPrefix}••••</span>
                    <div className="flex items-center gap-2">
                      {showKeys[a.agentId] ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); copy(a.apiKey, 'API key copied'); }}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          {a.apiKey}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowKeys((s) => ({ ...s, [a.agentId]: true })); }}
                          className="text-zinc-500 hover:text-white text-xs flex items-center gap-1"
                        >
                          <FiEye size={12} /> show key
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agent detail */}
        {selected && (
          <>
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              {/* Wallet + balance */}
              <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FiCpu className="text-blue-500" /> Wallet & Balance
                </h3>
                <div className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-2 font-mono text-xs">
                  <span className="truncate">{selected.wallet}</span>
                  <button onClick={() => copy(selected.wallet)} className="text-zinc-400 hover:text-white shrink-0"><FiCopy size={14} /></button>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-black text-gradient">
                      {balanceLoading ? '…' : (balance ?? '—')}
                    </p>
                    <p className="text-zinc-500 text-xs mt-1">ETH balance</p>
                  </div>
                  <button
                    onClick={() => loadAgent(selected)}
                    disabled={dataLoading}
                    className="text-sm text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    <FiRefreshCw size={13} className={dataLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>

                <div className="mt-4 bg-zinc-800/60 rounded-lg p-3">
                  <label className="text-[10px] uppercase text-zinc-500">API key</label>
                  <div className="flex items-center gap-2 mt-1 font-mono text-xs">
                    <span className="truncate">
                      {showKeys[selected.agentId] ? selected.apiKey : `${selected.apiKeyPrefix}••••••••`}
                    </span>
                    <button onClick={() => setShowKeys((s) => ({ ...s, [selected.agentId]: !s[selected.agentId] }))} className="text-zinc-400 hover:text-white shrink-0">
                      {showKeys[selected.agentId] ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                    </button>
                    <button onClick={() => copy(selected.apiKey, 'API key copied')} className="text-zinc-400 hover:text-white shrink-0"><FiCopy size={14} /></button>
                  </div>
                  <button
                    onClick={() => rotateKey(selected)}
                    disabled={rotatingId === selected.agentId}
                    className="mt-2 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <FiRefreshCw size={12} className={rotatingId === selected.agentId ? 'animate-spin' : ''} /> Regenerate API Key
                  </button>
                </div>
              </section>

              {/* Pay */}
              <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FiSend className="text-blue-500" /> Send Payment
                </h3>
                <div className="space-y-3">
                  <input
                    value={payTo}
                    onChange={(e) => setPayTo(e.target.value)}
                    placeholder="0x… destination address"
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Amount in ETH (e.g. 0.02)"
                    type="number"
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={sendPayment}
                    disabled={paying}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
                  >
                    {paying ? 'Sending…' : <>Send <FiSend /></>}
                  </button>
                </div>

                {sendResult && (
                  <div className="mt-4 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-xs">
                    <div className="flex items-center gap-2 text-emerald-400 font-medium"><FiCheckCircle /> Payment confirmed</div>
                    <div className="mt-2 font-mono text-zinc-300">amount: {sendResult.amount} ETH</div>
                    <a href={sendResult.explorerUrl} target="_blank" rel="noreferrer"
                       className="mt-1 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                      View on explorer <FiExternalLink size={12} />
                    </a>
                  </div>
                )}
              </section>

              {/* Stats */}
              <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FiActivity className="text-blue-500" /> Payment Stats
                </h3>
                {stats ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-950/60 rounded-lg p-3 text-center">
                        <p className="text-2xl font-black text-gradient">{stats.totalPayments}</p>
                        <p className="text-[10px] uppercase text-zinc-500">Payments</p>
                      </div>
                      <div className="bg-zinc-950/60 rounded-lg p-3 text-center">
                        <p className="text-2xl font-black text-gradient">{Number(stats.totalVolumeETH).toFixed(4)}</p>
                        <p className="text-[10px] uppercase text-zinc-500">Volume ETH</p>
                      </div>
                    </div>
                    <div className="bg-zinc-950/60 rounded-lg p-3">
                      <p className="text-xs text-zinc-400">Unique recipients</p>
                      <p className="text-lg font-bold">{stats.uniqueRecipients}</p>
                    </div>
                    {stats.last7Days.length > 0 && (
                      <div className="bg-zinc-950/60 rounded-lg p-3">
                        <p className="text-[10px] uppercase text-zinc-500 mb-2">Last 7 days</p>
                        <div className="space-y-1">
                          {stats.last7Days.map((d) => (
                            <div key={d.date} className="flex justify-between text-xs">
                              <span className="text-zinc-500">{d.date}</span>
                              <span className="text-zinc-300">{Number(d.volumeETH).toFixed(6)} ETH</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-600 text-sm">No activity yet.</p>
                )}
              </section>
            </div>

            {/* History */}
            <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <FiActivity className="text-blue-500" /> Transaction History
              </h3>
              {history.length === 0 ? (
                <div className="text-center py-6 text-zinc-600 flex flex-col items-center gap-2">
                  <FiAlertCircle className="text-2xl" />
                  <p>No machine-to-machine payments yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
                      <div className="overflow-hidden">
                        <div className="font-mono text-xs text-zinc-400 truncate">{tx.to}</div>
                        <div className="text-xs text-zinc-600 mt-0.5">{new Date(tx.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="font-semibold text-emerald-400">-{tx.amount} {tx.token}</div>
                        <div className="text-[10px] uppercase text-zinc-600">{tx.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Setup hint */}
        {!selected && (
          <div className="mt-6 flex items-start gap-2 text-sm text-zinc-500 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
            <FiAlertCircle className="mt-0.5 shrink-0" />
            <span>
              Select an agent to manage its wallet, send payments, and view history.
              This calls <code className="text-blue-400">POST /api/agents/create</code>. If creation fails, run{' '}
              <code className="text-blue-400">agents_migration.sql</code> in the Supabase SQL editor.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiAgentHub;