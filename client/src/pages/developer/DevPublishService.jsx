import React, { useMemo, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiCpu,
  FiShoppingBag, FiTrendingUp
} from 'react-icons/fi';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import Pill from '../../components/dev/Pill';
import ErrorBanner from '../../components/dev/ErrorBanner';
import Skeleton from '../../components/dev/Skeleton';

const STEPS = [
  { id: 0, label: 'Service Details', hint: 'What are you selling?' },
  { id: 1, label: 'Pricing & Billing', hint: 'How should buyers pay?' },
  { id: 2, label: 'Review & Publish', hint: 'Preview exactly how it appears in the Marketplace' }
];

const CATEGORY_META = {
  'ai-model': { icon: '🧠', title: 'AI Models', desc: 'Large language models and inference APIs' },
  gpu: { icon: '⚡', title: 'GPU Compute', desc: 'GPU-backed training and inference workloads' },
  compute: { icon: '🖥️', title: 'Compute', desc: 'CPU and general-purpose workloads' },
  ocr: { icon: '📄', title: 'OCR / Vision', desc: 'Extract text and structure from images' },
  voice: { icon: '🎤', title: 'Voice & Speech', desc: 'Speech recognition, TTS, and audio' },
  translation: { icon: '🌍', title: 'Translation', desc: 'Text translation between languages' },
  video: { icon: '🎬', title: 'Video', desc: 'Video processing, streaming, and generation' },
  storage: { icon: '📦', title: 'Storage', desc: 'Store and retrieve files securely' },
  api: { icon: '🔌', title: 'Data APIs', desc: 'Data feeds and structured endpoints' },
  other: { icon: '✨', title: 'Other', desc: 'Anything else on the network' }
};

const PRICING_META = {
  per_request: { icon: '🔁', title: 'Per Request', desc: 'Charge once per API call' },
  per_unit: { icon: '🧾', title: 'Per Unit', desc: 'Charge per unit — tokens, images, GB' },
  per_hour: { icon: '⏱️', title: 'Per Hour', desc: 'Charge for compute time used' },
  per_char: { icon: '✍️', title: 'Per Character', desc: 'Charge per character processed' },
  per_mb_day: { icon: '💾', title: 'Per MB / Day', desc: 'Charge for data stored per day' },
  flat: { icon: '💰', title: 'Flat Fee', desc: 'One-time fixed payment' },
  subscription: { icon: '♻️', title: 'Subscription', desc: 'Recurring monthly fee' }
};

const UNIT_CHIPS = ['request', 'image', 'hour', 'token', 'GB', 'minute', 'character'];

const input =
  'w-full bg-zinc-900/80 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 transition-colors';

const EMPTY = { title: '', category: 'compute', description: '', pricingModel: 'per_unit', unitLabel: 'request', unitPrice: '0.01', agentId: '', endpointUrl: '', healthCheckUrl: '' };

const priceLabel = (pm) => {
  switch (pm) {
    case 'per_request': return 'request';
    case 'per_hour': return 'hour';
    case 'per_char': return 'character';
    case 'per_mb_day': return 'MB / day';
    case 'flat': return 'one-time';
    case 'subscription': return 'month';
    default: return 'unit';
  }
};

const DevPublishService = () => {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const editing = !!serviceId;

  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const servicesState = useApi({ fetcher: () => developerApi.services(), deps: [] });
  const agents = useMemo(() => agentsState.data?.agents || [], [agentsState.data]);
  const services = useMemo(() => servicesState.data?.services || [], [servicesState.data]);

  const editingService = useMemo(
    () => (editing ? services.find((s) => s.serviceId === serviceId) : null),
    [editing, serviceId, services]
  );

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => ({ ...EMPTY }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    if (editingService) {
      setStep(1);
      setForm({
        title: editingService.title,
        category: editingService.category,
        description: editingService.description || '',
        pricingModel: editingService.pricingModel,
        unitLabel: editingService.unitLabel || 'request',
        unitPrice: String(editingService.unitPrice ?? ''),
        agentId: editingService.agentId || ''
      });
    }
  }, [editing, editingService]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const activeCountByAgent = useMemo(() => {
    const map = {};
    services.filter((s) => s.isActive).forEach((s) => { map[s.agentId] = (map[s.agentId] || 0) + 1; });
    return map;
  }, [services]);

  const autoPickAgent = useMemo(() => {
    if (!agents.length) return '';
    const ranked = [...agents].sort((a, b) => (activeCountByAgent[b.agentId] || 0) - (activeCountByAgent[a.agentId] || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    return ranked[0].agentId;
  }, [agents, activeCountByAgent]);

  useEffect(() => {
    if (!form.agentId && autoPickAgent) {
      setForm((f) => ({ ...f, agentId: autoPickAgent }));
    }
  }, [autoPickAgent, form.agentId]);

  const titleValid = form.title.trim().length > 0;
  const priceValid = Number.isFinite(Number(form.unitPrice)) && Number(form.unitPrice) > 0;
  const stepValid = step === 0 ? titleValid : step === 1 ? priceValid : true;

  const checks = [
    { ok: titleValid, label: 'Service name' },
    { ok: !!CATEGORY_META[form.category], label: 'Category' },
    { ok: priceValid, label: 'Pricing' },
    { ok: !!form.agentId, label: 'Publishing agent' },
    { ok: form.endpointUrl.trim().length > 0, label: 'API endpoint' },
    { ok: form.description.trim().length > 0, label: 'Description', optional: true }
  ];

  const selectedAgent = agents.find((a) => a.agentId === form.agentId);
  const allReady = checks.filter((c) => !c.optional).every((c) => c.ok);

  const preview = {
    title: form.title.trim() || 'Your service name',
    cat: CATEGORY_META[form.category],
    desc: form.description.trim() || 'Add a description — buyers see this in the Marketplace.',
    price: form.unitPrice,
    model: form.pricingModel,
    unit: form.unitLabel || priceLabel(form.pricingModel),
    providerName: selectedAgent?.name || 'your agent'
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else navigate('/developer/marketplace/services');
  };

  const goNext = () => {
    if (step === 2) return submit();
    if (!stepValid) {
      toast.error(step === 0 ? 'Give your service a name first.' : 'Unit price must be greater than zero.');
      return;
    }
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (!form.agentId) { toast.error('Select the agent that publishes this service.'); return; }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        pricingModel: form.pricingModel,
        unitPrice: String(Number(form.unitPrice)),
        unitLabel: form.unitLabel.trim() || null,
        agentId: form.agentId,
        endpointUrl: form.endpointUrl.trim() || null,
        healthCheckUrl: form.healthCheckUrl.trim() || null
      };
      if (editing) {
        await developerApi.updateService(serviceId, body);
        toast.success('Service updated and live in the Marketplace.');
      } else {
        await developerApi.createService(body);
        toast.success('Service published to the Marketplace.');
      }
      navigate('/developer/marketplace/services');
    } catch (err) {
      toast.error(err.message || 'Failed to save service');
      setSaving(false);
    }
  };

  if (editing && servicesState.loading && !editingService) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <div className="space-y-4 mt-2">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (editing && !editingService) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <ErrorBanner
          message={servicesState.error?.message || 'Service not found.'}
          onRetry={() => servicesState.refresh()}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{editing ? 'Edit Service' : 'Publish Service'}</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
          List an AI capability that other agents can discover, purchase, and invoke through the GlobalPay Marketplace.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-5">
          {STEPS.map((s) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    active ? 'bg-blue-600/15 text-blue-300 border-blue-800/60'
                    : done ? 'bg-emerald-600/10 text-emerald-300 border-emerald-800/40'
                    : 'bg-zinc-900/60 text-zinc-500 border-zinc-800'
                  }`}>
                    {done ? <FiCheck size={12} /> : <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-blue-400' : 'bg-current'}`} />}
                    {s.label}
                  </div>
                  {s.id < STEPS.length - 1 && <span className="w-5 h-px bg-zinc-800" />}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 mt-2">{STEPS[step].hint}</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        {/* Left — form column */}
        <div className="space-y-6 min-w-0">
          {step === 0 && (
            <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6" style={{ borderRadius: 16 }}>
              <h2 className="text-[15px] font-semibold text-white mb-1">Service Details</h2>
              <p className="text-xs text-zinc-400 mb-5">What are you selling? This shows up on the Marketplace card buyers see.</p>

              <div className="mb-6">
                <label htmlFor="svc-title" className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Service Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="svc-title"
                  value={form.title}
                  onChange={set('title')}
                  placeholder="GPT-5 Chat API"
                  maxLength={120}
                  autoFocus
                  className={`${input} ${titleValid ? 'border-emerald-800/60' : ''}`}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-zinc-500">This name appears in the Marketplace.</p>
                  <p className="text-[11px] text-zinc-600">{form.title.length}/120</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-xs font-medium text-zinc-400 mb-1.5">Category <span className="text-red-400">*</span></p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(CATEGORY_META).map(([key, c]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: key }))}
                      className={`text-left rounded-xl border p-3 transition-all ${
                        form.category === key
                          ? 'bg-blue-600/10 border-blue-700/70 ring-1 ring-blue-600/40'
                          : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{c.icon}</span>
                        <span className={`text-sm font-medium ${form.category === key ? 'text-blue-300' : 'text-zinc-100'}`}>{c.title}</span>
                        {form.category === key && <FiCheck className="ml-auto text-blue-400" size={14} />}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">{c.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="svc-desc" className="text-xs font-medium text-zinc-400">Description</label>
                  <span className="text-[11px] text-zinc-600">{form.description.length}/2000</span>
                </div>
                <textarea
                  id="svc-desc"
                  value={form.description}
                  onChange={set('description')}
                  rows={6}
                  maxLength={2000}
                  placeholder={'Describe your API, supported models,\nlatency, SLA, authentication,\nrate limits, and example use cases.'}
                  className={`${input} resize-y leading-relaxed`}
                />
              </div>

              <div className="mt-5 pt-5 border-t border-zinc-800">
                <h3 className="text-sm font-medium text-white mb-1">Service Endpoint</h3>
                <p className="text-xs text-zinc-400 mb-4">Where buyers will send requests. This is how your service is actually delivered.</p>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="svc-endpoint" className="text-xs font-medium text-zinc-400 mb-1.5 block">
                      API Endpoint URL <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="svc-endpoint"
                      value={form.endpointUrl}
                      onChange={set('endpointUrl')}
                      placeholder="https://api.yourservice.com/v1/extract"
                      className={input}
                    />
                    <p className="text-[11px] text-zinc-600 mt-1.5">Buyers will send requests to this URL after purchasing your service.</p>
                  </div>
                  
                  <div>
                    <label htmlFor="svc-healthcheck" className="text-xs font-medium text-zinc-400 mb-1.5 block">
                      Health Check URL <span className="text-zinc-600">(optional)</span>
                    </label>
                    <input
                      id="svc-healthcheck"
                      value={form.healthCheckUrl}
                      onChange={set('healthCheckUrl')}
                      placeholder="https://api.yourservice.com/health"
                      className={input}
                    />
                    <p className="text-[11px] text-zinc-600 mt-1.5">GlobalPay will monitor this endpoint to verify your service is online.</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6" style={{ borderRadius: 16 }}>
              <h2 className="text-[15px] font-semibold text-white mb-1">Pricing</h2>
              <p className="text-xs text-zinc-400 mb-5">Choose how buyers are billed. You can change this later.</p>

              <div className="mb-6">
                <p className="text-xs font-medium text-zinc-400 mb-1.5">Pricing model <span className="text-red-400">*</span></p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(PRICING_META).map(([key, p]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, pricingModel: key }))}
                      className={`text-left rounded-xl border p-3 transition-all ${
                        form.pricingModel === key
                          ? 'bg-blue-600/10 border-blue-700/70 ring-1 ring-blue-600/40'
                          : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{p.icon}</span>
                        <span className={`text-sm font-medium ${form.pricingModel === key ? 'text-blue-300' : 'text-zinc-100'}`}>{p.title}</span>
                        {form.pricingModel === key && <FiCheck className="ml-auto text-blue-400" size={14} />}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="svc-price" className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Unit price (USDC) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="svc-price"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={form.unitPrice}
                      onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                      className={`${input} pr-12 ${priceValid ? 'border-emerald-800/60' : ''}`}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">USDC</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5">
                    Buyers will pay this amount per {form.unitLabel || priceLabel(form.pricingModel)}.
                  </p>
                  {!priceValid && <p className="text-[11px] text-red-400 mt-1">Enter an amount greater than zero.</p>}
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-1.5">Unit label</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {UNIT_CHIPS.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, unitLabel: u }))}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          form.unitLabel === u
                            ? 'bg-blue-600/15 text-blue-300 border-blue-700/60'
                            : 'text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                  <input value={form.unitLabel} onChange={set('unitLabel')} placeholder="e.g. page, call, seat" className={input} maxLength={60} />
                  <p className="text-[11px] text-zinc-500 mt-1.5">Pick a suggested unit or type your own.</p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-zinc-400">Price preview</span>
                <span className="text-gradient font-black text-lg">
                  {priceValid ? Number(form.unitPrice).toFixed(4) : '0.0000'} USDC <span className="text-xs font-medium text-zinc-500">/ {form.unitLabel.trim() || priceLabel(form.pricingModel)}</span>
                </span>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6" style={{ borderRadius: 16 }}>
              <h2 className="text-[15px] font-semibold text-white mb-1">Publishing Agent</h2>
              <p className="text-xs text-zinc-400 mb-5">
                Which agent owns this service and receives settlement?
                {agents.length > 0 && form.agentId && !editing && (
                  <span className="text-emerald-400"> Auto-selected — you can switch below.</span>
                )}
              </p>

              {agentsState.loading && !agents.length ? (
                <div className="space-y-2"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
              ) : agents.length === 0 ? (
                <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
                  <p className="text-sm font-medium text-amber-300">No agents in this workspace</p>
                  <p className="text-xs text-zinc-400 mt-1">Create an agent first — it mints the wallet that receives marketplace payments.</p>
                  <button type="button" onClick={() => navigate('/developer/agents')} className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                    <FiCpu size={13} /> Create agent
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((a) => {
                    const active = form.agentId === a.agentId;
                    return (
                      <button
                        key={a.agentId}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, agentId: a.agentId, unitPrice: f.unitPrice || '0.01' }))}
                        className={`w-full text-left rounded-xl border p-4 transition-all ${
                          active ? 'bg-blue-600/10 border-blue-700/70 ring-1 ring-blue-600/40'
                          : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center text-base">🤖</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium truncate ${active ? 'text-blue-300' : 'text-zinc-100'}`}>{a.name || a.agentId}</span>
                              {a.status === 'suspended' && <Pill tone="red">suspended</Pill>}
                            </div>
                            <p className="font-mono text-[11px] text-zinc-500 truncate">{a.wallet ? `${a.wallet.slice(0, 8)}…${a.wallet.slice(-6)}` : 'no wallet'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-white">{a.balance != null ? `${a.balance}` : '—'} <span className="text-[10px] text-zinc-500 font-normal">USDC</span></p>
                            <p className="text-[11px] text-zinc-500">{activeCountByAgent[a.agentId] || 0} active service{(activeCountByAgent[a.agentId] || 0) === 1 ? '' : 's'}</p>
                          </div>
                          <span className={`ml-2 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            active ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}>
                            {active ? <FiCheck size={12} /> : 'Select'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="text-xs font-medium text-zinc-300 mb-3 flex items-center gap-2"><FiTrendingUp size={13} className="text-violet-400" /> Before publishing</p>
                <ul className="space-y-1.5">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2 text-xs">
                      <span className={c.ok ? 'text-emerald-400' : c.optional ? 'text-zinc-600' : 'text-zinc-600'}>
                        <FiCheckCircle className={c.ok ? '' : 'opacity-40'} size={13} />
                      </span>
                      <span className={c.ok ? 'text-zinc-300' : c.optional ? 'text-zinc-500' : 'text-zinc-500'}>{c.label}</span>
                      {c.ok && <FiCheck size={11} className="text-emerald-500" />}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-xs text-zinc-400 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium mb-2">After publishing</p>
                <p>• Buyers can discover your service immediately.</p>
                <p>• Payments are settled automatically to the agent wallet.</p>
                <p>• Usage creates invoices, metered and on-chain verified.</p>
              </div>
            </section>
          )}

          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={goBack} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white px-3 py-2 transition-colors">
              <FiArrowLeft size={14} /> {step === 0 ? 'Back to services' : 'Back'}
            </button>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <button type="button" onClick={() => navigate('/developer/marketplace/services')} className="text-sm text-zinc-400 hover:text-white px-3 py-2 transition-colors" disabled={saving}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={step === 2 ? !allReady : !stepValid}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {step === 0 ? 'Continue' : null}
                {step === 1 ? 'Continue to review' : null}
                {step === 2 ? (
                  saving ? 'Publishing…' : (
                    <>
                      🚀 Publish to Marketplace
                    </>
                  )
                ) : <FiArrowRight size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Right — live preview column */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">Live marketplace preview</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <div className="p-4" style={{ minHeight: 260 }}>
                <div className="flex items-center justify-between mb-3">
                  <Pill tone={step === 0 ? 'blue' : 'blue'}>{preview.cat?.title || form.category}</Pill>
                  {!editing && <Pill tone="amber"><FiTrendingUp size={11} /> New</Pill>}
                </div>
                <h3 className="text-sm font-semibold text-zinc-100 truncate">{preview.title}</h3>
                <p className="text-xs text-zinc-500 mt-1.5 mb-4 line-clamp-4" style={{ minHeight: 40 }}>{preview.desc}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-gradient font-black text-lg">{priceValid ? Number(form.unitPrice).toFixed(4) : '0.0000'}</span>
                    <span className="text-xs text-zinc-500"> USDC / {form.unitLabel.trim() || priceLabel(form.pricingModel)}</span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg opacity-60 cursor-not-allowed"
                  >
                    <FiShoppingBag size={13} /> Buy
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-zinc-800/70">
                  <p className="text-[11px] text-zinc-600 font-mono truncate">
                    Published by {selectedAgent?.name || 'your agent'}
                  </p>
                  <FiCheckCircle size={13} className="text-emerald-500 shrink-0" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium mb-3">Price preview</p>
              <p className="text-xl font-black text-gradient">
                {priceValid ? Number(form.unitPrice).toFixed(4) : '0.0000'} USDC
                <span className="text-xs font-medium text-zinc-500"> / {form.unitLabel.trim() || priceLabel(form.pricingModel)}</span>
              </p>
              <p className="text-[11px] text-zinc-500 mt-1.5">{PRICING_META[form.pricingModel]?.title} — {PRICING_META[form.pricingModel]?.desc}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-[11px] text-zinc-400 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium mb-2">Need help?</p>
              <p>• Buyers discover services through Network Discovery.</p>
              <p>• The marketplace handles billing, invoices, and settlement.</p>
              <p>• You can deactivate a listing anytime from My Services.</p>
              <a href="/developer/docs" className="inline-block mt-2 text-blue-400 hover:text-blue-300 font-medium">Read marketplace docs →</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default DevPublishService;