import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiDownload, FiStar, FiCheckCircle, FiZap, FiLayers,
  FiShield, FiClock, FiExternalLink, FiBookOpen, FiCode, FiGlobe,
  FiDollarSign, FiAlertCircle, FiPlay, FiCpu, FiFileText, FiImage,
  FiMic, FiVideo, FiDatabase, FiLock, FiEye
} from 'react-icons/fi';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const input = 'w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';

const CAPABILITY_ICONS = {
  gpu: FiCpu, ocr: FiEye, llm: FiZap, vision: FiImage, audio: FiMic,
  video: FiVideo, storage: FiDatabase, wallet: FiDollarSign, workflow: FiLayers,
  api: FiCode, default: FiZap,
};

const IO_LABELS = {
  text: { icon: FiFileText, label: 'Text' },
  image: { icon: FiImage, label: 'Image' },
  audio: { icon: FiMic, label: 'Audio' },
  video: { icon: FiVideo, label: 'Video' },
  json: { icon: FiCode, label: 'JSON' },
  file: { icon: FiFileText, label: 'File' },
  url: { icon: FiGlobe, label: 'URL' },
  binary: { icon: FiDatabase, label: 'Binary' },
};

const DevAgentListingDetail = () => {
  const { listingId } = useParams();
  const [agentsResult, setAgentsResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: () => developerApi.marketplaceListing(listingId),
    deps: [listingId]
  });

  const [actingAgentId, setActingAgentId] = useState('');
  const [installing, setInstalling] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading && !data) return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-40 rounded" />
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-32 rounded-xl" /></div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
  if (error && !data) return <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />;

  const l = data?.listing || {};
  const versions = data?.versions || [];
  const reviews = data?.reviews || [];
  const myInstallation = data?.myInstallation;
  const isInstalled = !!myInstallation;

  const pickAgent = async (e) => {
    const value = e.target.value;
    setActingAgentId(value);
    if (!agentsResult) {
      try {
        setAgentsResult({ loading: true });
        const r = await developerApi.agents({ page: 1, perPage: 100 });
        setAgentsResult({ agents: r.agents || [] });
      } catch (err) {
        setAgentsResult({ error: err.message });
      }
    }
  };

  const install = async () => {
    if (!actingAgentId) return toast.error('Choose the consumer agent that will use this service.');
    setInstalling(true);
    try {
      const res = await developerApi.marketplaceInstall({ listingId, actingAgentId });
      toast.success(res.message || 'Agent installed');
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  const submitReview = async () => {
    if (!myInstallation) return toast.error('Install the agent before reviewing it.');
    setSubmitting(true);
    try {
      const res = await developerApi.marketplaceReview(myInstallation.installationId, {
        rating: reviewRating, title: reviewTitle, review: reviewBody
      });
      toast.success(res.message || 'Review saved');
      setReviewTitle(''); setReviewBody('');
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  const price = Number(l.priceBOT ?? 0);
  const priceLabel = l.pricingModel === 'free' ? 'Free' : l.pricingModel === 'enterprise' ? 'Enterprise' : `${price} BOT ${l.pricingModel === 'monthly' ? '/mo' : '/request'}`;

  /* Derived sections from listing data */
  const capabilities = l.capabilities || l.tags || [];
  const supportedInputs = l.supportedInputs || l.inputTypes || [];
  const supportedOutputs = l.supportedOutputs || l.outputTypes || [];
  const permissions = l.permissions || [];
  const examples = l.examples || l.useCases || [];
  const hasOverview = l.description || capabilities.length > 0 || supportedInputs.length > 0;

  return (
    <div className="relative">

      {/* ═══ Breadcrumb ═══ */}
      <div className="mb-5">
        <Link to="/developer/agent-marketplace" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          <FiArrowLeft size={13} /> Agent Store
        </Link>
      </div>

      {/* ═══ HERO — Compressed ═══ */}
      <div className="flex items-start gap-4 mb-8">
        {l.iconUrl ? (
          <img src={l.iconUrl} alt="" className="h-14 w-14 rounded-xl object-cover bg-zinc-800 flex-shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-lg flex-shrink-0">{(l.title || 'A')[0]}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-white tracking-tight">{l.title}</h1>
            {l.installedByMe && <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold rounded-full">Installed</span>}
          </div>
          <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">{l.tagline || l.description}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {l.publisher?.name && (
              <span className="text-sm text-zinc-400">by <span className="text-zinc-200 font-medium">{l.publisher.name}</span></span>
            )}
            {l.publisher?.verificationLevel && l.publisher.verificationLevel !== 'unverified' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-medium rounded-full">
                <FiCheckCircle size={9} /> Verified
              </span>
            )}
            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] font-medium rounded-full">{(l.category || 'other').replace(/_/g, ' ')}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-white font-mono">{priceLabel}</p>
          <div className="flex items-center justify-end gap-3 mt-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1"><FiStar size={11} className="text-amber-400" />{Number(l.ratingAvg ?? 0).toFixed(1)} ({l.ratingCount ?? 0})</span>
            <span className="inline-flex items-center gap-1"><FiDownload size={11} />{l.installCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* ═══ Stats Bar ═══ */}
      <div className="flex items-center gap-0 mb-8 pb-5 border-b border-zinc-800/50">
        {[
          { label: 'Version', value: `v${l.version || '1.0.0'}` },
          { label: 'API Calls', value: (l.apiCalls ?? 0).toLocaleString() },
          { label: 'Success Rate', value: `${Number(l.successRate ?? 0).toFixed(0)}%` },
          { label: 'Avg Response', value: `${(Number(l.avgResponseMs ?? 0) || 500).toFixed(0)}ms` },
          { label: 'Updated', value: l.updatedAt ? new Date(l.updatedAt).toLocaleDateString() : '—' },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            <div className="flex-1 px-4 first:pl-0">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-sm font-semibold text-zinc-200 font-mono">{s.value}</p>
            </div>
            {i < 4 && <div className="w-px h-6 bg-zinc-800/50" />}
          </React.Fragment>
        ))}
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex gap-0 mb-6 border-b border-zinc-800/50">
        {['overview', 'reviews', 'versions', 'examples'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ═══ MAIN 2-COL ═══ */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-8">

        {/* ── LEFT: Content ── */}
        <div className="space-y-8 min-w-0">

          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === 'overview' && (
            <>
              {/* Description */}
              {l.description && (
                <section>
                  <h2 className="text-base font-semibold text-white mb-3">About</h2>
                  <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{l.description}</p>
                </section>
              )}

              {/* Capabilities */}
              {capabilities.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold text-white mb-3">Capabilities</h2>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.map((cap) => {
                      const key = String(cap).toLowerCase();
                      const Icon = CAPABILITY_ICONS[key] || CAPABILITY_ICONS.default;
                      return (
                        <div key={cap} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 border border-zinc-800 rounded-lg text-sm text-zinc-300">
                          <Icon size={13} className="text-zinc-500" />
                          {String(cap).replace(/_/g, ' ')}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Supported Inputs / Outputs */}
              {(supportedInputs.length > 0 || supportedOutputs.length > 0) && (
                <section>
                  <h2 className="text-base font-semibold text-white mb-3">Supported Formats</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {supportedInputs.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2">Inputs</p>
                        <div className="flex flex-wrap gap-1.5">
                          {supportedInputs.map((t) => {
                            const info = IO_LABELS[String(t).toLowerCase()] || IO_LABELS.text;
                            const Icon = info.icon;
                            return <span key={t} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800/40 text-zinc-400 text-xs rounded-md"><Icon size={11} />{info.label}</span>;
                          })}
                        </div>
                      </div>
                    )}
                    {supportedOutputs.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2">Outputs</p>
                        <div className="flex flex-wrap gap-1.5">
                          {supportedOutputs.map((t) => {
                            const info = IO_LABELS[String(t).toLowerCase()] || IO_LABELS.json;
                            const Icon = info.icon;
                            return <span key={t} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800/40 text-zinc-400 text-xs rounded-md"><Icon size={11} />{info.label}</span>;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Pricing */}
              <section>
                <h2 className="text-base font-semibold text-white mb-3">Pricing</h2>
                <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-800/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-400">{l.pricingModel === 'free' ? 'Free tier' : l.pricingModel === 'monthly' ? 'Monthly subscription' : l.pricingModel === 'enterprise' ? 'Enterprise — contact for pricing' : 'Per request'}</p>
                      {l.billingCycle && l.pricingModel !== 'free' && <p className="text-xs text-zinc-600 mt-0.5">Billed {l.billingCycle}</p>}
                    </div>
                    <p className="text-lg font-bold text-white font-mono">{priceLabel}</p>
                  </div>
                </div>
              </section>

              {/* Permissions */}
              {permissions.length > 0 && (
                <section>
                  <h2 className="text-base font-semibold text-white mb-3">Permissions</h2>
                  <div className="space-y-1.5">
                    {permissions.map((p) => (
                      <div key={p} className="flex items-center gap-2 text-sm text-zinc-400">
                        <FiLock size={12} className="text-zinc-600 flex-shrink-0" />
                        {String(p).replace(/_/g, ' ')}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* API Endpoint */}
              {l.apiEndpoint && (
                <section>
                  <h2 className="text-base font-semibold text-white mb-3">API Endpoint</h2>
                  <div className="flex items-center gap-2 p-3 bg-zinc-800/30 rounded-lg border border-zinc-800/60">
                    <FiCode size={13} className="text-emerald-400 flex-shrink-0" />
                    <code className="text-sm text-zinc-300 font-mono truncate">{l.apiEndpoint}</code>
                    <a href={l.apiEndpoint} target="_blank" rel="noopener noreferrer" className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"><FiExternalLink size={12} /></a>
                  </div>
                </section>
              )}

              {/* Documentation */}
              {l.documentationUrl && (
                <section>
                  <h2 className="text-base font-semibold text-white mb-3">Documentation</h2>
                  <a href={l.documentationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                    <FiBookOpen size={13} /> Open documentation <FiExternalLink size={10} />
                  </a>
                </section>
              )}

              {/* Empty overview fallback */}
              {!hasOverview && !l.apiEndpoint && !l.documentationUrl && (
                <div className="py-10 text-center">
                  <p className="text-sm text-zinc-500">No additional details provided by the publisher.</p>
                </div>
              )}
            </>
          )}

          {/* ═══ REVIEWS TAB ═══ */}
          {activeTab === 'reviews' && (
            <>
              {reviews.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-zinc-800/60 rounded-xl">
                  <p className="text-sm text-zinc-500">No reviews yet.</p>
                  {!isInstalled && <p className="text-xs text-zinc-600 mt-1">Install this agent to leave a review.</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <div key={r.reviewId} className="py-4 border-b border-zinc-800/30 last:border-0">
                      <div className="flex items-center gap-1 text-amber-400 mb-1.5">
                        {Array.from({ length: 5 }).map((_, i) => <FiStar key={i} size={12} className={i < (r.rating || 0) ? '' : 'opacity-25'} />)}
                        <span className="text-xs text-zinc-500 ml-1">{r.rating}/5</span>
                      </div>
                      {r.title && <p className="text-sm font-medium text-zinc-200">{r.title}</p>}
                      {r.review && <p className="text-sm text-zinc-400 mt-1">{r.review}</p>}
                      <p className="text-xs text-zinc-600 mt-1.5">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Review form — only if installed */}
              {isInstalled && (
                <div className="mt-6 pt-6 border-t border-zinc-800/50">
                  <h3 className="text-sm font-semibold text-white mb-3">Write a Review</h3>
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <button key={i} type="button" onClick={() => setReviewRating(i + 1)} className={`text-lg transition-colors ${i < reviewRating ? 'text-amber-400' : 'text-zinc-700 hover:text-zinc-600'}`}><FiStar /></button>
                    ))}
                  </div>
                  <input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Title (optional)" className={`${input} mb-2`} />
                  <textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="Your experience…" rows={3} className={`${input} mb-3 resize-none`} />
                  <button type="button" onClick={submitReview} disabled={submitting} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
                    <FiZap size={12} /> {submitting ? 'Saving…' : 'Submit Review'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══ VERSIONS TAB ═══ */}
          {activeTab === 'versions' && (
            <>
              {versions.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-zinc-800/60 rounded-xl">
                  <p className="text-sm text-zinc-500">No version history published yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">Current version: v{l.version || '1.0.0'}</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {versions.map((v, i) => (
                    <div key={v.version} className="flex items-start gap-3 py-4 border-b border-zinc-800/30 last:border-0">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${v.isCurrent ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        <FiLayers size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-200">v{v.version}</p>
                          {v.isCurrent && <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold rounded-full">current</span>}
                        </div>
                        {v.changelog && <p className="text-sm text-zinc-400 mt-1">{v.changelog}</p>}
                        {v.releaseNotes && <p className="text-xs text-zinc-500 mt-1">{v.releaseNotes}</p>}
                        <p className="text-xs text-zinc-600 mt-1.5 inline-flex items-center gap-1"><FiClock size={10} />{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═══ EXAMPLES TAB ═══ */}
          {activeTab === 'examples' && (
            <>
              {examples.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-zinc-800/60 rounded-xl">
                  <p className="text-sm text-zinc-500">No examples provided yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">Check the documentation for usage examples.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {examples.map((ex, i) => (
                    <div key={i} className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-800/60">
                      <div className="flex items-center gap-2 mb-2">
                        <FiPlay size={12} className="text-emerald-400" />
                        <p className="text-sm font-medium text-zinc-200">{ex.title || `Example ${i + 1}`}</p>
                      </div>
                      {ex.description && <p className="text-sm text-zinc-400 mb-2">{ex.description}</p>}
                      {ex.code && (
                        <pre className="p-3 bg-zinc-900/60 rounded-lg text-xs text-zinc-300 font-mono overflow-x-auto">{ex.code}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ RIGHT: Sticky Sidebar ═══ */}
        <div className="space-y-5 sticky top-6 self-start">

          {/* Install Card */}
          <div className="p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl">
            <h3 className="text-sm font-semibold text-white mb-3">Install Agent</h3>
            <label className="text-xs text-zinc-500 font-medium">Consumer agent</label>
            <select value={actingAgentId} onChange={pickAgent} className={`${input} mt-1.5`}>
              <option value="">Select an agent…</option>
              {(agentsResult?.agents || []).map((a) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
            </select>
            <button type="button" onClick={install} disabled={installing || !data?.canInstall}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors">
              <FiDownload size={14} />
              {installing ? 'Installing…' : data?.canInstall === false ? 'Your own listing' : 'Install'}
            </button>
            {myInstallation && (
              <p className="mt-2.5 text-xs text-emerald-400 inline-flex items-center gap-1.5">
                <FiCheckCircle size={12} /> Installed — <Link to="/developer/agent-marketplace/installed" className="underline hover:text-emerald-300">Manage</Link>
              </p>
            )}
          </div>

          {/* Publisher & Trust — Merged */}
          <div className="p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl">
            <h3 className="text-sm font-semibold text-white mb-3">Publisher</h3>
            <div className="space-y-3">
              {l.publisher?.name && (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-xs font-bold">{l.publisher.name[0]}</div>
                  <div>
                    <p className="text-sm text-zinc-200 font-medium">{l.publisher.name}</p>
                    {l.publisher?.verificationLevel && l.publisher.verificationLevel !== 'unverified' && (
                      <p className="text-[10px] text-blue-400 inline-flex items-center gap-1"><FiCheckCircle size={8} /> Verified publisher</p>
                    )}
                  </div>
                </div>
              )}
              <div className="border-t border-zinc-800/60 pt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <FiShield size={11} className="text-emerald-400 flex-shrink-0" />
                  On-chain verified identity
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <FiZap size={11} className="text-blue-400 flex-shrink-0" />
                  Metered billing per request
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <FiLayers size={11} className="text-violet-400 flex-shrink-0" />
                  Versioned releases with changelogs
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          {(l.documentationUrl || l.websiteUrl) && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-2">Links</h3>
              <div className="space-y-1.5">
                {l.documentationUrl && (
                  <a href={l.documentationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                    <FiBookOpen size={12} /> Documentation <FiExternalLink size={9} className="ml-auto" />
                  </a>
                )}
                {l.websiteUrl && (
                  <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                    <FiGlobe size={12} /> Website <FiExternalLink size={9} className="ml-auto" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevAgentListingDetail;
