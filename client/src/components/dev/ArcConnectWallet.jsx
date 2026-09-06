import React, { useState, useEffect } from 'react';
import { appkit, arcTestnet } from '../../utils/appkit.js';

export const ArcConnectWallet = () => {
  const walletIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="cw-icon shrink-0 text-cyan-400"
      aria-hidden="true"
    >
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 1 0 0 4h3a1 1 0 0 0 1-1v-2.5" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );

  const truncateAddress = (addr) => {
    if (!addr) return '';
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  };

  const [status, setStatus] = useState('disconnected');
  const [address, setAddress] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const updateState = () => {
      const isConnected = appkit.getIsConnectedState?.() || false;
      const addr = appkit.getAddress?.() || '';
      if (isConnected && addr) {
        setStatus('connected');
        setAddress(addr);
      } else {
        setStatus('disconnected');
        setAddress('');
      }
    };

    updateState();
    const unsub = appkit.subscribeState?.(updateState);
    return () => unsub?.();
  }, []);

  const handleConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      await appkit.open();
    } catch (err) {
      if (err?.code === 4001) {
        setError('Request rejected. Try again when ready.');
      } else {
        setError('Unable to open Arc wallet modal.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await appkit.disconnect();
      setStatus('disconnected');
      setAddress('');
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (status === 'connected' && address) {
    return (
      <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-4 mb-4 backdrop-blur-md">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
            <span className="text-slate-400 text-xs font-mono">
              Arc Testnet (Chain ID: 5042002) · USDC Gas
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="text-cyan-300 text-sm font-mono flex items-center gap-1.5 hover:text-cyan-200 transition-colors bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-1 rounded-md"
              title={address}
            >
              {truncateAddress(address)}
              {copied ? (
                <span className="text-emerald-400 text-xs">Copied!</span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>
            <a
              href={`https://testnet.arcscan.app/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1"
            >
              Explorer ↗
            </a>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="text-slate-400 hover:text-rose-400 text-xs transition-colors underline bg-transparent border-0 cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4 mb-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {walletIcon}
          <div>
            <p className="text-slate-200 text-sm font-medium m-0">
              Connect to Arc Testnet
            </p>
            <p className="text-slate-400 text-xs m-0 mt-0.5">
              USDC native gas · Chain ID 5042002 · AppKit enabled
            </p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          disabled={busy}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition-all shadow-lg shadow-cyan-500/20 whitespace-nowrap cursor-pointer"
        >
          {busy ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </div>
      {error && <p className="text-rose-400 text-xs mt-2 mb-0">{error}</p>}
    </div>
  );
};
