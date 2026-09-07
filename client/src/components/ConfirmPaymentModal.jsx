import React, { useEffect, useState } from "react";
import { FiShield, FiX, FiCheckCircle } from "react-icons/fi";
import { fetchLiveBotPrice } from "../utils/api";

/**
 * Confirmation overlay for the Internal Vault (MPC) rail. Mirrors the explicit
 * sign-approval popup an external wallet (MetaMask/OKX) shows, so the user
 * confirms the exact transaction before it is signed and broadcast.
 */
const ConfirmPaymentModal = ({
  isOpen,
  to,
  amountETH,
  memo,
  network = "Arc Testnet (5042002)",
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const [price, setPrice] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchLiveBotPrice().then((p) => { if (p > 0) setPrice(p); }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const usdValue = price > 0 ? Number(amountETH) * price : null;
  const usdStr = usdValue != null
    ? (usdValue >= 1 ? `$${usdValue.toFixed(2)}` : `$${usdValue.toFixed(6)}`)
    : null;

  const Row = ({ label, children, mono }) => (
    <div className="flex justify-between items-center gap-3 py-1.5">
      <span className="text-zinc-400 text-[11px] font-semibold uppercase tracking-wider shrink-0">{label}</span>
      <span className={`text-zinc-100 font-bold text-xs text-right break-all ${mono ? "font-mono" : ""}`}>{children}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#0c0c0c] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Confirm Payment</p>
            {!loading && (
              <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300" aria-label="Cancel confirmation">
                <FiX size={18} />
              </button>
            )}
          </div>
          <p className="text-zinc-200 font-bold text-sm mt-0.5">Internal Vault Sign Request</p>

          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-1 text-xs">
            <Row label="To" mono>{to}</Row>
            <div className="flex justify-between items-center gap-3 py-1.5">
              <span className="text-zinc-400 text-[11px] font-semibold uppercase tracking-wider shrink-0">Amount</span>
              <span className="text-amber-400 font-black text-sm text-right">
                {Number(amountETH).toFixed(4)} USDC
                {usdStr && (
                  <span className="block text-zinc-400 font-semibold text-[10px]">≈ {usdStr} USD</span>
                )}
              </span>
            </div>
            <Row label="Network" mono>{network}</Row>
            {memo ? <Row label="Memo">{memo}</Row> : null}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800/80 space-y-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black uppercase tracking-wider transition-all border ${
              loading
                ? "bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-400 text-zinc-950 border-amber-400/30 shadow-lg"
            }`}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />
            ) : (
              <><FiCheckCircle size={15} /> Confirm &amp; Send</>
            )}
          </button>
          {!loading && (
            <button
              onClick={onCancel}
              className="w-full py-2.5 rounded-2xl text-xs font-bold text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              Cancel
            </button>
          )}
          <p className="text-center text-[10px] text-zinc-600 flex items-center justify-center gap-1">
            <FiShield size={11} /> Signed by the MPC platform wallet; keys never leave the vault
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfirmPaymentModal;