import React from 'react';

/**
 * Skeleton — animated placeholder block for loading states.
 * Shape via className (e.g. "h-4 w-full rounded").
 */
const Skeleton = ({ className = 'h-4 w-full rounded', lines = 1, as: Tag = 'div' }) => {
  if (lines > 1) {
    const hasWidth = /\bw-/.test(className);
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse bg-zinc-800/80 ${className} ${i === lines - 1 && !hasWidth ? 'w-3/4' : ''}`}
          />
        ))}
      </div>
    );
  }
  return <Tag className={`animate-pulse bg-zinc-800/80 ${className}`} />;
};

export default Skeleton;
