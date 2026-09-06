import React, { createElement } from 'react';
import { Link } from 'react-router-dom';

const ActionButton = ({ action }) => {
  const cls = action.variant === 'secondary'
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800'
    : 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500';
  const inner = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  return action.href ? (
    <Link to={action.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={action.onClick} className={cls}>
      {inner}
    </button>
  );
};

/**
 * EmptyState — centered empty/onboarding state.
 * Supports one primary action + optional secondary action, and an optional
 * list of benefit bullets. Legacy props (action/actionLabel/actionHref/onAction)
 * continue to work.
 */
const EmptyState = ({
  icon,
  title,
  description,
  action,
  actionLabel,
  actionHref,
  onAction,
  primary,
  secondary,
  benefits,
  compact = false
}) => (
  <div className={`flex flex-col items-center justify-center text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl max-w-md mx-auto w-full ${compact ? 'py-8 px-4' : 'py-12 px-6'}`}>
    {icon && (
      <div className="text-zinc-500 mb-3">
        {typeof icon === 'function' ? createElement(icon, { size: compact ? 20 : 28 }) : icon}
      </div>
    )}
    <h3 className="font-semibold text-zinc-200 text-sm md:text-base">{title}</h3>
    {description && <p className="text-sm text-zinc-400 mt-1 max-w-sm">{description}</p>}

    {benefits && benefits.length > 0 && (
      <ul className="mt-4 text-left text-xs text-zinc-400 space-y-1.5">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    )}

    {(primary || action || actionLabel) && (
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {primary ? (
          <ActionButton action={primary} />
        ) : action ? (
          createElement(action, {})
        ) : actionHref ? (
          <Link to={actionHref} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500">
            {actionLabel}
          </Link>
        ) : onAction ? (
          <button type="button" onClick={onAction} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500">
            {actionLabel}
          </button>
        ) : (
          <span className="text-xs text-zinc-400">{actionLabel}</span>
        )}
        {secondary && <ActionButton action={secondary} />}
      </div>
    )}
  </div>
);

export default EmptyState;
