import React, { useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import CopyButton from './CopyButton';

/**
 * ApiKeyField — reveal/hide + copy for a sensitive key value.
 */
const ApiKeyField = ({ value, prefix, className = '', inputClassName = '' }) => {
  const [show, setShow] = useState(false);
  const display = show ? value : prefix || '••••••••••••••••••';

  return (
    <div className={`flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2.5 ${className}`}>
      <code className={`font-mono text-xs flex-1 truncate text-zinc-300 ${inputClassName}`}>{display}</code>
      <button type="button" onClick={() => setShow(!show)} className="text-zinc-400 hover:text-white shrink-0" aria-label={show ? 'Hide key' : 'Reveal key'} aria-pressed={show}>
        {show ? <FiEyeOff size={14} /> : <FiEye size={14} />}
      </button>
      <CopyButton text={value} label="" className="px-1.5 py-0.5" />
    </div>
  );
};

export default ApiKeyField;
