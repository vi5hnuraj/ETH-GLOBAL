import React from 'react';

const STATE_STYLES = {
  done: {
    dot: 'bg-emerald-500',
    ring: 'border-emerald-500/40',
    text: 'text-zinc-200',
    sub: 'text-zinc-500',
    connector: 'bg-emerald-500/30'
  },
  active: {
    dot: 'bg-blue-500 animate-pulse',
    ring: 'border-blue-500/60',
    text: 'text-white',
    sub: 'text-blue-300',
    connector: 'bg-zinc-700'
  },
  pending: {
    dot: 'bg-zinc-600',
    ring: 'border-zinc-700',
    text: 'text-zinc-400',
    sub: 'text-zinc-600',
    connector: 'bg-zinc-800'
  },
  skipped: {
    dot: 'bg-zinc-700',
    ring: 'border-zinc-800',
    text: 'text-zinc-500 line-through',
    sub: 'text-zinc-600',
    connector: 'bg-zinc-800'
  }
};

/**
 * Timeline — vertical step timeline.
 * steps: [{ label, description, time, state: 'done'|'active'|'pending'|'skipped' }]
 */
const Timeline = ({ steps = [], className = '', compact = false }) => (
  <ol className={`space-y-0 ${className}`}>
    {steps.map((step, i) => {
      const st = STATE_STYLES[step.state] || STATE_STYLES.pending;
      const last = i === steps.length - 1;
      return (
        <li key={`${step.label}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span aria-hidden="true" className={`h-3 w-3 rounded-full border-2 ${st.dot} ${st.ring} shrink-0 mt-0.5`} />
            {!last && <span className={`w-px flex-1 my-1 ${st.connector} ${compact ? 'min-h-6' : 'min-h-8'}`} />}
          </div>
          <div className="min-w-0 pb-1">
            <p className={`text-sm font-medium ${st.text}`} aria-current={step.state === 'active' ? 'step' : undefined}>
              {step.label}
              {step.time && <span className="ml-2 text-[11px] font-normal text-zinc-500">{step.time}</span>}
            </p>
            {step.description && <p className={`text-xs mt-0.5 ${st.sub}`}>{step.description}</p>}
          </div>
        </li>
      );
    })}
  </ol>
);

export default Timeline;
