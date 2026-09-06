import React from 'react';
import { FiTrendingUp, FiTrendingDown, FiMinus } from 'react-icons/fi';

/**
 * MetricCard — headline metric with optional trend indicator.
 * trend: number | string (e.g. 12.5 or "-3"). Positive renders emerald,
 * negative renders red, zero renders neutral.
 */
const MetricCard = ({ icon, label, value, sub, accent = 'text-blue-400', trend }) => {
  const hasTrend = trend !== undefined && trend !== null && trend !== '';
  const num = Number(trend);
  const up = hasTrend && !Number.isNaN(num) && num > 0;
  const down = hasTrend && !Number.isNaN(num) && num < 0;
  const TrendIcon = up ? FiTrendingUp : down ? FiTrendingDown : FiMinus;
  const trendColor = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-zinc-500';
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-1">
      <div className={`${accent} mb-2`}>{icon}</div>
      <p className="text-2xl font-black text-white leading-tight">{value}</p>
      <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{label}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-1">{sub}</p>}
      {hasTrend && (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold mt-1 ${trendColor}`}>
          <TrendIcon size={12} /> {Number.isNaN(num) ? trend : `${trend}%`}
        </span>
      )}
    </div>
  );
};

export default MetricCard;
