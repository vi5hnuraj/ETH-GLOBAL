import React, { useRef, useEffect, useState } from 'react';
import { FiMoreHorizontal } from 'react-icons/fi';

/**
 * OverflowMenu — compact actions dropdown. Renders inside a relative parent.
 * `items`: [{ label, icon, onClick, danger }].
 */
export const OverflowMenu = ({ open, onToggle, onClose, items = [], align = 'right' }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Card actions"
        className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <FiMoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-hidden="true" />
          <div
            role="menu"
            className={`absolute top-8 z-40 w-48 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40 py-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`}
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onClose(); item.onClick(); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors ${
                  item.danger ? 'text-red-400 hover:text-red-300 hover:bg-red-950/40' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {item.icon && <item.icon size={14} />}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

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

/**
 * CommerceCard — glass card with icon chip, title, description and an optional
 * overflow menu. Pure presentation; no data logic.
 */
const CommerceCard = ({
  icon, tone = 'blue', title, description, menu = [],
  children, className = '', bodyClassName = ''
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`group/card relative flex flex-col bg-zinc-900/45 backdrop-blur-sm border border-zinc-800/80 rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 hover:border-zinc-700/80 hover:bg-zinc-900/70 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 ${className}`}>
      {(title || icon || menu.length > 0) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <span className={`h-9 w-9 shrink-0 rounded-xl border bg-gradient-to-br from-to flex items-center justify-center ${TONES[tone] || TONES.blue}`}>
                {icon}
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              {title && <h3 className="text-[13px] font-semibold text-white tracking-tight leading-snug">{title}</h3>}
              {description && <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{description}</p>}
            </div>
          </div>
          {menu.length > 0 && (
            <div className="shrink-0 -mt-1 -mr-1">
              <OverflowMenu open={open} onToggle={() => setOpen((v) => !v)} onClose={() => setOpen(false)} items={menu} />
            </div>
          )}
        </header>
      )}
      <div className={`flex-1 min-w-0 ${bodyClassName}`}>{children}</div>
    </div>
  );
};

export default CommerceCard;