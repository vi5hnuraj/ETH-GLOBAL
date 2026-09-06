import React from 'react';

const Card = ({ children, className = '', title, subtitle, action, actions, dense }) => (
  <div className={`bg-zinc-900/60 border border-zinc-800 rounded-2xl ${dense ? 'p-4' : 'p-5'} ${className}`}>
    {(title || action || actions) && (
      <div className={`flex items-center justify-between gap-3 ${dense ? 'mb-3' : 'mb-4'}`}>
        <div className="min-w-0">
          {title && <h3 className="text-[15px] font-semibold text-white">{title}</h3>}
          {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="shrink-0">{actions || action}</div>
      </div>
    )}
    {children}
  </div>
);

export default Card;