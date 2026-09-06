import React from 'react';
import { FiAlertTriangle, FiInfo } from 'react-icons/fi';

/**
 * UsageMeter — a progress bar showing current usage against a plan limit.
 * Shows warnings when approaching limits.
 */
const UsageMeter = ({ label, current, limit, suffix = '', color = 'bg-emerald-500', onUpgrade }) => {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : current > 0 ? 100 : 0;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : color;
  const pctLabel = limit && limit > 0 ? pct : null;
  const isWarning = pct >= 70 && pct < 90;
  const isDanger = pct >= 90;
  const isLimit = limit && current >= limit;

  const getWarningMessage = () => {
    if (isLimit) return `You've reached your ${label.toLowerCase()} limit. Upgrade to continue.`;
    if (isDanger) return `Warning: ${100 - pct}% ${label.toLowerCase()} remaining.Upgrade now to avoid interruptions.`;
    if (isWarning) return `Heads up: You've used ${pct}% of your ${label.toLowerCase()}.`;
    return null;
  };

  const warningMsg = getWarningMessage();

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300 font-medium">
          {current.toLocaleString()}
          {limit && limit > 0 ? ` / ${limit.toLocaleString()}` : ''} {suffix}
          {limit && limit > 0 && ` (${pct}%)`}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-zinc-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin="0"
        aria-valuemax={limit || undefined}
        aria-valuetext={pctLabel != null ? `${pctLabel}% used` : undefined}
        aria-label={label}
      >
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {warningMsg && (
        <div className={`flex items-center gap-2 mt-2 text-xs ${isDanger || isLimit ? 'text-red-400' : 'text-amber-400'}`}>
          {isDanger || isLimit ? <FiAlertTriangle size={12} /> : <FiInfo size={12} />}
          <span>{warningMsg}</span>
          {(isDanger || isLimit) && onUpgrade && (
            <button onClick={onUpgrade} className="text-blue-400 hover:text-blue-300 underline ml-1">
              Upgrade Now
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default UsageMeter;
