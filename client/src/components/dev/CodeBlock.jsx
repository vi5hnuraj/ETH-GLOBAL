import React from 'react';
import CopyButton from './CopyButton';

const CodeBlock = ({ title, language = 'js', code }) => (
    <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between bg-zinc-900/80 border-b border-zinc-800 px-4 py-2">
        <span className="text-xs font-mono text-zinc-400">{title}</span>
        <div className="flex items-center gap-2">
          {typeof language === 'string' && (
            <span className="text-[10px] uppercase text-zinc-500">{language}</span>
          )}
          <CopyButton text={code} label="Copy" />
        </div>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );

export default CodeBlock;