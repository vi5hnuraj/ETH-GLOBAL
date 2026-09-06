import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiZap } from 'react-icons/fi';

/**
 * CommandKit — reusable building blocks for the Autonomous Commerce command
 * center. Presentation-only components; data logic lives in the pages.
 */

export const TONES = {
  blue: 'from-blue-500/25 to-blue-500/5 text-blue-300 border-blue-500/20',
  emerald: 'from-emerald-500/25 to-emerald-500/5 text-emerald-300 border-emerald-500/20',
  amber: 'from-amber-500/25 to-amber-500/5 text-amber-300 border-amber-500/20',
  violet: 'from-violet-500/25 to-violet-500/5 text-violet-300 border-violet-500/20',
  rose: 'from-rose-500/25 to-rose-500/5 text-rose-300 border-rose-500/20',
  sky: 'from-sky-500/25 to-sky-500/5 text-sky-300 border-sky-500/20',
  zinc: 'from-zinc-500/25 to-zinc-500/5 text-zinc-300 border-zinc-500/20',
  cyan: 'from-cyan-500/25 to-cyan-500/5 text-cyan-300 border-cyan-500/20'
};

export const SectionHeader = ({ label, right }) => (
  <div className="flex items-center justify-between gap-3 mb-3">
    <h2 className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500">
      <span className="h-3.5 w-[3px] rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
      {label}
    </h2>
    {right && <div className="flex items-center gap-2">{right}</div>}
  </div>
);

export const DashboardCard = ({ title, description, tone = 'zinc', icon, right, bodyClassName = '', className = '', children }) => (
  <section className={`relative flex flex-col bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/70 rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 hover:border-zinc-700/70 hover:bg-zinc-900/60 hover:shadow-xl hover:shadow-black/30 ${className}`}>
    {(title || description || right) && (
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-8 w-8 shrink-0 rounded-xl border bg-gradient-to-br flex items-center justify-center ${TONES[tone] || TONES.blue}`}>
            {icon || <FiZap size={14} />}
          </span>
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold text-white tracking-tight leading-snug">{title}</h3>}
            {description && <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{description}</p>}
          </div>
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </header>
    )}
    <div className={`flex-1 min-w-0 ${bodyClassName}`}>{children}</div>
  </section>
);

const useCountUp = (value) => {
  const [display, setDisplay] = useState(Number(value || 0));
  const from = useRef(Number(value || 0));
  useEffect(() => {
    const target = Number(value || 0);
    const startFrom = from.current;
    if (startFrom === target) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      from.current = target;
      setDisplay(target);
      return undefined;
    }
    const t0 = performance.now();
    const dur = 700;
    let raf;
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(startFrom + (target - startFrom) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
};

const fmtCompact = (v) => {
  const n = Number(v || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export const MetricCard = ({
  number, label, desc, icon, tone = 'blue', format = 'int',
  bar = null, to, sub
}) => {
  const anim = useCountUp(number);
  const display = format === 'money' ? fmtCompact(anim) : `${Math.round(anim).toLocaleString('en-US')}`;
  const barColor = {
    blue: 'from-blue-500 to-violet-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    violet: 'from-violet-500 to-fuchsia-500',
    sky: 'from-sky-500 to-blue-500',
    rose: 'from-rose-500 to-red-500'
  }[tone] || 'from-blue-500 to-violet-500';
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={`h-9 w-9 shrink-0 rounded-xl border border-zinc-700/70 bg-gradient-to-br flex items-center justify-center ${TONES[tone] || TONES.blue}`}>{icon}</span>
        {sub && <span className="text-[10px] text-zinc-600 whitespace-nowrap">{sub}</span>}
      </div>
      <p className="text-[28px] font-black text-white leading-none tracking-tight tabular-nums">{display}</p>
      <p className="text-xs font-semibold text-zinc-300 mt-2">{label}</p>
      {desc && <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug min-h-[28px]">{desc}</p>}
      <div className="mt-3 h-0.5 rounded-full bg-zinc-800/80 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ${barColor}`} style={{ width: bar === null ? '100%' : `${Math.max(Math.min(bar, 100), 0)}%` }} />
      </div>
    </>
  );
  const cls = 'group/kpi flex flex-col bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/70 rounded-2xl p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 hover:border-zinc-700/80 hover:bg-zinc-900/60 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30';
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
};

export const QuickActionCard = ({ icon, title, desc, to, tone = 'zinc' }) => (
  <Link to={to} className="group/qa flex flex-col gap-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/70 hover:shadow-lg hover:shadow-black/40">
    <div className="flex items-center justify-between">
      <span className={`h-8 w-8 rounded-lg border bg-gradient-to-br flex items-center justify-center ${TONES[tone] || TONES.blue}`}>{icon}</span>
      <FiArrowRight size={14} className="text-zinc-600 transition-all group-hover/qa:text-white group-hover/qa:translate-x-0.5" />
    </div>
    <div>
      <p className="text-xs font-semibold text-white leading-snug">{title}</p>
      {desc && <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{desc}</p>}
    </div>
  </Link>
);

export const WorkflowCard = ({ icon, tone = 'zinc', title, status, statusTone = 'emerald', sub, to }) => {
  const statusCls = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    zinc: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
  }[statusTone] || 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  const inner = (
    <div className="group/wf flex h-full flex-col gap-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/70 hover:shadow-lg hover:shadow-black/40">
      <div className="flex items-center justify-between">
        <span className={`h-8 w-8 rounded-lg border bg-gradient-to-br flex items-center justify-center ${TONES[tone] || TONES.blue}`}>{icon}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold ${statusCls}`}>{status}</span>
      </div>
      <p className="text-xs font-semibold text-white leading-snug">{title}</p>
      {sub && <p className="text-[10px] text-zinc-500 leading-snug mt-auto pt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to} className="flex h-full">{inner}</Link> : <div className="flex h-full">{inner}</div>;
};

export const InsightCard = ({ icon, tone = 'sky', text, tag, to, urgency }) => {
  const border = urgency === 'warning'
    ? 'border-amber-500/25 hover:border-amber-500/40'
    : urgency === 'action'
      ? 'border-violet-500/25 hover:border-violet-500/40'
      : 'border-zinc-800 hover:border-zinc-700';
  const inner = (
    <div className={`flex items-start gap-2.5 rounded-xl border bg-zinc-950/40 px-3 py-2.5 transition-colors ${border}`}>
      <span className={`mt-0.5 shrink-0 h-6 w-6 rounded-full border flex items-center justify-center ${TONES[tone] || TONES.sky}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-zinc-300 leading-relaxed">{text}</p>
        {tag && <span className="text-[9px] uppercase tracking-wider font-semibold mt-1.5 inline-block text-zinc-500">{tag}</span>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
};

export const ChartContainer = ({ title, description, tone = 'blue', right, className = '', children }) => (
  <DashboardCard title={title} description={description} tone={tone} icon={null} right={right} bodyClassName="pt-1" className={className}>
    {children}
  </DashboardCard>
);