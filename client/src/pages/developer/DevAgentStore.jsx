import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiDollarSign, FiUsers, FiActivity, FiStar, FiUpload, FiTrash2, FiEdit2,
  FiGitBranch, FiPackage, FiRefreshCw, FiCheck, FiChevronRight,
  FiPlus, FiEye, FiBarChart2, FiExternalLink, FiX, FiCode, FiLink, FiGlobe,
  FiAlertCircle, FiAlertTriangle, FiTrendingUp, FiMessageSquare, FiSearch
} from 'react-icons/fi';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const CATEGORIES = ['gpu', 'automation', 'research', 'agentic', 'analytics', 'security', 'data', 'tools', 'customer_support', 'content', 'trading', 'other'];
const PRICING_MODELS = [
  { value: 'free', label: 'Free', desc: 'Unlimited installs' },
  { value: 'per_request', label: 'Per Request', desc: 'Pay per invocation' },
  { value: 'monthly', label: 'Monthly', desc: 'Monthly subscription' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Contact sales' },
];
const WIZARD_STEPS = ['Agent', 'Marketplace', 'Pricing', 'Integration', 'Publish'];
const input = 'w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
const emptyForm = { title: '', tagline: '', description: '', category: 'automation', customCategory: '', pricingModel: 'per_request', priceBOT: '', billingCycle: 'monthly', tags: '', iconUrl: '', apiEndpoint: '', webhookEndpoint: '', createDefaultService: true, documentationUrl: '', websiteUrl: '', supportEmail: '' };

/* ═══════════════ HELPERS ═══════════════ */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} className="text-sm font-mono font-medium" style={{ color: p.color }}>{Number(p.value).toFixed(4)} USDC</p>)}
    </div>
  );
};

const FieldError = ({ error }) => error ? <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><FiAlertCircle size={10} /> {error}</p> : null;

/* ═══════════════ MAIN ═══════════════ */
const DevAgentStore = () => {
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({ ...emptyForm });
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [versionForm, setVersionForm] = useState({ listingId: '', version: '', changelog: '', releaseNotes: '' });
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState('revenue');
  const [chartPeriod, setChartPeriod] = useState('30D');

  const { data: dash, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.marketplaceStoreDashboard() });
  const publishable = useApi({ fetcher: () => developerApi.marketplacePublishableAgents() });
  const versions = useApi({ fetcher: () => dash?.listings?.[0]?.listingId ? developerApi.marketplaceVersions(dash.listings[0].listingId) : Promise.resolve({ versions: [] }) });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));
  const reloadAll = () => { refresh({ background: true }); publishable.refresh({ background: true }); };

  const openWizard = async (prefillAgent) => {
    // World AgentKit verification gate — must verify before publishing
    if (!prefillAgent) {
      try {
        const [worldRes, agentsRes] = await Promise.all([
          developerApi.worldUserStatus(),
          developerApi.agents({ perPage: 1 })
        ]);
        const accountVerified = Boolean(worldRes?.verified);
        const agent = agentsRes?.agents?.[0];
        if (!accountVerified && agent && !agent.worldVerified) {
          toast.error('World verification required before publishing. Verify your identity with World ID.', { duration: 5000 });
          navigate('/developer/network/profile');
          return;
        }
      } catch { /* proceed anyway if check fails */ }
    }
    const listing = prefillAgent?.listing;
    setForm(listing ? {
      ...emptyForm,
      title: listing.title || prefillAgent.name || '',
      tagline: listing.tagline || '',
      description: listing.description || prefillAgent.description || '',
      category: listing.category || emptyForm.category,
      pricingModel: listing.pricingModel || emptyForm.pricingModel,
      priceBOT: listing.priceBOT || '',
      billingCycle: listing.billingCycle || emptyForm.billingCycle,
      tags: (listing.tags || []).join(', '),
      iconUrl: listing.iconUrl || '',
      apiEndpoint: listing.apiEndpoint || '',
      webhookEndpoint: listing.webhookEndpoint || '',
      documentationUrl: listing.documentationUrl || '',
      supportEmail: listing.supportContact || ''
    } : { ...emptyForm });
    setAgentId(prefillAgent?.agentId || '');
    setWizardStep(prefillAgent ? 1 : 0); setWizardOpen(true);
    publishable.refresh({ background: true });
  };

  const publish = async () => {
    if (!agentId) return toast.error('Select an agent.');
    setBusy(true);
    try {
      const effectiveCategory = form.category === 'other' ? form.customCategory : form.category;
      await developerApi.marketplacePublish(agentId, { ...form, category: effectiveCategory, status: 'published', tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) });
      toast.success('Published'); setWizardOpen(false); setForm({ ...emptyForm }); setAgentId(''); setWizardStep(0); reloadAll();
    } catch (err) { toast.error(err.message || 'Publish failed'); } finally { setBusy(false); }
  };

  const saveListing = async (l) => {
    try {
      await developerApi.marketplaceUpdateListing(l.listingId, { title: editing.title, tagline: editing.tagline, description: editing.description, category: editing.category, pricingModel: editing.pricingModel, priceBOT: editing.priceBOT, billingCycle: editing.billingCycle, tags: editing.tags.split(',').map((t) => t.trim()).filter(Boolean), status: l.status });
      toast.success('Updated'); setExpanded(null); setEditing(null); reloadAll();
    } catch (err) { toast.error(err.message || 'Update failed'); }
  };

  const publishVersion = async () => {
    if (!versionForm.version) return toast.error('Version required.');
    try {
      await developerApi.marketplacePublishVersion(versionForm.listingId, { version: versionForm.version, changelog: versionForm.changelog, releaseNotes: versionForm.releaseNotes });
      toast.success('Version published'); setVersionForm({ listingId: '', version: '', changelog: '', releaseNotes: '' }); reloadAll();
    } catch (err) { toast.error(err.message || 'Version failed'); }
  };

  const remove = async (listingId) => {
    if (!window.confirm('Remove this listing?')) return;
    try { await developerApi.marketplaceDeleteListing(listingId); toast.success('Removed'); setExpanded(null); reloadAll(); } catch (err) { toast.error(err.message); }
  };

  /* ── Validation ── */
  const [errors, setErrors] = useState({});
  const clearError = (key) => setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  const validateEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validateUrl = (v) => !v || /^https?:\/\//.test(v);
  const validateAgentStep = () => { if (!agentId) { setErrors({ agentId: 'Select an agent to continue.' }); return false; } setErrors({}); return true; };
  const validateMarketplaceStep = () => { const errs = {}; if (!form.title.trim()) errs.title = 'Name is required.'; if (!form.tagline.trim()) errs.tagline = 'Tagline is required.'; if (!form.description.trim()) errs.description = 'Description is required.'; if (!form.category) errs.category = 'Select a category.'; if (form.category === 'other' && !(form.customCategory || '').trim()) errs.category = 'Describe your custom category.'; if (form.supportEmail && !validateEmail(form.supportEmail)) errs.supportEmail = 'Enter a valid email.'; if (form.documentationUrl && !validateUrl(form.documentationUrl)) errs.documentationUrl = 'Enter a valid URL.'; if (form.websiteUrl && !validateUrl(form.websiteUrl)) errs.websiteUrl = 'Enter a valid URL.'; if (form.iconUrl && !validateUrl(form.iconUrl)) errs.iconUrl = 'Enter a valid URL.'; setErrors(errs); return Object.keys(errs).length === 0; };
  const validatePricingStep = () => { const errs = {}; if (!form.pricingModel) errs.pricingModel = 'Select a pricing model.'; if ((form.pricingModel === 'per_request' || form.pricingModel === 'monthly') && (!form.priceBOT || Number(form.priceBOT) <= 0)) errs.priceBOT = 'Enter a valid price greater than 0.'; setErrors(errs); return Object.keys(errs).length === 0; };
  const validateIntegrationStep = () => { const errs = {}; if (form.apiEndpoint && !validateUrl(form.apiEndpoint)) errs.apiEndpoint = 'Enter a valid URL.'; if (form.webhookEndpoint && !validateUrl(form.webhookEndpoint)) errs.webhookEndpoint = 'Enter a valid URL.'; setErrors(errs); return Object.keys(errs).length === 0; };
  const isStepValid = (step) => { if (step === 0) return !!agentId; if (step === 1) return !!(form.title.trim() && form.tagline.trim() && form.description.trim() && form.category); if (step === 2) { if (!form.pricingModel) return false; if ((form.pricingModel === 'per_request' || form.pricingModel === 'monthly') && (!form.priceBOT || Number(form.priceBOT) <= 0)) return false; return true; } if (step === 3) { if (form.apiEndpoint && !validateUrl(form.apiEndpoint)) return false; if (form.webhookEndpoint && !validateUrl(form.webhookEndpoint)) return false; return true; } return true; };
  const canProceed = () => isStepValid(wizardStep);
  const handleContinue = () => { let valid = false; if (wizardStep === 0) valid = validateAgentStep(); else if (wizardStep === 1) valid = validateMarketplaceStep(); else if (wizardStep === 2) valid = validatePricingStep(); else if (wizardStep === 3) valid = validateIntegrationStep(); else valid = true; if (valid) setWizardStep(wizardStep + 1); };

  /* ── All hooks above ── */
  const d = dash || {};
  const m = d.metrics || {};
  const listings = d.listings || [];
  const reviews = d.reviews || [];
  const trend = d.installTrend || [];
  const agents = publishable.data?.agents || [];
  const myListingList = listings;
  const unpublishd = agents.filter((a) => !a.published);

  const primaryListing = listings[0] || myListingList[0] || null;
  const versionList = versions.data?.versions || [];
  const latestVersion = versionList[0] || null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayInstalls = trend.find((t) => t.date === todayStr)?.count || 0;
  const totalInstallsAllTime = myListingList.reduce((a, l) => a + (l.totalInstalls || 0), 0);
  const conversionRate = totalInstallsAllTime > 0 ? Math.round((m.activeInstalls || 0) / totalInstallsAllTime * 100) : 0;
  const pendingPayout = Number(m.mrrBOT ?? 0) * 0.3;

  const alerts = [];
  if (primaryListing && !primaryListing.successRate && primaryListing.apiCalls > 0) alerts.push({ type: 'warning', text: 'API returning errors', detail: `${primaryListing.failedRequests} failed calls` });
  if (m.failedRequests30d > 10) alerts.push({ type: 'error', text: `${m.failedRequests30d} failed API calls (30d)` });
  if (m.churn30d > 0) alerts.push({ type: 'warning', text: `${m.churn30d} subscriptions cancelled` });
  if (reviews.length > 0 && reviews[0].rating <= 2) alerts.push({ type: 'error', text: 'Low-rated review received' });

  const filteredListings = useMemo(() => {
    let list = [...myListingList];
    if (tableSearch) { const q = tableSearch.toLowerCase(); list = list.filter((l) => (l.title || '').toLowerCase().includes(q) || (l.category || '').toLowerCase().includes(q)); }
    list.sort((a, b) => {
      if (tableSort === 'revenue') return Number(b.mrrBOT || 0) - Number(a.mrrBOT || 0);
      if (tableSort === 'installs') return (b.installs || 0) - (a.installs || 0);
      if (tableSort === 'rating') return (b.ratingAvg || 0) - (a.ratingAvg || 0);
      if (tableSort === 'name') return (a.title || '').localeCompare(b.title || '');
      if (tableSort === 'updated') return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      return 0;
    });
    return list;
  }, [myListingList, tableSearch, tableSort]);

  const revenueChartData = useMemo(() => trend.map((t) => ({ date: t.date?.slice(5) || '', revenue: Number(m.mrrBOT || 0) * (t.count || 1) * 0.01 })), [trend, m.mrrBOT]);
  const apiChartData = useMemo(() => trend.map((t) => ({ date: t.date?.slice(5) || '', calls: Math.round((m.apiCalls30d || 0) / 14 * (0.5 + Math.random())) })), [trend, m.apiCalls30d]);

  if (loading && !dash) return (
    <div className="space-y-10">
      <div className="h-8 w-48 bg-zinc-800 rounded" />
      <div className="flex gap-0 border-b border-zinc-800/40 pb-5">{[1, 2, 3, 4].map((i) => <div key={i} className="flex-1 px-4 first:pl-0"><Skeleton className="h-3 w-14 rounded mb-2" /><Skeleton className="h-7 w-16 rounded" /></div>)}</div>
      <Skeleton className="h-[360px] rounded" />
      <Skeleton className="h-48 rounded" />
    </div>
  );
  if (error && !dash) return <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />;

  return (
    <div className="relative">

      {/* ═══ HEADER ═══ */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Publisher Hub</h1>
           <p className="text-sm text-zinc-500 mt-0.5">Manage one Agent Marketplace listing and publish multiple services from the same agent wallet.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openWizard()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
            <FiPlus size={13} /> New Agent
          </button>
          <button onClick={() => navigate('/developer/agent-marketplace')} className="inline-flex items-center gap-1.5 px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm rounded-lg hover:bg-zinc-800/60 transition-colors">
            <FiEye size={13} /> Store
          </button>
          <button onClick={reloadAll} disabled={refreshing} className="p-2 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800/60 transition-colors">
            <FiRefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ KPI STRIP — 4 metrics, dividers ═══ */}
      <div className="flex items-center gap-0 mb-8 border-b border-zinc-800/40 pb-5">
        {[
          { label: 'Revenue', value: `${Number(m.mrrBOT ?? 0).toFixed(2)}`, unit: 'USDC' },
          { label: 'Installs', value: (m.activeInstalls ?? 0).toLocaleString() },
          { label: 'Subscribers', value: String(m.activeSubscriptions ?? 0) },
          { label: 'API Requests', value: (m.apiCalls30d ?? 0).toLocaleString() },
        ].map((k, i) => (
          <React.Fragment key={k.label}>
            <div className="flex-1 px-5 first:pl-0">
              <p className="text-sm text-zinc-500 mb-0.5">{k.label}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white font-mono leading-none">{k.value}</span>
                {k.unit && <span className="text-sm text-zinc-500">{k.unit}</span>}
              </div>
              {k.trend && <p className={`text-xs font-medium mt-0.5 ${k.up ? 'text-emerald-400' : 'text-red-400'}`}>{k.trend}</p>}
            </div>
            {i < 3 && <div className="w-px h-8 bg-zinc-800/50" />}
          </React.Fragment>
        ))}
      </div>

      {/* ═══ MAIN 2-COL ═══ */}
      <div className="grid grid-cols-[1fr_260px] gap-10">

        {/* ── LEFT: Content ── */}
        <div className="space-y-10 min-w-0">

          {/* Revenue Chart */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Revenue Analytics</h2>
              <div className="flex gap-0.5 bg-zinc-800/40 rounded-md p-0.5">
                {['24H', '7D', '30D', '90D'].map((p) => (
                  <button key={p} onClick={() => setChartPeriod(p)} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${chartPeriod === p ? 'bg-zinc-700/80 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={50} dx={-6} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={2} fill="url(#rg)" dot={false} activeDot={{ r: 4, fill: '#34d399', stroke: '#09090B', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Agent Performance */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Agent Performance</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <FiSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Search..." className="bg-zinc-800/40 border border-zinc-800 rounded-md pl-8 pr-3 py-1.5 text-sm text-white w-40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40" />
                </div>
                <select value={tableSort} onChange={(e) => setTableSort(e.target.value)} className="bg-zinc-800/40 border border-zinc-800 rounded-md px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/40">
                  <option value="revenue">Revenue</option>
                  <option value="installs">Installs</option>
                  <option value="rating">Rating</option>
                  <option value="name">Name</option>
                  <option value="updated">Updated</option>
                </select>
              </div>
            </div>
            {myListingList.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-zinc-800/60 rounded-lg">
                <FiUpload size={28} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-400 font-medium">No published agents</p>
                <p className="text-xs text-zinc-600 mt-1 mb-3">Publish your first AI Agent to start earning.</p>
                <button onClick={() => openWizard()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
                  <FiPlus size={13} /> Publish Agent
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-sm text-zinc-500 border-b border-zinc-800/50">
                      <th className="pb-3 pr-4 font-medium">Agent</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Version</th>
                      <th className="pb-3 pr-4 font-medium">Installs</th>
                      <th className="pb-3 pr-4 font-medium">Health</th>
                      <th className="pb-3 pr-4 font-medium">Revenue</th>
                      <th className="pb-3 pr-4 font-medium">Rating</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredListings.map((l, idx) => (
                      <tr key={l.listingId} className={`border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors ${idx % 2 !== 0 ? 'bg-zinc-900/20' : ''}`}>
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-3">
                            {l.iconUrl ? <img src={l.iconUrl} alt="" className="h-7 w-7 rounded-lg object-cover bg-zinc-800" /> : <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-[10px] font-bold">{(l.title || 'A')[0]}</div>}
                            <div className="min-w-0">
                              <p className="font-medium text-zinc-200 truncate">{l.title}</p>
                              <p className="text-xs text-zinc-500">{(l.category || '').replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${l.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${l.status === 'published' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                            {l.status}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-zinc-400 text-xs">v{l.version || '1.0.0'}</td>
                        <td className="py-3.5 pr-4 text-zinc-300">{(l.installs ?? 0).toLocaleString()}</td>
                        <td className="py-3.5 pr-4">
                          <span className={`text-xs font-medium ${l.successRate >= 95 ? 'text-emerald-400' : l.successRate >= 80 ? 'text-amber-400' : l.apiCalls > 0 ? 'text-red-400' : 'text-zinc-600'}`}>{l.apiCalls > 0 ? `${l.successRate || 0}%` : '—'}</span>
                        </td>
                        <td className="py-3.5 pr-4 font-mono text-amber-400 text-xs">{Number(l.mrrBOT ?? 0).toFixed(4)}</td>
                        <td className="py-3.5 pr-4"><span className="text-amber-400 text-xs">★</span> <span className="text-zinc-300 text-xs">{Number(l.ratingAvg ?? 0).toFixed(1)}</span></td>
                        <td className="py-3.5 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => navigate(`/developer/agent-marketplace/listing/${l.listingId}`)} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded transition-colors" title="View"><FiEye size={13} /></button>
                            <button onClick={() => { setExpanded(expanded === l.listingId ? null : l.listingId); setEditing({ ...l, tags: (l.tags || []).join(', ') }); }} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded transition-colors" title="Edit"><FiEdit2 size={13} /></button>
                            <button onClick={() => { setVersionForm({ ...versionForm, listingId: l.listingId }); setExpanded(expanded === l.listingId ? null : l.listingId); setEditing({ ...l, tags: (l.tags || []).join(', ') }); }} className="p-1.5 text-zinc-500 hover:text-blue-400 rounded transition-colors" title="Version"><FiGitBranch size={13} /></button>
                            <button onClick={() => remove(l.listingId)} className="p-1.5 text-zinc-600 hover:text-red-400 rounded transition-colors" title="Remove"><FiTrash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {expanded && editing && (
              <div className="mt-4 p-4 bg-zinc-800/20 rounded-lg border border-zinc-800/60">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-200">Edit: {editing.title}</h3>
                  <button onClick={() => { setExpanded(null); setEditing(null); }} className="text-zinc-500 hover:text-zinc-300"><FiX size={14} /></button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2 mb-2">
                  <input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title" className={input} />
                  <input value={editing.priceBOT || ''} onChange={(e) => setEditing({ ...editing, priceBOT: e.target.value })} placeholder="Price USDC" className={input} />
                </div>
                <textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} placeholder="Description" className={`${input} mb-2 resize-none`} />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select value={editing.category || 'automation'} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={input}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select>
                  <select value={editing.pricingModel || 'per_request'} onChange={(e) => setEditing({ ...editing, pricingModel: e.target.value })} className={input}>{PRICING_MODELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
                </div>
                <div className="grid sm:grid-cols-[1fr_2fr] gap-2 mb-3">
                  <input value={versionForm.listingId === editing.listingId ? versionForm.version : ''} onChange={(e) => setVersionForm({ ...versionForm, listingId: editing.listingId, version: e.target.value })} placeholder="Version" className={input} />
                  <input value={versionForm.listingId === editing.listingId ? versionForm.changelog : ''} onChange={(e) => setVersionForm({ ...versionForm, listingId: editing.listingId, changelog: e.target.value })} placeholder="Changelog" className={input} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => publishVersion()} className="inline-flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 font-medium"><FiGitBranch size={11} /> Publish version</button>
                  <button onClick={() => saveListing(editing)} className="inline-flex items-center gap-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg px-3 py-1.5 font-medium"><FiEdit2 size={11} /> Save</button>
                </div>
              </div>
            )}
          </section>

          {/* Bottom row — only render when there's data */}
          {(unpublishd.length > 0 || listings.length > 0 || reviews.length > 0) && (
            <section className="grid grid-cols-3 gap-8">
              {/* Drafts */}
              {unpublishd.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">Drafts</h3>
                  <div className="space-y-0 divide-y divide-zinc-800/40">
                    {unpublishd.slice(0, 3).map((a) => (
                      <div key={a.agentId} className="flex items-center gap-3 py-2.5 group">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-xs font-bold flex-shrink-0">{(a.name || 'A')[0]}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-zinc-200 truncate">{a.name}</p>
                          <p className="text-xs text-zinc-500">v{a.version || '1.0.0'}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openWizard(a)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors" title="Publish"><FiUpload size={11} /></button>
                          <button onClick={async () => { if (!window.confirm('Delete?')) return; try { await developerApi.deleteAgent(a.agentId); toast.success('Deleted'); reloadAll(); } catch (err) { toast.error(err.message); } }} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete"><FiTrash2 size={11} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity */}
              {listings.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">Activity</h3>
                  <div className="space-y-0 divide-y divide-zinc-800/40">
                    {listings.slice(0, 3).map((l) => (
                      <div key={l.listingId} className="flex items-start gap-2.5 py-2.5">
                        <div className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"><FiCheck size={9} className="text-emerald-400" /></div>
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-300">Published <span className="font-medium text-zinc-200">{l.title}</span></p>
                          <p className="text-xs text-zinc-600">v{l.version || '1.0.0'} · {l.installs || 0} installs</p>
                        </div>
                      </div>
                    ))}
                    {reviews.slice(0, 2).map((r, i) => (
                      <div key={`r-${i}`} className="flex items-start gap-2.5 py-2.5">
                        <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"><FiMessageSquare size={9} className="text-amber-400" /></div>
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-300">Review received</p>
                          <p className="text-xs text-zinc-600">{Array(r.rating || 0).fill('★').join('')} — {r.reviewerName || 'Anonymous'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API Analytics */}
              {m.apiCalls30d > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">API Analytics</h3>
                  <div className="mb-3">
                    <p className="text-2xl font-bold text-white font-mono">{(m.apiCalls30d ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">requests (30d)</p>
                  </div>
                  <div className="h-16 mb-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={apiChartData}><Bar dataKey="calls" fill="#22d3ee" radius={[2, 2, 0, 0]} /><XAxis dataKey="date" tick={false} axisLine={false} /></BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800/40">
                    <div><p className="text-xs text-zinc-500">Failed</p><p className="text-sm font-bold text-red-400 font-mono">{m.failedRequests30d ?? 0}</p></div>
                    <div><p className="text-xs text-zinc-500">Success</p><p className={`text-sm font-bold font-mono ${(m.avgSuccessRate || 0) >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>{((m.avgSuccessRate || 0) * 100).toFixed(0)}%</p></div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ── RIGHT: Sidebar ── */}
        <div className="space-y-5 sticky top-6 self-start pt-0.5">

          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Quick Actions</h3>
            <div className="space-y-0.5">
              {[
                { icon: <FiEdit2 size={12} />, label: 'Edit Listing', color: 'text-blue-400', action: () => primaryListing && (setExpanded(primaryListing.listingId), setEditing({ ...primaryListing, tags: (primaryListing.tags || []).join(', ') })) },
                { icon: <FiUpload size={12} />, label: 'Publish Agent', color: 'text-emerald-400', action: () => openWizard() },
                { icon: <FiGitBranch size={12} />, label: 'New Version', color: 'text-violet-400', action: () => primaryListing && (setVersionForm({ ...versionForm, listingId: primaryListing.listingId }), setExpanded(primaryListing.listingId)) },
                { icon: <FiEye size={12} />, label: 'Open Store', color: 'text-zinc-400', action: () => navigate('/developer/agent-marketplace') },
              ].map((a) => (
                <button key={a.label} onClick={a.action} className={`w-full flex items-center gap-2 py-1.5 px-1.5 rounded text-sm hover:bg-zinc-800/40 transition-colors ${a.color}`}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800/40" />

          {/* Agent Overview — merged health + review + marketplace */}
          {primaryListing && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Agent Overview</h3>
              <div className="space-y-2">
                {/* Status + Health */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${primaryListing.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{primaryListing.status}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${primaryListing.apiCalls > 0 && primaryListing.successRate >= 80 ? 'bg-emerald-400' : primaryListing.apiCalls > 0 ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Version</span>
                  <span className="text-sm text-zinc-300 font-mono">v{primaryListing.version || '1.0.0'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Health</span>
                  <span className={`text-sm font-medium ${primaryListing.successRate >= 95 ? 'text-emerald-400' : primaryListing.successRate >= 80 ? 'text-amber-400' : 'text-red-400'}`}>{primaryListing.apiCalls > 0 ? `${primaryListing.successRate || 0}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Rating</span>
                  <div className="flex items-center gap-1">
                    <FiStar size={10} className="text-amber-400" />
                    <span className="text-sm text-zinc-300 font-mono">{Number(primaryListing.ratingAvg ?? 0).toFixed(1)}</span>
                    <span className="text-xs text-zinc-600">({primaryListing.ratingCount || 0})</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Installs</span>
                  <span className="text-sm text-zinc-300 font-mono">{(primaryListing.totalInstalls ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Category</span>
                  <span className="text-sm text-zinc-300">{(primaryListing.category || '—').replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Updated</span>
                  <span className="text-sm text-zinc-400">{primaryListing.updatedAt ? new Date(primaryListing.updatedAt).toLocaleDateString() : '—'}</span>
                </div>
              </div>

              {/* Review pipeline — compact */}
              <div className="mt-3 pt-3 border-t border-zinc-800/40">
                <p className="text-xs text-zinc-500 mb-1.5">Review Pipeline</p>
                <div className="flex items-center gap-1">
                  {['Draft', 'Submitted', 'Review', 'Approved', 'Published'].map((s, i) => {
                    const statusMap = { draft: 0, submitted: 1, under_review: 2, approved: 3, published: 4 };
                    const current = statusMap[primaryListing.status] ?? 0;
                    const done = i <= current;
                    return <div key={s} className={`h-1.5 flex-1 rounded-full ${done ? 'bg-emerald-500' : 'bg-zinc-800'}`} title={s} />;
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-zinc-600">Draft</span>
                  <span className="text-[10px] text-zinc-600">Published</span>
                </div>
              </div>

              {/* Latest review */}
              {reviews.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800/40">
                  <p className="text-xs text-zinc-500 mb-1.5">Latest Review</p>
                  <div className="flex items-center gap-0.5 mb-1">
                    {Array.from({ length: 5 }).map((_, s) => <FiStar key={s} size={9} className={s < (reviews[0].rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'} />)}
                  </div>
                  <p className="text-xs text-zinc-300 line-clamp-2">{reviews[0].review || reviews[0].title || ''}</p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">— {reviews[0].reviewerName || 'Anonymous'}</p>
                </div>
              )}

              {/* Listing link */}
              <div className="mt-3 pt-3 border-t border-zinc-800/40">
                <button onClick={() => navigate(`/developer/agent-marketplace/listing/${primaryListing.listingId}`)} className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                  View listing <FiExternalLink size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Revenue Summary — compact */}
          <div>
            <div className="border-t border-zinc-800/40 pt-5" />
            <h3 className="text-sm font-semibold text-white mb-2">Revenue</h3>
            <div className="space-y-1.5">
              {[
                { label: 'This Month', value: `${Number(m.revenue30dBOT ?? 0).toFixed(4)} USDC`, color: 'text-emerald-400' },
                { label: 'MRR', value: `${Number(m.mrrBOT ?? 0).toFixed(4)} USDC`, color: 'text-amber-400' },
                { label: 'Pending', value: `~${pendingPayout.toFixed(4)} USDC`, color: 'text-violet-400' },
                { label: 'Churn', value: String(m.churn30d ?? 0), color: m.churn30d > 0 ? 'text-red-400' : 'text-emerald-400' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">{r.label}</span>
                  <span className={`text-sm font-mono font-medium ${r.color}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts — only when needed */}
          {alerts.length > 0 && (
            <div className="border-t border-zinc-800/40 pt-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-white">Alerts</h3>
                <span className="px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[10px] font-semibold rounded-full">{alerts.length}</span>
              </div>
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <FiAlertTriangle size={10} className={`flex-shrink-0 mt-0.5 ${a.type === 'error' ? 'text-red-400' : 'text-amber-400'}`} />
                    <p className="text-xs text-zinc-300">{a.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Floating Publish Button ═══ */}
      <button onClick={() => openWizard()} className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center transition-all hover:scale-105" title="Publish Agent">
        <FiPlus size={20} />
      </button>

      {/* ═══ WIZARD ═══ */}
      {wizardOpen && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'fadeIn 150ms ease-out' }}>
            <div className="absolute inset-0 bg-black/55" style={{ backdropFilter: 'blur(12px)' }} onClick={() => setWizardOpen(false)} />
            <div className="relative w-full max-w-[600px] max-h-[90vh] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col" style={{ animation: 'scaleIn 200ms ease-out' }}>
            <div className="shrink-0 px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Publish Agent</h2>
                <p className="text-xs text-zinc-500">Create a marketplace listing</p>
              </div>
              <button onClick={() => setWizardOpen(false)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"><FiX size={14} /></button>
            </div>
            <div className="shrink-0 px-5 py-2.5 border-b border-zinc-800/60">
              <div className="flex items-center gap-0">
                {WIZARD_STEPS.map((label, idx) => {
                  const done = idx < wizardStep || (idx === wizardStep && isStepValid(idx));
                  return (
                    <React.Fragment key={label}>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${done ? 'bg-emerald-500 text-white' : idx === wizardStep ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/30' : 'bg-zinc-800 text-zinc-600'}`}>{done ? <FiCheck size={10} /> : idx + 1}</span>
                        <span className={`text-[10px] font-medium hidden sm:inline ${idx === wizardStep ? 'text-emerald-400' : done ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</span>
                      </div>
                      {idx < WIZARD_STEPS.length - 1 && <div className={`flex-1 h-px mx-1.5 ${done ? 'bg-emerald-500/40' : 'bg-zinc-800'}`} />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto mb-2" key={wizardStep} style={{ animation: 'slideStep 200ms ease-out' }}>
              {wizardStep === 0 && (
                <div className="px-5 py-4">
                  <div className="mb-4">
                    <label className="block text-sm text-zinc-400 mb-1 font-medium">Agent</label>
                    <select value={agentId} onChange={(e) => { setAgentId(e.target.value); clearError('agentId'); }} className={`${input} ${errors.agentId ? 'border-red-500/50' : ''}`}>
                      <option value="">Select an agent…</option>
                      {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name} — v{a.version || '1.0.0'}{a.published ? ' · Published — select to update' : ''}</option>)}
                    </select>
                    <FieldError error={errors.agentId} />
                  </div>
                  {!agentId && <div className="p-6 bg-zinc-800/20 rounded-lg border border-dashed border-zinc-800 text-center"><FiPackage size={20} className="text-zinc-700 mx-auto mb-1.5" /><p className="text-xs text-zinc-500">Select an agent to begin.</p></div>}
                  {agentId && (() => { const ag = agents.find((a) => a.agentId === agentId); if (!ag) return null; return (
                    <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-800">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm font-bold flex-shrink-0">{(ag.name || 'A')[0]}</div>
                        <div className="min-w-0"><p className="text-sm font-semibold text-zinc-100">{ag.name}</p><p className="text-xs text-zinc-500 mt-0.5">v{ag.version || '1.0.0'} · {ag.status || 'Ready'}</p></div>
                      </div>
                    </div>
                  ); })()}
                </div>
              )}
              {wizardStep === 1 && (
                <div className="flex">
                  <div className="flex-1 px-5 py-4 space-y-4 min-w-0">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Basic Info</p>
                      <div className="space-y-3">
                        <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Name *</label><input value={form.title} onChange={(e) => { set('title')(e); clearError('title'); }} placeholder="e.g. OCR Assistant" className={`${input} ${errors.title ? 'border-red-500/50' : ''}`} /><FieldError error={errors.title} /></div>
                        <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Tagline *</label><input value={form.tagline} onChange={(e) => { set('tagline')(e); clearError('tagline'); }} placeholder="Short description." className={`${input} ${errors.tagline ? 'border-red-500/50' : ''}`} maxLength={70} /><FieldError error={errors.tagline} /></div>
                        <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Description *</label><textarea value={form.description} onChange={(e) => { set('description')(e); clearError('description'); }} rows={3} placeholder="What this agent does…" className={`${input} resize-none ${errors.description ? 'border-red-500/50' : ''}`} maxLength={1000} /><FieldError error={errors.description} /></div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Classification</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm text-zinc-400 mb-1.5 font-medium">Category *</label>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {CATEGORIES.map((c) => (
                              <button key={c} type="button" onClick={() => { setForm((f) => ({ ...f, category: c })); clearError('category'); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                form.category === c
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                                  : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:border-zinc-600 hover:text-zinc-200'
                              }`}>{c.replace(/_/g, ' ')}</button>
                            ))}
                          </div>
                          {form.category === 'other' && (
                            <input value={form.customCategory || ''} onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))} placeholder="Describe your category…" className={input} />
                          )}
                          <FieldError error={errors.category} />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-400 mb-1 font-medium">Tags</label>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {form.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (<span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded-md">{t}<button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.split(',').map((x) => x.trim()).filter((x) => x !== t).join(', ') }))} className="text-zinc-500 hover:text-zinc-300"><FiX size={9} /></button></span>))}
                          </div>
                          <input onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = e.target.value.trim(); if (v && !form.tags.split(',').map((x) => x.trim()).includes(v)) { setForm((f) => ({ ...f, tags: f.tags ? `${f.tags}, ${v}` : v })); e.target.value = ''; } } }} placeholder="Type and press Enter…" className={input} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Links</p>
                      <div className="space-y-3">
                        <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Icon URL</label><input value={form.iconUrl} onChange={(e) => { set('iconUrl')(e); clearError('iconUrl'); }} placeholder="https://..." className={`${input} ${errors.iconUrl ? 'border-red-500/50' : ''}`} /><FieldError error={errors.iconUrl} /></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="block text-xs text-zinc-500 mb-0.5">Docs URL</label><input value={form.documentationUrl} onChange={(e) => { set('documentationUrl')(e); clearError('documentationUrl'); }} placeholder="https://..." className={`${input} ${errors.documentationUrl ? 'border-red-500/50' : ''}`} /><FieldError error={errors.documentationUrl} /></div>
                          <div><label className="block text-xs text-zinc-500 mb-0.5">Website</label><input value={form.websiteUrl} onChange={(e) => { set('websiteUrl')(e); clearError('websiteUrl'); }} placeholder="https://..." className={`${input} ${errors.websiteUrl ? 'border-red-500/50' : ''}`} /><FieldError error={errors.websiteUrl} /></div>
                        </div>
                        <div><label className="block text-xs text-zinc-500 mb-0.5">Support Email</label><input value={form.supportEmail} onChange={(e) => { set('supportEmail')(e); clearError('supportEmail'); }} placeholder="support@..." className={`${input} ${errors.supportEmail ? 'border-red-500/50' : ''}`} /><FieldError error={errors.supportEmail} /></div>
                      </div>
                    </div>
                  </div>
                  <div className="w-[220px] shrink-0 px-4 py-4 hidden md:block">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Preview</p>
                    <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-800">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-base font-bold mb-2.5">{form.iconUrl ? <img src={form.iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover" /> : (form.title || 'A')[0]}</div>
                      <p className="text-sm font-semibold text-zinc-100 truncate">{form.title || 'Untitled'}</p>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{form.tagline || 'No tagline'}</p>
                      <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2">{form.description || 'No description'}</p>
                      {(form.category === 'other' && form.customCategory) ? <span className="inline-block mt-2 px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] rounded font-medium">{form.customCategory}</span> : <span className="inline-block mt-2 px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded font-medium">{form.category.replace(/_/g, ' ')}</span>}
                      <div className="mt-2 pt-2 border-t border-zinc-800/60">
                        <div className="text-[10px] text-zinc-600">From USDC 0.02</div>
                        <div className="mt-1.5 w-full py-1 bg-zinc-800 text-zinc-500 text-[10px] text-center rounded font-medium">Install</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {wizardStep === 2 && (
                <div className="px-5 py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {PRICING_MODELS.map((pm) => (
                      <button key={pm.value} type="button" onClick={() => { setForm((f) => ({ ...f, pricingModel: pm.value })); clearError('pricingModel'); clearError('priceBOT'); }} className={`p-3 rounded-lg border text-left transition-colors ${form.pricingModel === pm.value ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${form.pricingModel === pm.value ? 'border-emerald-400' : 'border-zinc-600'}`}>{form.pricingModel === pm.value && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}</span>
                          <span className="text-sm font-medium text-zinc-200">{pm.label}</span>
                        </div>
                        <p className="text-xs text-zinc-500 ml-[18px]">{pm.desc}</p>
                      </button>
                    ))}
                  </div>
                  {form.pricingModel !== 'free' && form.pricingModel !== 'enterprise' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Price (USDC) *</label><input value={form.priceBOT} onChange={(e) => { set('priceBOT')(e); clearError('priceBOT'); }} placeholder="0.02" className={`${input} ${errors.priceBOT ? 'border-red-500/50' : ''}`} /><FieldError error={errors.priceBOT} /></div>
                      <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Billing Cycle</label><select value={form.billingCycle} onChange={set('billingCycle')} className={input}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="one-time">One-time</option></select></div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={form.createDefaultService} onChange={setBool('createDefaultService')} className="accent-emerald-600" /> Auto-create billing service</label>
                </div>
              )}
              {wizardStep === 3 && (
                <div className="px-5 py-4 space-y-3">
                  <div><label className="block text-sm text-zinc-400 mb-1 font-medium">API Endpoint</label><input value={form.apiEndpoint} onChange={(e) => { set('apiEndpoint')(e); clearError('apiEndpoint'); }} placeholder="https://api.example.com/v1" className={`${input} ${errors.apiEndpoint ? 'border-red-500/50' : ''}`} /><FieldError error={errors.apiEndpoint} /></div>
                  <div><label className="block text-sm text-zinc-400 mb-1 font-medium">Webhook Endpoint</label><input value={form.webhookEndpoint} onChange={(e) => { set('webhookEndpoint')(e); clearError('webhookEndpoint'); }} placeholder="https://api.example.com/webhook" className={`${input} ${errors.webhookEndpoint ? 'border-red-500/50' : ''}`} /><FieldError error={errors.webhookEndpoint} /></div>
                </div>
              )}
              {wizardStep === 4 && (
                <div className="px-5 py-4 space-y-3">
                  <div className="space-y-1.5">
                    {[{ ok: !!(form.title.trim() && form.tagline.trim() && form.description.trim() && form.category), label: 'Marketplace Information' }, { ok: !!(form.pricingModel && ((form.pricingModel !== 'per_request' && form.pricingModel !== 'monthly') || (form.priceBOT && Number(form.priceBOT) > 0))), label: 'Pricing' }, { ok: true, label: 'Billing' }].map((s, i) => (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <span className={`w-4 h-4 rounded flex items-center justify-center ${s.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-600'}`}>{s.ok ? <FiCheck size={10} /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />}</span>
                        <span className={`text-sm ${s.ok ? 'text-zinc-300' : 'text-zinc-500'}`}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                  {canProceed() ? <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/20"><p className="text-sm text-emerald-400 font-medium">Ready to publish</p></div> : <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20"><p className="text-sm text-red-400 font-medium">Missing required fields</p></div>}
                  <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-800">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm font-bold flex-shrink-0">{form.iconUrl ? <img src={form.iconUrl} alt="" className="w-9 h-9 rounded-lg object-cover" /> : (form.title || 'A')[0]}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100">{form.title || 'Untitled'}</p>
                        <p className="text-xs text-zinc-500">{form.tagline || 'No tagline'}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] rounded font-medium">{(form.category === 'other' && form.customCategory ? form.customCategory : form.category).replace(/_/g, ' ')}</span>
                          <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded font-medium">{form.pricingModel.replace(/_/g, ' ')}</span>
                          {form.priceBOT && <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] rounded font-mono font-medium">{form.priceBOT} USDC</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 px-5 py-3 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between">
              <button onClick={() => { setErrors({}); setWizardStep(Math.max(0, wizardStep - 1)); }} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">{wizardStep > 0 ? 'Back' : 'Cancel'}</button>
              <div className="flex items-center gap-2">
                {wizardStep === 4 && <button className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg transition-colors">Save Draft</button>}
                {wizardStep < 4 ? (
                  <button onClick={handleContinue} disabled={!canProceed()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">Continue <FiChevronRight size={12} /></button>
                ) : (
                  <button onClick={publish} disabled={busy || !canProceed()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"><FiUpload size={12} /> {busy ? 'Publishing…' : 'Publish'}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevAgentStore;
