import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiSettings, FiSearch, FiCopy, FiDollarSign, FiClock, FiCpu,
  FiPauseCircle, FiPlayCircle, FiKey, FiGrid, FiList
} from 'react-icons/fi';
import developerApi from '../../utils/developerApi';
import agentsApi from '../../utils/agentsApi';
import { getDeveloperId } from '../../utils/identity';
import CopyButton from '../../components/dev/CopyButton';
import StatusBadge from '../../components/dev/StatusBadge';
import Modal from '../../components/dev/Modal';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import Pagination from '../../components/dev/Pagination';
import useApi from '../../hooks/useApi';

const CATEGORIES = ['Automation', 'Research', 'Finance', 'OCR', 'Translation', 'Voice', 'Video', 'GPU', 'Compute', 'Storage', 'Data', 'Other'];

const DevAgents = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', status: '', page: 1, perPage: 10 });
  const [viewMode, setViewMode] = useState('grid');

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.agents(filters),
    deps: [filters.search, filters.status, filters.page, filters.perPage]
  });

  const agents = data?.agents || [];
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Automation');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [rotatingId, setRotatingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [balances, setBalances] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmRotate, setConfirmRotate] = useState(null);
  const [confirmSuspend, setConfirmSuspend] = useState(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (showCreate && nameRef.current) {
      nameRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      nameRef.current.focus();
    }
  }, [showCreate]);

  const setPage = (page) => setFilters((f) => ({ ...f, page }));

  const createAgent = async () => {
    setCreating(true);
    try {
      const res = await developerApi.createAgent({
        name,
        description: description || category
      });
      setCreatedKey({ agentId: res.agentId, apiKey: res.apiKey });
      toast.success('AI Agent created on Arc Testnet (Circle Agent Stack)!');
      setName(''); setDescription(''); setCategory('Automation');
      setShowCreate(false);
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  const rotate = async () => {
    if (!confirmRotate) return;
    setRotatingId(confirmRotate.agentId);
    try {
      const res = await developerApi.agentRotateKey(confirmRotate.agentId);
      setCreatedKey({ agentId: confirmRotate.agentId, apiKey: res.apiKey });
      toast.success('API key rotated — previous key is now invalid');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to rotate key');
    } finally {
      setRotatingId(null);
      setConfirmRotate(null);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.agentId);
    try {
      await developerApi.deleteAgent(confirmDelete.agentId);
      toast.success('Agent deleted');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to delete agent');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  const checkBalance = async (agent) => {
    setBusyId(agent.agentId);
    try {
      const res = await developerApi.agentBalance(agent.agentId);
      setBalances((prev) => ({ ...prev, [agent.agentId]: res.balance || '0 USDC' }));
    } catch (err) {
      setBalances((prev) => ({ ...prev, [agent.agentId]: 'Error' }));
    } finally {
      setBusyId(null);
    }
  };

  const applySuspend = async (agent, suspend) => {
    setBusyId(agent.agentId);
    try {
      if (suspend) await developerApi.suspendAgent(agent.agentId);
      else await developerApi.resumeAgent(agent.agentId);
      toast.success(suspend ? 'Agent suspended' : 'Agent resumed');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to update agent');
    } finally {
      setBusyId(null);
      setConfirmSuspend(null);
    }
  };

  const toggleSuspend = (agent) => {
    const suspending = agent.status !== 'suspended';
    if (suspending) { setConfirmSuspend(agent); return; }
    applySuspend(agent, false);
  };

  return (
    <div className="pb-12">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-sm text-zinc-500 mt-1">Headless wallets your bots can spend from automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refresh({ background: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2.5 rounded-lg"
          >
            <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2"
          >
            <FiPlus /> Create AI Agent
          </button>
        </div>
      </header>

      {error && !loading && <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 backdrop-blur-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              placeholder="Search agents…"
              aria-label="Search agents"
              autoComplete="off"
              className="w-full bg-[#05070B] text-zinc-100 placeholder-zinc-500 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
            aria-label="Filter by status"
            className="bg-[#05070B] border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-300 transition-all"
          >
            <option value="" className="bg-[#05070B] text-zinc-300">All statuses</option>
            <option value="active" className="bg-[#05070B] text-zinc-300">Active</option>
            <option value="suspended" className="bg-[#05070B] text-zinc-300">Suspended</option>
            <option value="revoked" className="bg-[#05070B] text-zinc-300">Revoked</option>
          </select>
          <span className="text-xs text-zinc-500 font-medium bg-zinc-900/40 border border-zinc-800/60 px-2.5 py-1 rounded-full">{data?.total ?? 0} total</span>

          {/* View Toggle */}
          <div className="flex border border-zinc-800/80 rounded-xl overflow-hidden p-0.5 bg-[#05070B] ml-auto shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
            <button
              onClick={() => setViewMode('grid')}
              type="button"
              aria-pressed={viewMode === 'grid'}
              aria-label="Grid view"
              className={`p-1.5 rounded-lg transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-zinc-800 text-white shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Grid Cards"
            >
              <FiGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              type="button"
              aria-pressed={viewMode === 'list'}
              aria-label="List view"
              className={`p-1.5 rounded-lg transition-all duration-200 ${
                viewMode === 'list'
                  ? 'bg-zinc-800 text-white shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Compact List"
            >
              <FiList size={15} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {loading && !data ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 space-y-4 animate-pulse">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="h-5 w-32 bg-zinc-800 rounded" />
                      <div className="h-3.5 w-48 bg-zinc-800 rounded" />
                    </div>
                    <div className="h-6 w-16 bg-zinc-800 rounded-full" />
                  </div>
                  <div className="h-14 bg-zinc-900/60 rounded-xl border border-zinc-800/40" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-10 bg-zinc-800 rounded-lg" />
                    <div className="h-10 bg-zinc-800 rounded-lg" />
                    <div className="h-10 bg-zinc-800 rounded-lg" />
                  </div>
                  <div className="h-10 bg-zinc-800 rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8"><Skeleton className="h-10 w-full rounded-lg" lines={4} /></div>
          )
          ) : !error && agents.length === 0 ? (
          <div className="py-8 border border-zinc-800/60 rounded-2xl bg-zinc-900/20">
            <EmptyState
              icon={<FiCpu size={28} />}
              title={filters.search || filters.status ? 'No agents match your filters' : 'No AI agents yet'}
              description={filters.search || filters.status ? 'Try clearing the search or status filter.' : 'Create your first agent to mint an Arc Testnet wallet and start transacting autonomously in USDC.'}
              primary={
                !filters.search && !filters.status ? {
                  label: 'Create AI Agent',
                  icon: <FiPlus size={15} />,
                  onClick: () => setShowCreate(true)
                } : undefined
              }
            />
          </div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {agents.map((a) => {
                const catColors = { automation: 'from-amber-500/20 to-orange-600/20', research: 'from-purple-500/20 to-pink-600/20', ocr: 'from-blue-500/20 to-cyan-600/20', translation: 'from-emerald-500/20 to-teal-600/20', voice: 'from-violet-500/20 to-indigo-600/20', gpu: 'from-cyan-500/20 to-blue-600/20', finance: 'from-green-500/20 to-emerald-600/20' };
                const grad = catColors[a.category] || catColors.automation;
                return (
                <div
                  key={a.agentId}
                  className={`group relative bg-zinc-900/60 border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/20 flex flex-col ${a.status === 'suspended' ? 'border-amber-800/50 opacity-70' : 'border-zinc-800/80 hover:border-zinc-700'}`}
                >
                  {/* Top accent bar */}
                  <div className={`h-1 w-full ${a.status === 'suspended' ? 'bg-gradient-to-r from-amber-500/50 to-amber-600/50' : `bg-gradient-to-r ${grad}`}`} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Header: avatar + name + status */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad} border border-zinc-700/30 flex items-center justify-center text-white text-lg font-bold shrink-0`}> 
                        {(a.name || 'A')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/developer/agents/${a.agentId}`} className="font-semibold text-zinc-100 hover:text-white text-[15px] line-clamp-1 transition-colors">{a.name}</Link>
                        <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{a.description || 'No description'}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>

                    {/* Quick info row */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-1.5 text-[11px] text-cyan-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        Arc Testnet
                      </div>
                      <div className="w-px h-3 bg-zinc-800" />
                      <span className="text-[11px] text-zinc-500 font-medium bg-zinc-800/60 px-1.5 py-0.5 rounded">{(a.category || 'other').replace(/_/g, ' ')}</span>
                      {balances[a.agentId] && (
                        <><div className="w-px h-3 bg-zinc-800" /><span className="text-[11px] text-emerald-400 font-mono font-semibold">{balances[a.agentId]}</span></>
                      )}
                    </div>

                    {/* Wallet + API key compact row */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex-1 bg-zinc-950/50 border border-zinc-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
                        <code className="font-mono text-[11px] text-zinc-400 truncate">{a.wallet.slice(0, 6)}…{a.wallet.slice(-4)}</code>
                        <button onClick={() => { navigator.clipboard?.writeText(a.wallet); toast.success('Wallet copied'); }} className="text-zinc-600 hover:text-zinc-300 p-0.5 transition-colors" title="Copy"><FiCopy size={11} /></button>
                      </div>
                      <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg px-3 py-2">
                        <code className="font-mono text-[11px] text-zinc-500">{a.apiKeyPrefix.slice(0, 12)}…</code>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-1 mb-4">
                      {[
                        { label: 'Requests', value: a.requestCount, color: 'text-zinc-200' },
                        { label: 'Payments', value: a.paymentCount, color: 'text-zinc-200' },
                        { label: 'Volume', value: `${Number(a.volumeUsdc || a.volumeBOT || 0).toFixed(2)}`, color: 'text-cyan-400', suffix: 'USDC' }
                      ].map((s) => (
                        <div key={s.label} className="text-center py-2 bg-zinc-950/40 rounded-lg border border-zinc-800/30">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">{s.label}</p>
                          <p className={`text-xs font-semibold ${s.color} font-mono`}>{s.value}{s.suffix ? ` ${s.suffix}` : ''}</p>
                        </div>
                      ))}
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Bottom: last activity + actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800/40">
                      <span className="text-[10px] text-zinc-600">
                        {a.lastActivity ? new Date(a.lastActivity).toLocaleDateString() : 'No activity'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Link to={`/developer/agents/${a.agentId}`} className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors" title="Manage"><FiSettings size={13} /></Link>
                        <button onClick={() => checkBalance(a)} type="button" disabled={busyId === a.agentId} className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors" title="Balance"><FiDollarSign size={13} /></button>
                        <button onClick={() => toggleSuspend(a)} type="button" disabled={busyId === a.agentId} className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors" title={a.status === 'suspended' ? 'Resume' : 'Suspend'}>{a.status === 'suspended' ? <FiPlayCircle size={13} /> : <FiPauseCircle size={13} />}</button>
                        <button onClick={() => setConfirmRotate(a)} type="button" disabled={rotatingId === a.agentId} className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors" title="Rotate Key"><FiKey size={13} className={rotatingId === a.agentId ? 'animate-spin' : ''} /></button>
                        <button onClick={() => setConfirmDelete(a)} type="button" disabled={busyId === a.agentId} className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><FiTrash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-zinc-500 border-b border-zinc-800">
                    <th className="pb-3 pr-4">Agent</th>
                    <th className="pb-3 pr-4">Wallet</th>
                    <th className="pb-3 pr-4">Chain</th>
                    <th className="pb-3 pr-4">API Key</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Requests</th>
                    <th className="pb-3 pr-4">Payments</th>
                    <th className="pb-3 pr-4">Volume</th>
                    <th className="pb-3 pr-4">Last Activity</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.agentId} className="border-b border-zinc-800/60 hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 pr-4">
                        <Link to={`/developer/agents/${a.agentId}`} className="font-semibold text-zinc-200 hover:text-blue-400 transition-colors">
                          {a.name}
                        </Link>
                        <p className="text-xs text-zinc-500 max-w-[200px] truncate mt-0.5">{a.description || 'No description'}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs text-zinc-400 bg-zinc-900/40 px-1.5 py-0.5 rounded border border-zinc-800">{a.wallet.slice(0, 8)}…{a.wallet.slice(-6)}</code>
                          <button onClick={() => { navigator.clipboard?.writeText(a.wallet); toast.success('Wallet copied'); }} type="button" className="text-zinc-500 hover:text-white" title="Copy wallet" aria-label="Copy wallet"><FiCopy size={12} /></button>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          {a.chainId ? `Arc · ${a.chainId}` : 'Arc Testnet · 5042002'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs text-zinc-500">{a.apiKeyPrefix}••••</code>
                        </div>
                      </td>
                      <td className="py-3 pr-4"><StatusBadge status={a.status} /></td>
                      <td className="py-3 pr-4 text-zinc-300 font-medium">{a.requestCount}</td>
                      <td className="py-3 pr-4 text-zinc-300 font-medium">{a.paymentCount}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-cyan-400 font-semibold">{Number(a.volumeUsdc || a.volumeBOT || 0).toFixed(2)} USDC</td>
                      <td className="py-3 pr-4 text-xs text-zinc-500">{a.lastActivity ? new Date(a.lastActivity).toLocaleDateString() : '—'}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/developer/agents/${a.agentId}`} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" title="Manage agent" aria-label="Manage agent"><FiSettings size={14} /></Link>
                          <button onClick={() => navigate(`/developer/agents/${a.agentId}`)} type="button" className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-zinc-800" title="View history" aria-label="View history"><FiClock size={14} /></button>
                          <button onClick={() => checkBalance(a)} type="button" disabled={busyId === a.agentId} className="p-2 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800" title="Check balance" aria-label="Check balance"><FiDollarSign size={14} /></button>
                          {a.status === 'suspended' ? (
                            <button onClick={() => toggleSuspend(a)} type="button" disabled={busyId === a.agentId} className="p-2 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800" title="Resume agent" aria-label="Resume agent"><FiPlayCircle size={14} /></button>
                          ) : (
                            <button onClick={() => toggleSuspend(a)} type="button" disabled={busyId === a.agentId} className="p-2 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800" title="Suspend agent" aria-label="Suspend agent"><FiPauseCircle size={14} /></button>
                          )}
                          <button onClick={() => setConfirmRotate(a)} type="button" disabled={rotatingId === a.agentId || busyId === a.agentId} className="p-2 rounded-lg text-zinc-400 hover:text-violet-400 hover:bg-zinc-800" title="Rotate API key" aria-label="Rotate API key">
                            <FiKey size={14} className={rotatingId === a.agentId ? 'animate-spin' : ''} />
                          </button>
                          <button onClick={() => setConfirmDelete(a)} type="button" disabled={busyId === a.agentId} className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Delete" aria-label="Delete agent">
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        <div className="mt-6 border-t border-zinc-800/60 pt-4">
          <Pagination
            page={data?.page || 1}
            totalPages={data?.totalPages || 1}
            total={data?.total || 0}
            perPage={filters.perPage}
            onChange={setPage}
          />
        </div>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create AI Agent" subtitle="Mints an Arc Testnet wallet (USDC native gas) + Circle Agent Stack key">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block" htmlFor="agent-name">Agent Name *</label>
            <input
              id="agent-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OCR Agent, Trading Bot, Translator"
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600/40"
            />
            <p className="text-[11px] text-zinc-600 mt-1">This name appears in the Agent Store when others browse</p>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do? e.g. Extracts text from invoices and receipts"
              rows={2}
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-600/40 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  type="button"
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    category === c
                      ? 'bg-blue-600/20 text-blue-300 border-blue-600/50 shadow-sm shadow-blue-500/10'
                      : 'bg-zinc-800/40 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={createAgent}
            disabled={creating || !name.trim()}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {creating ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating…
              </span>
            ) : 'Create Agent'}
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
            Cancel
          </button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title={`Delete agent "${confirmDelete?.name}"?`}
        description="This deletes the agent and its wallet. This cannot be undone."
        confirmLabel="Delete Agent"
        busy={busyId === confirmDelete?.agentId}
      />

      {/* Rotate key confirmation */}
      <ConfirmModal
        open={!!confirmRotate}
        onClose={() => setConfirmRotate(null)}
        onConfirm={rotate}
        title={`Rotate API key for "${confirmRotate?.name}"?`}
        description="The previous key stops working immediately. The new key is shown only once."
        confirmLabel="Rotate Key"
        danger={false}
        confirmClassName="bg-blue-600 hover:bg-blue-500"
        busy={rotatingId === confirmRotate?.agentId}
      />

      {/* Suspend confirmation */}
      <ConfirmModal
        open={!!confirmSuspend}
        onClose={() => setConfirmSuspend(null)}
        onConfirm={() => applySuspend(confirmSuspend, true)}
        title={`Suspend agent "${confirmSuspend?.name}"?`}
        description="Its API key will stop working until the agent is resumed."
        confirmLabel="Suspend Agent"
        busy={busyId === confirmSuspend?.agentId}
      />

      {/* One-time key reveal */}
      {createdKey && (
        <div className="mt-6 bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4">
          <p className="text-sm text-emerald-400 font-medium mb-2">🔑 API key issued — save it now. It is shown only once.</p>
          <div className="flex items-center gap-2">
            <code className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm flex-1 truncate">{createdKey.apiKey}</code>
            <CopyButton text={createdKey.apiKey} label="Copy" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DevAgents;
