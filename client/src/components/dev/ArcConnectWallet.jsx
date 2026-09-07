import React from 'react';

/**
 * Arc positioning banner for the developer console.
 * External wallet connection belongs on payment-specific screens, not here.
 */
export const ArcConnectWallet = () => (
  <div className="mb-6 overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-zinc-900/80 to-blue-950/30 shadow-lg shadow-cyan-950/20">
    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300" aria-hidden="true">
          <span className="text-lg">⚡</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 text-sm font-semibold text-white">Arc settlement layer</p>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              Active
            </span>
          </div>
          <p className="m-0 mt-1 text-xs text-zinc-400">
            USDC-native payments for autonomous agents
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-white/5 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <div>
          <p className="m-0 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Network</p>
          <p className="m-0 mt-1 text-xs font-medium text-zinc-200">Arc Testnet</p>
        </div>
        <div className="h-7 w-px bg-white/10" />
        <div>
          <p className="m-0 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Gas asset</p>
          <p className="m-0 mt-1 text-xs font-medium text-cyan-300">USDC</p>
        </div>
        <div className="h-7 w-px bg-white/10" />
        <div>
          <p className="m-0 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Chain ID</p>
          <p className="m-0 mt-1 font-mono text-xs font-medium text-zinc-200">5042002</p>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/5 bg-black/10 px-4 py-2.5 text-[10px] text-zinc-400 sm:px-5">
      <span><strong className="font-medium text-zinc-200">MPC wallets</strong> for agents</span>
      <span><strong className="font-medium text-zinc-200">Programmable</strong> settlement</span>
      <span><strong className="font-medium text-zinc-200">ArcScan</strong> verified</span>
    </div>
  </div>
);
