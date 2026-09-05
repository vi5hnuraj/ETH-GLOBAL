/**
 * present — shared presentation helpers for developer pages.
 * Keeps business-facing formatting in one place so raw backend IDs and
 * machine numbers never leak into primary UI.
 */

export const CATEGORY_STYLE = {
  gpu: 'from-fuchsia-500/25 to-purple-600/10 text-fuchsia-300 border-fuchsia-500/25',
  'ai-model': 'from-violet-500/25 to-indigo-600/10 text-violet-300 border-violet-500/25',
  ocr: 'from-sky-500/25 to-blue-600/10 text-sky-300 border-sky-500/25',
  storage: 'from-amber-500/25 to-yellow-600/10 text-amber-300 border-amber-500/25',
  translation: 'from-emerald-500/25 to-teal-600/10 text-emerald-300 border-emerald-500/25',
  voice: 'from-pink-500/25 to-rose-600/10 text-pink-300 border-pink-500/25',
  video: 'from-red-500/25 to-orange-600/10 text-red-300 border-red-500/25',
  compute: 'from-cyan-500/25 to-sky-600/10 text-cyan-300 border-cyan-500/25',
  api: 'from-indigo-500/25 to-blue-600/10 text-indigo-300 border-indigo-500/25',
  other: 'from-zinc-500/25 to-zinc-600/10 text-zinc-300 border-zinc-500/25'
};

export const DEFAULT_CATEGORY_STYLE = CATEGORY_STYLE.other;

export const initials = (name = '') => {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

export const fmtEth = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n < 0.001) return String(parseFloat(n.toFixed(8)));
  if (n < 1) return String(parseFloat(n.toFixed(6)));
  return String(parseFloat(n.toFixed(4)));
};

export const fmtShort = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const fmtWhen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${date} • ${time}`;
};

export const pricingLabel = (svc) => {
  if (!svc) return null;
  const price = `${fmtEth(svc.unitPriceETH || svc.unitPriceUSDC || svc.unitPrice)} USDC`;
  const unit = svc.unitLabel || 'unit';
  switch (svc.pricingModel) {
    case 'subscription': return `${price} / month`;
    case 'per_hour': return `${price} / hour`;
    case 'per_mb_day': return `${price} / MB·day`;
    case 'flat': return price;
    default: return `${price} / ${unit}`;
  }
};

export const invoiceNumber = (id) => {
  const hex = String(id || '').replace(/^in[vc]*_/i, '').replace(/[^a-f0-9]/gi, '');
  return `INV-${(hex.slice(0, 4) || String(id)).toUpperCase()}`;
};