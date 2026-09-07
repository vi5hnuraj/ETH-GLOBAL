import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiActivity, FiAlertTriangle, FiAward, FiCheckCircle, FiClock, FiCpu,
  FiDollarSign, FiExternalLink, FiShield, FiShoppingBag, FiShoppingCart, FiZap
} from 'react-icons/fi';
import RefreshButton from '../../components/dev/RefreshButton';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import StatusBadge from '../../components/dev/StatusBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const shortId = (id) => (id && typeof id === 'string'
  ? id.replace(/^(agent|service):/, '').slice(0, 18)
  : id);

const fmtMoney = (v) => {
  const n = Number(v || 0);
  if (n === 0) return '0.00';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtBOT = (v, dp = 4) => `${Number(v || 0).toFixed(dp)} USDC`;

const timeAgo = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 10) return 'just now';
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const buildDaily = (sessions, count) => {
  const days = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    days.push({ key: dayKey(d), spend: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  (sessions || []).forEach((s) => {
    const k = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : null;
    if (!k || !idx.has(k)) return;
    const bucket = days[idx.get(k)];
    const actual = Number(s.actualCostBOT || 0) || 0;
    const est = Number(s.estimatedCostBOT || 0) || 0;
    bucket.spend += actual > 0 ? actual : est;
  });
  return days;
};

const sessionCost = (s) => (Number(s.actualCostBOT || 0) || Number(s.estimatedCostBOT || 0));

const SERIES_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#f59e0b', '#38bdf8', '#f472b6'];

// ---------------------------------------------------------------------
// Header — one primary CTA, everything else secondary
// ---------------------------------------------------------------------

const Header = ({ onRefresh, busy }) => (
  <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <h1 className="text-[36px] font-bold tracking-tight text-white leading-none">Autonomous Commerce</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Live
        </span>
      </div>
      <p className="text-sm text-zinc-400 mt-2">Monitor AI agent purchasing across the Arc Chain.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <RefreshButton onClick={onRefresh} refreshing={busy} />
      <Link to="/developer/marketplace" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white">
        <FiShoppingBag size={13} /> Marketplace
      </Link>
      <Link to="/developer/commerce/policy" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white">
        <FiShield size={13} /> Policy
      </Link>
      <Link to="/developer/commerce/recommendations" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-sm transition-colors hover:bg-zinc-200">
        <FiShoppingCart size={14} /> Create Purchase Session
      </Link>
    </div>
  </header>
);

// ---------------------------------------------------------------------
// Row 1 — four KPIs
// ---------------------------------------------------------------------

const Kpi = ({ icon, iconColor, value, label, caption, to }) => {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={`text-[15px] ${iconColor}`}>{icon}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      </div>
      <p className="text-[40px] font-semibold tracking-tight text-white leading-none tabular-nums">{value}</p>
      <p className="text-xs font-medium text-zinc-400 mt-2">{label}</p>
      <p className="text-[11px] text-zinc-600 mt-0.5">{caption}</p>
    </>
  );
  const cls = 'rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-5 py-4 transition-colors hover:border-zinc-700/80 hover:bg-zinc-900/60';
  return to ? <Link to={to} className={`block ${cls}`}>{inner}</Link> : <div className={cls}>{inner}</div>;
};

// ---------------------------------------------------------------------
// Row 2 — recent purchase activity + AI insights
// ---------------------------------------------------------------------

const STATUS_META = {
  running: { dot: 'bg-emerald-400', type: 'Session' },
  reserved: { dot: 'bg-sky-400', type: 'Session' },
  requested: { dot: 'bg-amber-400', type: 'Approval' },
  completed: { dot: 'bg-blue-400', type: 'Purchased' },
  paid: { dot: 'bg-emerald-500', type: 'Settled' },
  closed: { dot: 'bg-zinc-500', type: 'Settled' },
  cancelled: { dot: 'bg-rose-400', type: 'Blocked' }
};

const ActivityFeed = ({ sessions }) => {
  const feed = useMemo(() => [...(sessions || [])]
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    .slice(0, 5), [sessions]);

  if (!feed.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-2 text-center">
        <p className="text-sm text-zinc-600">No purchases yet.</p>
        <Link to="/developer/marketplace" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white">
          <FiShoppingBag size={13} /> Browse Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-2">
      {feed.map((s) => {
        const meta = STATUS_META[s.status] || { dot: 'bg-zinc-600', type: s.status };
        return (
          <div key={s.sessionId} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/40">
            <span className="flex h-2 w-2 shrink-0 items-center justify-center">
              <span className={`h-2 w-2 rounded-full ${meta.dot} ${s.status === 'awaiting_payment' || s.status === 'processing' ? 'animate-pulse' : ''}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-mono text-[13px] text-zinc-200">{shortId(s.providerAgentId || s.serviceId)}</span>
                <span className="text-zinc-600">→</span>
                <span className="truncate font-mono text-[13px] text-zinc-400">{shortId(s.serviceId)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-600">
                {timeAgo(s.updatedAt || s.createdAt)} · {fmtBOT(sessionCost(s))}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="hidden sm:inline text-[10px] uppercase tracking-wide text-zinc-600">{meta.type}</span>
              <StatusBadge status={s.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const InsightRow = ({ icon, iconClass, text, tag, to }) => (
  <Link to={to} className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-800/40">
    <span className={`mt-0.5 shrink-0 ${iconClass}`}>{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-zinc-300 leading-snug">{text}</p>
      <span className="mt-1 inline-block text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{tag}</span>
    </div>
  </Link>
);

// ---------------------------------------------------------------------
// Row 3 — monthly spend chart + budget usage donut
// ---------------------------------------------------------------------

const SpendChart = ({ series, total, labels = [] }) => {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const geom = useMemo(() => {
    const count = series[0]?.points?.length || labels.length || 0;
    const W = 640; const H = 150; const PAD = 10;
    const totals = Array.from({ length: count }, (_, i) => series.reduce((s, p) => s + (p.points[i] || 0), 0));
    const max = Math.max(...totals, 1e-9);
    const x = (i) => (count <= 1 ? W / 2 : (i / (count - 1)) * W);
    const y = (v) => H - PAD - (v / max) * (H - PAD * 2);
    const cum = Array.from({ length: count }, () => 0);
    const paths = series.map((p) => {
      const lo = p.points.map((v, i) => ({ x: x(i), y: y(cum[i]) }));
      const hi = p.points.map((v, i) => ({ x: x(i), y: y(cum[i] + v) }));
      p.points.forEach((v, i) => { cum[i] += v; });
      const dLo = `M${lo[0].x.toFixed(1)},${lo[0].y.toFixed(1)}` + lo.slice(1).map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join('');
      const dHi = ` L${hi[hi.length - 1].x.toFixed(1)},${hi[hi.length - 1].y.toFixed(1)}` + hi.slice(0, -1).reverse().map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join('');
      return `${dLo}${dHi} Z`;
    });
    const pts = totals.map((t, i) => ({ x: x(i), y: y(t) }));
    const grid = [0.25, 0.5, 0.75].map((f) => ({ x1: 0, x2: W, y1: H - PAD - f * (H - PAD * 2), y2: H - PAD - f * (H - PAD * 2) }));
    return { W, H, PT: H - PAD, grid, pts, paths, count };
  }, [series, labels]);

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-zinc-600">Spending history will appear after purchases.</p>
        <Link to="/developer/marketplace" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition-colors hover:text-white">
          Browse Marketplace <FiExternalLink size={11} />
        </Link>
      </div>
    );
  }

  const onMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || geom.count <= 1) return;
    const idx = Math.round(((e.clientX - rect.left) / rect.width) * (geom.count - 1));
    setHover(Math.max(0, Math.min(idx, geom.count - 1)));
  };

  const hoverRows = hover !== null
    ? series.map((p) => ({ label: p.label, value: p.points[hover] || 0, color: p.color })).filter((r) => r.value > 0)
    : [];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight text-white tabular-nums">
          {fmtMoney(total)} <span className="text-xs font-medium text-zinc-500">USDC / mo</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {series.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
              {shortId(p.label)}
            </span>
          ))}
        </div>
      </div>
      <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${geom.W} ${geom.H}`} className="h-[150px] w-full">
          {geom.grid.map((g, i) => <line key={i} {...g} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />)}
          {geom.paths.map((d, i) => (
            <path key={i} d={d} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity="0.28" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth="1.5" strokeLinejoin="round" />
          ))}
          {hover !== null && geom.pts[hover] && (
            <line x1={geom.pts[hover].x} y1={geom.PT} x2={geom.pts[hover].x} y2="10" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          )}
        </svg>
        {hover !== null && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900/95 shadow-xl shadow-black/40 px-2.5 py-1.5 whitespace-nowrap"
            style={{ left: `${(geom.pts[hover].x / geom.W) * 100}%` }}
          >
            {hoverRows.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                <span className="text-zinc-400">{shortId(t.label)}</span>
                <span className="ml-auto font-semibold text-zinc-200 tabular-nums">{fmtMoney(t.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const BudgetUsage = ({ budgetNum, spend, pct }) => {
  const R = 34; const C = 2 * Math.PI * R;
  const frac = budgetNum > 0 ? Math.min(pct / 100, 1) : 0;
  const color = pct >= 90 ? '#f59e0b' : pct >= 60 ? '#38bdf8' : '#34d399';
  const remaining = budgetNum > 0 ? Math.max(budgetNum - spend, 0) : null;
  return (
    <div className="flex h-full items-center gap-6">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 90 90" className="h-full w-full -rotate-90">
          <circle cx="45" cy="45" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          {budgetNum > 0 && (
            <circle cx="45" cy="45" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${frac * C} ${C}`} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[28px] font-semibold text-white leading-none tabular-nums">{budgetNum > 0 ? pct : '—'}%</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">used</span>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Remaining Budget</p>
          <p className="mt-0.5 text-xl font-semibold text-white tabular-nums">{remaining !== null ? `${fmtMoney(remaining)} USDC` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Monthly Cap</p>
          <p className="mt-0.5 text-xl font-semibold text-white tabular-nums">{budgetNum > 0 ? `${fmtMoney(budgetNum)} USDC` : '—'}</p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Bottom — single elegant Quick Actions card
// ---------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: 'Create Purchase Session', to: '/developer/commerce/recommendations', icon: <FiShoppingCart size={14} />, iconClass: 'text-white', primary: true },
  { label: 'Browse Marketplace', to: '/developer/marketplace', icon: <FiShoppingBag size={14} />, iconClass: 'text-zinc-400' },
  { label: 'Manage Procurement Policy', to: '/developer/commerce/policy', icon: <FiShield size={14} />, iconClass: 'text-zinc-400' },
  { label: 'View Recommendations', to: '/developer/commerce/recommendations', icon: <FiAward size={14} />, iconClass: 'text-zinc-400' }
];

const QuickActions = () => (
  <section className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
    <h2 className="mb-3 text-[18px] font-semibold tracking-tight text-white">Quick Actions</h2>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {QUICK_ACTIONS.map((a) => (
        <Link
          key={a.label}
          to={a.to}
          className={`group flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${a.primary ? 'bg-white text-zinc-950 hover:bg-zinc-200' : 'bg-zinc-950/40 border border-zinc-800/70 text-zinc-300 hover:bg-zinc-800/70 hover:text-white'}`}
        >
          <span className={`shrink-0 ${a.iconClass}`}>{a.icon}</span>
          <span className="truncate text-xs font-medium">{a.label}</span>
          <span className={`ml-auto text-[11px] ${a.primary ? 'text-zinc-500' : 'text-zinc-600'} transition-colors group-hover:text-zinc-300`}>→</span>
        </Link>
      ))}
    </div>
  </section>
);

// ---------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------

const DevCommerceDashboard = () => {
  const dashState = useApi({ fetcher: () => developerApi.commerceDashboard() });
  const graphState = useApi({ fetcher: () => developerApi.commerceGraph() });
  const sessionState = useApi({ fetcher: () => developerApi.commerceSessions({ perPage: 100 }) });
  const policyState = useApi({ fetcher: () => developerApi.commercePolicy() });
  const orgState = useApi({ fetcher: () => developerApi.currentOrganization() });
  const complianceState = useApi({ fetcher: () => developerApi.commerceCompliance() });

  const busyRef = useRef(false);
  const refreshAllRef = useRef(null);
  const busy = dashState.refreshing || graphState.refreshing || sessionState.refreshing || policyState.refreshing || orgState.refreshing || complianceState.refreshing;

  const refreshAll = (background = true) => {
    dashState.refresh({ background });
    graphState.refresh({ background });
    sessionState.refresh({ background });
    policyState.refresh({ background });
    orgState.refresh({ background });
    complianceState.refresh({ background });
  };
  refreshAllRef.current = refreshAll;

  useEffect(() => { busyRef.current = busy; }, [busy]);
  const ready = !!(dashState.data || graphState.data || sessionState.data);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      if (busyRef.current || !ready) return;
      refreshAllRef.current?.(true);
    };
    const t = setInterval(poll, 30_000);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessions = sessionState.data?.sessions || [];
  const policy = policyState.data || {};
  const d = dashState.data || {};

  const daily = useMemo(() => buildDaily(sessions, 30), [sessions]);
  const spendToday = daily[daily.length - 1].spend;

  const activeCount = d.activeSessions ?? sessions.filter((s) => s.status === 'paid' || s.status === 'active').length;
  const pendingPayments = d.pendingPayments ?? sessions.filter((s) => s.status === 'awaiting_payment').length;

  const providerStats = useMemo(() => {
    const map = new Map();
    (sessions || []).forEach((s) => {
      const code = s.providerAgentId || 'other';
      if (!map.has(code)) map.set(code, { provider: code, spend: 0, jobs: 0, success: 0 });
      const p = map.get(code);
      p.jobs += 1;
      if (['paid', 'active', 'completed'].includes(s.status)) p.success += 1;
      p.spend += sessionCost(s);
    });
    return [...map.values()].sort((a, b) => b.spend - a.spend);
  }, [sessions]);

  const chartSeries = useMemo(() => {
    const byProv = new Map();
    (sessions || []).forEach((s) => {
      const code = s.providerAgentId || 'other';
      if (!byProv.has(code)) byProv.set(code, daily.map(() => 0));
      const k = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : null;
      const idx = k ? daily.findIndex((x) => x.key === k) : -1;
      if (idx >= 0) byProv.get(code)[idx] += sessionCost(s);
    });
    const ranked = [...byProv.entries()].sort((a, b) => b[1].reduce((x, v) => x + v, 0) - a[1].reduce((x, v) => x + v, 0));
    const top = ranked.slice(0, 4);
    if (ranked.length > 4) {
      const rest = daily.map(() => 0);
      ranked.slice(4).forEach(([, arr]) => arr.forEach((v, i) => { rest[i] += v; }));
      top.push(['other', rest]);
    }
    return top.map(([key, arr], i) => ({ key, label: key, points: arr, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }, [sessions, daily]);

  const monthlySavings = Number(d.monthlySavingsBOT ?? 0);
  const monthSpend = Number(d.monthlySpendBOT ?? 0) || chartSeries.reduce((s, p) => s + p.points.reduce((a, v) => a + v, 0), 0);
  const budgetNum = Number(policy.maxBudgetBOT || 0);
  const budgetPct = budgetNum > 0 ? Math.min(Math.round((monthSpend / budgetNum) * 100), 100) : null;
  const budgetRemaining = budgetNum > 0 ? Math.max(budgetNum - monthSpend, 0) : null;

  const lastSync = useMemo(() => {
    const times = sessions
      .map((s) => s.updatedAt || s.createdAt)
      .filter(Boolean)
      .map((x) => new Date(x).getTime());
    if (!times.length) return null;
    return new Date(Math.max(...times)).toISOString();
  }, [sessions]);

  const insights = useMemo(() => {
    const out = [];
    if (budgetNum > 0) {
      if (budgetPct >= 90) out.push({ icon: <FiAlertTriangle size={13} />, iconClass: 'text-amber-400', text: 'Budget near cap.', tag: 'Budget', to: '/developer/commerce/policy' });
      else if (budgetPct >= 60) out.push({ icon: <FiActivity size={13} />, iconClass: 'text-sky-400', text: `${budgetPct}% of monthly budget used.`, tag: 'Budget', to: '/developer/commerce/policy' });
      else out.push({ icon: <FiCheckCircle size={13} />, iconClass: 'text-emerald-400', text: 'Budget healthy.', tag: 'Budget', to: '/developer/commerce/policy' });
    } else {
      out.push({ icon: <FiShield size={13} />, iconClass: 'text-zinc-400', text: 'No budget cap set.', tag: 'Budget', to: '/developer/commerce/policy' });
    }
    out.push(pendingPayments > 0
      ? { icon: <FiClock size={13} />, iconClass: 'text-amber-400', text: `${pendingPayments} purchase(s) awaiting payment.`, tag: 'Payment', to: '/developer/commerce/sessions' }
      : { icon: <FiCheckCircle size={13} />, iconClass: 'text-emerald-400', text: 'No payments pending.', tag: 'Payment', to: '/developer/commerce/sessions' });
    out.push(providerStats.length
      ? { icon: <FiCpu size={13} />, iconClass: 'text-violet-400', text: `${shortId(providerStats[0].provider)} · best available.`, tag: 'Providers', to: '/developer/marketplace' }
      : { icon: <FiAward size={13} />, iconClass: 'text-zinc-400', text: 'No services discovered yet.', tag: 'Providers', to: '/developer/commerce/recommendations' });
    out.push(monthlySavings > 0
      ? { icon: <FiAward size={13} />, iconClass: 'text-emerald-400', text: `Est. ${fmtBOT(monthlySavings, 1)}/mo potential savings.`, tag: 'Savings', to: '/developer/commerce/recommendations' }
      : { icon: <FiZap size={13} />, iconClass: 'text-zinc-400', text: 'No savings tracked yet.', tag: 'Savings', to: '/developer/commerce/recommendations' });
    return out.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetNum, budgetPct, pendingPayments, providerStats, monthlySavings]);

  if (dashState.loading && !dashState.data) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-80" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (dashState.error && !dashState.data) return <ErrorBanner message={dashState.error.message} onRetry={() => refreshAll(false)} setupRequired={dashState.error.setupRequired} />;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <Header onRefresh={() => refreshAll(true)} busy={busy} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi to="/developer/commerce/sessions" icon={<FiActivity size={15} />} iconColor="text-emerald-400" value={activeCount} label="Active Purchases" caption="paid · credits granted" />
        <Kpi to="/developer/commerce/sessions" icon={<FiClock size={15} />} iconColor="text-amber-400" value={pendingPayments} label="Awaiting Payment" caption="confirm payment" />
        <Kpi to="/developer/marketplace/invoices" icon={<FiDollarSign size={15} />} iconColor="text-blue-400" value={fmtMoney(spendToday)} label="Today's Spend" caption={`${fmtMoney(monthSpend)} USDC this month`} />
        <Kpi to="/developer/commerce/policy" icon={<FiShield size={15} />} iconColor="text-sky-400" value={budgetRemaining !== null ? fmtMoney(budgetRemaining) : '—'} label="Budget Remaining" caption={budgetNum > 0 ? `of ${fmtMoney(budgetNum)} USDC cap` : 'no cap set'} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 lg:col-span-8 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold tracking-tight text-white">Recent Purchase Activity</h2>
            <Link to="/developer/commerce/sessions" className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition-colors hover:text-white">
              View all <FiExternalLink size={11} />
            </Link>
          </div>
          <ActivityFeed sessions={sessions} />
        </section>

        <section className="col-span-12 lg:col-span-4 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold tracking-tight text-white">AI Insights</h2>
            <FiZap size={13} className="text-violet-400" />
          </div>
          <div className="divide-y divide-zinc-800/60">
            {insights.map((ins) => <InsightRow key={ins.tag + ins.text} {...ins} />)}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 lg:col-span-8 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold tracking-tight text-white">Monthly Spend</h2>
            <span className="text-[11px] uppercase tracking-wider text-zinc-600">last 30 days</span>
          </div>
          <SpendChart series={chartSeries} total={monthSpend} labels={daily.map((x) => x.key)} />
        </section>

        <section className="col-span-12 lg:col-span-4 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-4">
          <h2 className="mb-2 text-[18px] font-semibold tracking-tight text-white">Budget Usage</h2>
          <BudgetUsage budgetNum={budgetNum} spend={monthSpend} pct={budgetPct ?? 0} />
        </section>
      </div>

      <QuickActions />
    </div>
  );
};

export default DevCommerceDashboard;