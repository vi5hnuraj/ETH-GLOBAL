import React, { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';

const CopyButton = ({ text, label = 'Copy', className = '', onCopy }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy && onCopy();
    } catch { /* clipboard unavailable */ }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${copied ? 'text-emerald-400 border-emerald-700 bg-emerald-900/30' : 'text-zinc-400 border-zinc-700 bg-zinc-800/60 hover:text-white hover:border-zinc-500'} ${className}`}
      title={label}
      aria-label={label || 'Copy'}
    >
      {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
      {copied ? 'Copied' : label || 'Copy'}
    </button>
  );
};

export default CopyButton;