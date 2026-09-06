import React, { useState, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FiSave, FiGlobe, FiShield, FiMapPin, FiLink, FiUsers, FiHome,
  FiPlus, FiBriefcase, FiStar, FiActivity,
  FiExternalLink, FiCheckCircle, FiClock, FiX, FiUpload,
  FiFileText, FiGithub, FiCalendar, FiEye, FiArrowLeft, FiRefreshCw,
  FiPackage, FiDownload, FiDollarSign
} from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import Pill from '../../components/dev/Pill';
import EmptyState from '../../components/dev/EmptyState';
import VerificationBadge from '../../components/dev/VerificationBadge';
import ConfirmModal from '../../components/dev/ConfirmModal';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';
import { getOrganizationId, setOrganizationId } from '../../utils/identity';

/* ─── Styling constants ─── */
const inputBase = 'w-full bg-zinc-800/60 border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-colors';
const inputCls = `${inputBase} border-zinc-700 focus:ring-blue-500 focus:border-blue-500`;
const inputErr = `${inputBase} border-red-600/60 focus:ring-red-500 focus:border-red-500`;
const labelCls = 'block text-[11px] text-zinc-400 font-medium mb-1';
const errCls = 'text-[11px] text-red-400 mt-0.5';
const HELPER = 'text-[11px] text-zinc-500 mt-0.5';

const ABOUT_MAX = 500;

const CATEGORIES = [
  'AI Infrastructure', 'Machine Learning', 'NLP / Language Models', 'Computer Vision',
  'Data Analytics', 'Blockchain / Web3', 'Financial Technology', 'Healthcare AI',
  'Developer Tools', 'Automation', 'Security', 'Other'
];
const COMPANY_SIZES = ['Solo / Freelancer', '2\u201310', '11\u201350', '51\u2013200', '201\u20131000', '1000+'];
const SLA_OPTIONS = ['No SLA', 'Best Effort', '99% Uptime', '99.9% Uptime', '99.99% Uptime', 'Custom SLA'];

/* ─── Helpers ─── */
const fmtNum = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '\u2014');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '\u2014';
const fmtCurrency = (n) => (typeof n === 'number' && Number.isFinite(n) ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014');
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w\-./?%&=]*)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validateUrl = (v) => !v || URL_RE.test(v);
const validateEmail = (v) => !v || EMAIL_RE.test(v);
const parseList = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

/* ─── Compact verification banner ─── */
const VerificationBanner = ({ level, verifiedAt, compact = false }) => {
  const isVerified = level === 'verified_company' || level === 'enterprise' || level === 'government_partner';
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <FiShield size={13} className={isVerified ? 'text-emerald-400' : 'text-amber-400'} />
        <span className={`text-xs font-semibold ${isVerified ? 'text-emerald-300' : 'text-amber-300'}`}>
          {isVerified ? 'Verified' : 'Unverified'}
        </span>
        {verifiedAt && <span className="text-[10px] text-zinc-600">since {fmtDate(verifiedAt)}</span>}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
      isVerified
        ? 'bg-emerald-950/20 border-emerald-900/40'
        : 'bg-zinc-800/40 border-zinc-800/60'
    }`}>
      <FiShield size={14} className={isVerified ? 'text-emerald-400' : 'text-amber-400'} />
      <span className={`text-xs font-semibold ${isVerified ? 'text-emerald-300' : 'text-amber-300'}`}>
        {isVerified ? 'Verified' : 'Pending Review'}
      </span>
      <VerificationBadge level={level || 'unverified'} size="sm" />
    </div>
  );
};

/* ─── Compact metrics grid (2-col, 40-48px rows) ─── */
const MetricRow = ({ label, value }) => (
  <div className="flex items-baseline justify-between py-2 border-b border-zinc-800/50 last:border-0">
    <span className="text-xs text-zinc-500">{label}</span>
    <span className="text-sm font-semibold text-zinc-200 tabular-nums">{value}</span>
  </div>
);

const MetricsGrid = ({ profile }) => {
  const p = profile || {};
  const rows = [
    ['Trust Score', p.trustScore != null ? Number(p.trustScore).toFixed(1) : null],
    ['Rating', p.rating != null ? Number(p.rating).toFixed(1) : null],
    ['Services', p.serviceCount > 0 ? fmtNum(p.serviceCount) : null],
    ['Installs', p.installCount > 0 ? fmtNum(p.installCount) : null],
    ['Revenue', p.totalRevenue > 0 ? fmtCurrency(p.totalRevenue) : null],
    ['Updated', fmtDate(p.updatedAt)],
  ].filter(([, val]) => val !== null);
  if (!rows.length) return null;
  return (
    <Card>
      <SectionHead icon={FiActivity} title="Metrics" />
      <div className="grid grid-cols-2 gap-x-6">
        {rows.map(([label, value]) => <MetricRow key={label} label={label} value={value} />)}
      </div>
    </Card>
  );
};

/* ─── Section header (compact) ─── */
const SectionHead = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon size={14} className="text-blue-400 shrink-0" />
    <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{title}</h3>
  </div>
);

/* ─── Form field wrapper ─── */
const Field = ({ label, required, error, children, className = '' }) => (
  <div className={className}>
    <label className={labelCls}>{label} {required && <span className="text-red-400">*</span>}</label>
    {children}
    {error && <p className={errCls}>{error}</p>}
  </div>
);

/* ─── Live preview card ─── */
const ProfilePreview = ({ form, profile }) => {
  const name = form?.name || profile?.name || 'Organization Name';
  const desc = form?.description || profile?.description || 'Short description will appear here.';
  const category = form?.category || profile?.industry || 'Category';
  const logoUrl = form?.logoUrl || profile?.logoUrl || '';
  const website = form?.website || profile?.website || '';
  const github = form?.githubUrl || profile?.githubUrl || '';
  const docs = form?.docsUrl || profile?.docsUrl || '';
  const p = profile || {};

  return (
    <Card dense className="sticky top-6">
      <div className="flex items-center gap-2 mb-3">
        <FiEye size={13} className="text-zinc-500" />
        <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Live Preview</h3>
      </div>
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="h-16 bg-gradient-to-r from-blue-900/30 to-violet-900/30 relative">
          {logoUrl && (
            <img src={logoUrl} alt="" className="absolute -bottom-4 left-4 h-10 w-10 rounded-lg border-2 border-zinc-900 bg-zinc-800 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
        </div>
        <div className="px-4 pt-6 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-white">{name}</h4>
            <VerificationBadge level={p.verificationLevel || 'unverified'} size="sm" />
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">{category}</p>
          <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">{desc}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {website && <span className="inline-flex items-center gap-1 text-[9px] text-blue-400 bg-blue-950/30 border border-blue-900/30 rounded-full px-1.5 py-0.5"><FiGlobe size={8} />Website</span>}
            {github && <span className="inline-flex items-center gap-1 text-[9px] text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-1.5 py-0.5"><FiGithub size={8} />GitHub</span>}
            {docs && <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/30 rounded-full px-1.5 py-0.5"><FiFileText size={8} />Docs</span>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 pt-2 border-t border-zinc-800/60">
            <div><p className="text-[9px] uppercase text-zinc-500">Trust</p><p className="text-xs font-bold text-emerald-400">{p.trustScore != null ? Number(p.trustScore).toFixed(1) : '\u2014'}</p></div>
            <div><p className="text-[9px] uppercase text-zinc-500">Rating</p><p className="text-xs font-bold text-amber-400">{p.rating != null ? Number(p.rating).toFixed(1) : '\u2014'}</p></div>
          </div>
        </div>
      </div>
    </Card>
  );
};

/* ─── Empty state ─── */
const ProfileEmpty = ({ onCreate }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-800/30 flex items-center justify-center mb-5">
      <FiHome size={32} className="text-blue-400" />
    </div>
    <h2 className="text-xl font-bold text-white mb-2">Create your organization profile</h2>
    <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
      Complete your organization profile so customers can discover, trust, and purchase your AI services on the GlobalPay Marketplace.
    </p>
    <div className="mt-5 flex items-center gap-5 text-xs text-zinc-500">
      <span className="flex items-center gap-1.5"><FiCheckCircle size={11} className="text-emerald-400" /> Marketplace visibility</span>
      <span className="flex items-center gap-1.5"><FiCheckCircle size={11} className="text-emerald-400" /> Trust badge</span>
      <span className="flex items-center gap-1.5"><FiCheckCircle size={11} className="text-emerald-400" /> AI recommendations</span>
    </div>
    <button type="button" onClick={onCreate} className="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
      <FiPlus size={14} /> Create Profile
    </button>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ━━━ Main Component ━━━ */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const DevCompanyProfile = () => {
  const { data: profile, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.networkProfile() });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoDrag, setLogoDrag] = useState(false);
  const originalFormRef = useRef(null);

  const missing = !profile && (!error || error.status === 404);

  const initForm = useCallback((p = {}) => {
    const f = {
      name: p.name || '', category: p.industry || '', headquarters: p.country || '',
      website: p.website || '', logoUrl: p.logoUrl || '', description: p.description || '',
      supportEmail: p.supportEmail || '', contactEmail: p.contactEmail || '',
      docsUrl: p.docsUrl || '', githubUrl: p.githubUrl || '',
      founded: p.founded || '', companySize: p.companySize || '',
      certifications: parseList(p.certifications).join(', '),
      supportedRegions: parseList(p.supportedRegions).join(', '),
      supportSla: p.supportSla || '', isPublic: !!p.isPublic,
    };
    setForm(f);
    originalFormRef.current = f;
    setErrors({});
  }, []);

  const startEdit = useCallback(() => { initForm(profile || {}); setEditing(true); }, [profile, initForm]);

  const cancelEdit = useCallback(() => {
    if (form && originalFormRef.current && JSON.stringify(form) !== JSON.stringify(originalFormRef.current)) {
      setShowUnsaved(true); return;
    }
    setEditing(false); setForm(null); setErrors({});
  }, [form]);

  const discardChanges = () => { setEditing(false); setForm(null); setErrors({}); setShowUnsaved(false); };

  const set = useCallback((k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(prev => ({ ...prev, [k]: undefined })); }, []);
  const setBool = useCallback((k) => (e) => { setForm(f => ({ ...f, [k]: e.target.checked })); }, []);

  const handleLogoDrop = useCallback((e) => {
    e.preventDefault(); setLogoDrag(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setForm(f => ({ ...f, logoUrl: ev.target.result }));
      reader.readAsDataURL(file);
    }
  }, []);

  const validate = useCallback(() => {
    if (!form) return false;
    const errs = {};
    if (!form.name.trim()) errs.name = 'Organization name is required';
    if (!form.category) errs.category = 'Category is required';
    if (!form.headquarters.trim()) errs.headquarters = 'Headquarters is required';
    if (form.website && !validateUrl(form.website)) errs.website = 'Enter a valid URL';
    if (form.supportEmail && !validateEmail(form.supportEmail)) errs.supportEmail = 'Enter a valid email';
    if (form.contactEmail && !validateEmail(form.contactEmail)) errs.contactEmail = 'Enter a valid email';
    if (form.docsUrl && !validateUrl(form.docsUrl)) errs.docsUrl = 'Enter a valid URL';
    if (form.githubUrl && !validateUrl(form.githubUrl)) errs.githubUrl = 'Enter a valid URL';
    if (form.description.length > ABOUT_MAX) errs.description = `Maximum ${ABOUT_MAX} characters`;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const canSave = useMemo(() => form && form.name.trim() && form.category && form.headquarters.trim(), [form]);

  const save = useCallback(async () => {
    if (!form || !validate()) return;
    setSaving(true);
    try {
      const split = (v) => v.split(',').map(x => x.trim()).filter(Boolean);
      const patch = {
        name: form.name, description: form.description, industry: form.category,
        country: form.headquarters, website: form.website, logoUrl: form.logoUrl,
        supportEmail: form.supportEmail, contactEmail: form.contactEmail,
        docsUrl: form.docsUrl, githubUrl: form.githubUrl, founded: form.founded,
        companySize: form.companySize, certifications: split(form.certifications),
        supportedRegions: split(form.supportedRegions), supportSla: form.supportSla, isPublic: form.isPublic,
      };
      // Auto-create organization if none exists yet
      let orgId = getOrganizationId();
      if (!orgId) {
        const org = await developerApi.createOrganization({ name: form.name || 'My Organization' });
        orgId = org?.id;
        if (orgId) setOrganizationId(orgId);
      }
      await developerApi.saveNetworkProfile(patch);
      toast.success(profile ? 'Profile updated' : 'Profile created');
      setEditing(false); setForm(null); refresh({ background: true });
    } catch (err) { toast.error(err.message || 'Failed to save'); } finally { setSaving(false); }
  }, [form, validate, profile, refresh]);

  const togglePublic = useCallback(async () => {
    try {
      await developerApi.saveNetworkProfile({ isPublic: !profile?.isPublic });
      toast.success(profile?.isPublic ? 'Removed from marketplace' : 'Published to marketplace');
      refresh({ background: true });
    } catch (err) { toast.error(err.message || 'Failed'); }
  }, [profile, refresh]);

  const copyUrl = useCallback(async () => {
    try { await navigator.clipboard.writeText(`/api/platform/orgs/${profile?.slug || ':slug'}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }, [profile]);

  if (loading && !profile) return <Skeleton className="h-72 rounded-2xl" />;
  if (error && !profile && error.status !== 404) {
    return <div><PageHeader title="Public Profile" subtitle="Your organization's marketplace identity on GlobalPay." /><ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} /></div>;
  }

  const p = profile || {};

  /* ━━━ Empty ━━━ */
  if (missing && !editing) {
    return <div><PageHeader title="Public Profile" subtitle="Your organization's marketplace identity on GlobalPay." /><ProfileEmpty onCreate={startEdit} /></div>;
  }

  /* ━━━ Edit mode ━━━ */
  if (editing && form) {
    const editFilled = [form.name, form.category, form.headquarters, form.website, form.logoUrl, form.description, form.supportEmail, form.contactEmail].filter(Boolean).length;
    const editTotal = 8;
    const editPct = Math.round((editFilled / editTotal) * 100);

    return (
      <div className="flex flex-col min-h-0">
        <div className="flex-none">
          <PageHeader
            title={missing ? 'Create Profile' : 'Edit Profile'}
            subtitle="Complete your organization profile for marketplace visibility."
            actions={
              <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                <FiArrowLeft size={13} /> Back
              </button>
            }
          />
          {/* Edit progress bar */}
          <div className="flex items-center gap-3 px-1 mb-4">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300" style={{ width: `${editPct}%` }} />
            </div>
            <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{editFilled}/{editTotal} fields</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          <div className="grid xl:grid-cols-3 gap-5">
            {/* Left: Form */}
            <div className="xl:col-span-2 space-y-4">
              {/* Section 1: Organization Information */}
              <Card>
                <SectionHead icon={FiBriefcase} title="Organization Information" />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Organization Name" required error={errors.name}>
                    <input value={form.name} onChange={set('name')} placeholder="Your company name" className={errors.name ? inputErr : inputCls} />
                  </Field>
                  <Field label="Primary Category" required error={errors.category}>
                    <select value={form.category} onChange={set('category')} className={errors.category ? inputErr : inputCls}>
                      <option value="">Select category...</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Headquarters" required error={errors.headquarters}>
                    <input value={form.headquarters} onChange={set('headquarters')} placeholder="San Francisco, CA" className={errors.headquarters ? inputErr : inputCls} />
                  </Field>
                  <Field label="Website" error={errors.website}>
                    <input value={form.website} onChange={set('website')} placeholder="https://yourcompany.com" className={errors.website ? inputErr : inputCls} />
                  </Field>
                </div>

                {/* Logo upload */}
                <Field label="Logo" className="mt-3">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setLogoDrag(true); }}
                    onDragLeave={() => setLogoDrag(false)}
                    onDrop={handleLogoDrop}
                    className={`relative border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${logoDrag ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-600'}`}
                    onClick={() => {
                      const inp = document.createElement('input');
                      inp.type = 'file'; inp.accept = 'image/*';
                      inp.onchange = (e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => setForm(fm => ({ ...fm, logoUrl: ev.target.result })); r.readAsDataURL(f); } };
                      inp.click();
                    }}
                  >
                    {form.logoUrl ? (
                      <div className="flex items-center gap-3">
                        <img src={form.logoUrl} alt="Preview" className="h-10 w-10 rounded-lg object-cover bg-zinc-800 border border-zinc-700" />
                        <div className="text-left"><p className="text-xs text-zinc-200 font-medium">Logo uploaded</p><p className="text-[10px] text-zinc-500">Click or drop to replace</p></div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setForm(f => ({ ...f, logoUrl: '' })); }} className="ml-auto text-zinc-500 hover:text-red-400"><FiX size={14} /></button>
                      </div>
                    ) : (
                      <div className="py-1"><FiUpload size={20} className="mx-auto text-zinc-500 mb-1" /><p className="text-xs text-zinc-300">Drag & drop or click</p><p className="text-[10px] text-zinc-500">PNG, JPG up to 2MB</p></div>
                    )}
                  </div>
                  <p className={HELPER}>Or paste an image URL:</p>
                  <input value={form.logoUrl.startsWith('data:') ? '' : form.logoUrl} onChange={set('logoUrl')} placeholder="https://example.com/logo.png" className={`${inputCls} mt-1`} />
                </Field>

                {/* Description */}
                <Field label="About Organization" className="mt-3" error={errors.description}>
                  <textarea rows={3} value={form.description} onChange={set('description')} placeholder="What your organization does, your expertise, and why buyers should trust you..." className={`${errors.description ? inputErr : inputCls} resize-none`} maxLength={ABOUT_MAX + 50} />
                  <div className="flex justify-end mt-0.5">
                    <span className={`text-[10px] ${form.description.length > ABOUT_MAX ? 'text-red-400' : form.description.length > ABOUT_MAX * 0.9 ? 'text-amber-400' : 'text-zinc-600'}`}>{form.description.length}/{ABOUT_MAX}</span>
                  </div>
                </Field>

                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium mb-3">Optional details</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Support Email" error={errors.supportEmail}>
                    <input type="email" value={form.supportEmail} onChange={set('supportEmail')} placeholder="support@yourcompany.com" className={errors.supportEmail ? inputErr : inputCls} />
                  </Field>
                  <Field label="Contact Email" error={errors.contactEmail}>
                    <input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="hello@yourcompany.com" className={errors.contactEmail ? inputErr : inputCls} />
                  </Field>
                  <Field label="Documentation" error={errors.docsUrl}>
                    <input value={form.docsUrl} onChange={set('docsUrl')} placeholder="https://docs.yourcompany.com" className={errors.docsUrl ? inputErr : inputCls} />
                  </Field>
                  <Field label="GitHub" error={errors.githubUrl}>
                    <input value={form.githubUrl} onChange={set('githubUrl')} placeholder="https://github.com/your-org" className={errors.githubUrl ? inputErr : inputCls} />
                  </Field>
                  <Field label="Founded">
                    <input value={form.founded} onChange={set('founded')} placeholder="2024" className={inputCls} />
                  </Field>
                  <Field label="Company Size">
                    <select value={form.companySize} onChange={set('companySize')} className={inputCls}>
                      <option value="">Select size...</option>
                      {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              </Card>

              {/* Section 2: Marketplace Information */}
              <Card>
                <SectionHead icon={FiBriefcase} title="Marketplace Information" />
                <Field label="Compliance & Certifications">
                  <input value={form.certifications} onChange={set('certifications')} placeholder="SOC 2, GDPR, ISO 27001 (comma-separated)" className={inputCls} />
                  <p className={HELPER}>Comma-separated compliance standards</p>
                </Field>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Service Regions">
                    <input value={form.supportedRegions} onChange={set('supportedRegions')} placeholder="US, EU, APAC (comma-separated)" className={inputCls} />
                    <p className={HELPER}>Geographic regions for your services</p>
                  </Field>
                  <Field label="Support SLA">
                    <select value={form.supportSla} onChange={set('supportSla')} className={inputCls}>
                      <option value="">Select SLA...</option>
                      {SLA_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <label className="flex items-start gap-3 mt-4 p-3 bg-zinc-800/30 border border-zinc-800 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={form.isPublic} onChange={setBool('isPublic')} className="accent-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm text-zinc-200 font-medium">List organization in GlobalPay Marketplace</span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Visible to buyers and partners across the network.</p>
                  </div>
                </label>
              </Card>


            </div>

            {/* Right: Live preview */}
            <div className="hidden xl:block">
              <ProfilePreview form={form} profile={profile} />
            </div>
          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div className="flex-none border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-6 py-3 flex items-center justify-between sticky bottom-0 z-10">
          <button type="button" onClick={cancelEdit} className="text-sm text-zinc-400 hover:text-white px-4 py-2 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {p.slug && (
              <a href={`/api/platform/orgs/${p.slug}`} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors">
                <FiExternalLink size={12} /> Preview Public Profile
              </a>
            )}
            <button
              type="button" onClick={save} disabled={saving || !canSave}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <FiSave size={13} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <ConfirmModal open={showUnsaved} onClose={() => setShowUnsaved(false)} onConfirm={discardChanges} title="Unsaved changes" description="You have unsaved changes. Discard?" confirmLabel="Discard" cancelLabel="Keep editing" danger={false} confirmClassName="bg-amber-600 hover:bg-amber-500" />
      </div>
    );
  }

  /* ━━━ View mode ━━━ */
  // Calculate profile completion
  const filledFields = [
    p.name, p.industry, p.country, p.website, p.description,
    p.supportEmail, p.contactEmail, p.docsUrl, p.githubUrl,
    p.founded, p.companySize, p.logoUrl
  ].filter(Boolean).length;
  const totalFields = 12;
  const completionPct = Math.round((filledFields / totalFields) * 100);
  const isIncomplete = completionPct < 60;

  // Build only-filled fields for compact display
  const orgFields = [
    ['Organization Name', p.name],
    ['Category', p.industry],
    ['Headquarters', p.country],
    ['Website', p.website, p.website],
    ['Support Email', p.supportEmail, p.supportEmail ? `mailto:${p.supportEmail}` : undefined],
    ['Contact Email', p.contactEmail, p.contactEmail ? `mailto:${p.contactEmail}` : undefined],
    ['Documentation', p.docsUrl, p.docsUrl],
    ['GitHub', p.githubUrl, p.githubUrl],
    ['Founded', p.founded],
    ['Company Size', p.companySize],
  ].filter(([, val]) => val);

  const aboutField = p.description;

  const marketplaceFields = [
    ['Certifications', p.certifications?.length ? p.certifications.join(', ') : null],
    ['Service Regions', p.supportedRegions?.length ? p.supportedRegions.join(', ') : null],
    ['Support SLA', p.supportSla],
    ['Marketplace Listing', p.isPublic ? 'Listed' : 'Not listed'],
  ].filter(([, val]) => val);

  return (
    <div>
      <PageHeader
        title="Public Profile"
        subtitle="Your organization's marketplace identity on GlobalPay."
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />
            <button type="button" onClick={startEdit} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
              <FiSave size={14} /> {isIncomplete ? 'Complete Profile' : 'Edit Profile'}
            </button>
          </div>
        }
      />

      {/* Completion banner */}
      {isIncomplete && (
        <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-blue-950/40 to-violet-950/40 border border-blue-900/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FiBriefcase size={14} className="text-blue-400" />
              <span className="text-sm font-medium text-zinc-200">Profile {completionPct}% complete</span>
              <span className="text-[11px] text-zinc-500">— {filledFields} of {totalFields} fields</span>
            </div>
            <button type="button" onClick={startEdit} className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Complete now →
            </button>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
          </div>
          <p className="text-[11px] text-zinc-500 mt-1.5">A complete profile builds trust with buyers and improves marketplace visibility.</p>
        </div>
      )}

      {/* Hero card */}
      <Card className="mb-4">
        <div className="flex items-center gap-4">
          {p.logoUrl ? (
            <img src={p.logoUrl} alt={`${p.name} logo`} className="h-14 w-14 rounded-xl object-cover bg-zinc-800 border border-zinc-700 shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-800/30 flex items-center justify-center shrink-0">
              <FiHome size={22} className="text-blue-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-white">{p.name}</h2>
              <VerificationBadge level={p.verificationLevel} size="sm" />
              {p.isPublic ? <Pill tone="emerald" dot>Public</Pill> : <Pill tone="zinc" dot>Private</Pill>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
              {p.industry && <span className="flex items-center gap-1.5"><FiBriefcase size={11} className="text-zinc-500" />{p.industry}</span>}
              {p.country && <span className="flex items-center gap-1.5"><FiMapPin size={11} className="text-zinc-500" />{p.country}</span>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-400 hover:underline"><FiLink size={11} />{p.website.replace(/^https?:\/\//, '')}</a>}
              {p.companySize && <span className="flex items-center gap-1.5"><FiUsers size={11} className="text-zinc-500" />{p.companySize}</span>}
              {p.founded && <span className="flex items-center gap-1.5"><FiCalendar size={11} className="text-zinc-500" />Est. {p.founded}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Two-column layout: Info + Metrics/Verification */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Organization Details — only show filled fields */}
          {(orgFields.length > 0 || aboutField) && (
            <Card>
              <SectionHead icon={FiBriefcase} title="Organization Information" />
              {orgFields.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                  {orgFields.map(([label, val, href]) => (
                    <InfoRow key={label} label={label} value={val} href={href} />
                  ))}
                </div>
              )}
              {aboutField && (
                <div className="mt-3 pt-3 border-t border-zinc-800/50">
                  <InfoRow label="About" value={aboutField} />
                </div>
              )}
            </Card>
          )}

          {/* Marketplace — only show filled fields */}
          {marketplaceFields.length > 0 && (
            <Card>
              <SectionHead icon={FiBriefcase} title="Marketplace Information" />
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                {marketplaceFields.map(([label, val]) => (
                  <InfoRow key={label} label={label} value={val} />
                ))}
              </div>
            </Card>
          )}

          {/* Empty state if nothing is filled beyond the auto-created name */}
          {orgFields.length <= 1 && !aboutField && !marketplaceFields.length && (
            <Card>
              <div className="text-center py-8">
                <FiBriefcase size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-400 mb-3">Your profile only has a name. Add more details to build trust with buyers.</p>
                <button type="button" onClick={startEdit} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  <FiPlus size={14} /> Complete Your Profile
                </button>
              </div>
            </Card>
          )}
        </div>

        {/* Right column: Status + Metrics — only if there's something to show */}
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <VerificationBanner level={p.verificationLevel} verifiedAt={p.verifiedAt} compact />
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Visibility</span>
                {p.isPublic ? <Pill tone="emerald" dot>Public</Pill> : <Pill tone="zinc" dot>Private</Pill>}
              </div>
              {p.updatedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Updated</span>
                  <span className="text-zinc-300 tabular-nums">{fmtDate(p.updatedAt)}</span>
                </div>
              )}
            </div>
          </Card>
          <MetricsGrid profile={p} />
        </div>
      </div>
    </div>
  );
};

/* ━━━ Info row ━━━ */
const InfoRow = ({ label, value, href, full = false }) => (
  <div className={full ? 'sm:col-span-2' : ''}>
    <p className="text-[11px] text-zinc-500 font-medium mb-0.5">{label}</p>
    {href && value ? (
      <a href={href} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline break-all">{value.replace(/^https?:\/\//, '')}</a>
    ) : value ? (
      <p className="text-sm text-zinc-200">{value}</p>
    ) : (
      <p className="text-sm text-zinc-600">{'\u2014'}</p>
    )}
  </div>
);

export default DevCompanyProfile;
