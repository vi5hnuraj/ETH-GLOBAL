// client/src/components/WrongNetwork.jsx
import React, { useState } from 'react';
import { useNetwork } from '../utils/mpcWallet';
import { FiAlertTriangle, FiZap } from 'react-icons/fi';

const WrongNetwork = () => {
  const [, switchNetwork] = useNetwork();
  const [switching, setSwitching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const targetChainId = Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_BASE_CHAIN_ID || 84532);
  const targetChainName = import.meta.env.VITE_CHAIN_NAME || import.meta.env.VITE_BASE_CHAIN_NAME || "Base Sepolia";

  const handleSwitch = async () => {
    if (!switchNetwork) {
      setErrorMsg("Wallet network switcher not available. Please switch manually in MetaMask.");
      return;
    }
    setSwitching(true);
    setErrorMsg('');
    try {
      await switchNetwork(targetChainId);
    } catch (err) {
      console.error("Failed to switch network:", err);
      setErrorMsg(err.message || "Failed to switch network automatically. Please switch in MetaMask.");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 font-sans">
      <div className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-red-500/30 bg-[#0c0a0f] p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] text-center group">
        {/* Glowing Decorative background */}
        <div className="absolute -left-16 -top-16 h-32 w-32 rounded-full bg-red-500/10 blur-3xl group-hover:bg-red-500/20 transition-all duration-700"></div>
        <div className="absolute -right-16 -bottom-16 h-32 w-32 rounded-full bg-secondary/10 blur-3xl group-hover:bg-secondary/20 transition-all duration-700"></div>

        {/* Warning Icon */}
        <div className="relative z-10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10 border border-red-500/20 text-red-500 animate-bounce">
          <FiAlertTriangle size={40} />
        </div>

        {/* Header */}
        <h2 className="relative z-10 text-2xl font-black tracking-tight text-white uppercase">
          Wrong Network Detected
        </h2>
        
        {/* Description */}
        <p className="relative z-10 mt-3 text-sm font-medium text-zinc-400 leading-relaxed px-2">
          GlobalPay operates exclusively on <span className="text-white font-bold">{targetChainName}</span> to ensure zero gas-fee payments and high-speed cross-border routing.
        </p>

        {/* Network status info */}
        <div className="relative z-10 my-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 p-4 font-mono text-xs text-zinc-500 flex flex-col gap-2">
          <div className="flex justify-between">
            <span>Required Network:</span>
            <span className="text-zinc-300 font-bold">{targetChainName}</span>
          </div>
          <div className="flex justify-between">
            <span>Required Chain ID:</span>
            <span className="text-zinc-300 font-bold">{targetChainId}</span>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <p className="relative z-10 mb-4 text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 p-3 rounded-xl">
            {errorMsg}
          </p>
        )}

        {/* Action Button */}
        <button
          onClick={handleSwitch}
          disabled={switching}
          className="relative z-10 w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest text-white shadow-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-secondary hover:from-red-500 hover:to-secondary active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          {switching ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-white" />
              Switching Network...
            </>
          ) : (
            <>
              <FiZap size={18} />
              Switch to {targetChainName}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default WrongNetwork;
