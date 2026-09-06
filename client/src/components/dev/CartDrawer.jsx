import React, { useMemo, useState } from 'react';
import { FiX, FiTrash2, FiMinus, FiPlus, FiShoppingBag, FiExternalLink } from 'react-icons/fi';
import { useCart } from '../../context/CartContext';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const CartDrawer = ({ open, onClose }) => {
  const { items, removeItem, updateQuantity, clearCart, count, totalEstimate } = useCart();
  const agentsState = useApi({ fetcher: () => developerApi.agents({ perPage: 100 }) });
  const agents = useMemo(() => agentsState.data?.agents || [], [agentsState.data]);

  const [selectedAgent, setSelectedAgent] = useState('');
  const [buying, setBuying] = useState(false);

  if (!open) return null;

  const buyAll = async () => {
    if (!selectedAgent) return;
    setBuying(true);
    try {
      for (const item of items) {
        const isFlat = ['flat', 'subscription'].includes(item.pricingModel);
        const qty = isFlat ? 1 : (item.quantity || 1);
        await developerApi.prepaidIntent({
          serviceId: item.serviceId,
          consumerAgentId: selectedAgent,
          quantity: qty,
          reason: `Cart purchase — ${item.title}`
        });
      }
      clearCart();
      onClose();
    } catch (err) {
      // toast is handled by the caller
    } finally {
      setBuying(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FiShoppingBag size={18} className="text-blue-400" />
            <h2 className="text-base font-bold text-white">Cart</h2>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{count}</span>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1"
              >
                Clear all
              </button>
            )}
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white p-1" aria-label="Close cart">
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FiShoppingBag size={32} className="text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500 mb-1">Your cart is empty</p>
              <p className="text-xs text-zinc-600">Browse the marketplace and add services to your cart.</p>
            </div>
          ) : (
            items.map((item) => {
              const isFlat = ['flat', 'subscription'].includes(item.pricingModel);
              const lineTotal = (Number(item.unitPriceBOT || 0) * (item.quantity || 1));
              return (
                <div key={item.serviceId} className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {item.pricingModel} · {Number(item.unitPriceBOT || 0).toFixed(4)} BOT / {item.unitLabel || 'unit'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.serviceId)}
                      className="text-zinc-600 hover:text-red-400 p-1 shrink-0 transition-colors"
                      aria-label="Remove item"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>

                  {isFlat ? (
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>One-time</span>
                      <span className="font-semibold text-white">{lineTotal.toFixed(4)} BOT</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.serviceId, (item.quantity || 1) - 1)}
                          disabled={(item.quantity || 1) <= 1}
                          className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          <FiMinus size={11} />
                        </button>
                        <span className="text-xs font-mono text-white w-12 text-center">{item.quantity || 1}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.serviceId, (item.quantity || 1) + 1)}
                          className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                        >
                          <FiPlus size={11} />
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-white">{lineTotal.toFixed(4)} BOT</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Estimated total</span>
              <span className="text-lg font-black text-gradient">{totalEstimate.toFixed(4)} BOT</span>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 font-medium mb-1.5">Consumer agent (pays)</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an agent…</option>
                {agents.map((a) => (
                  <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={buyAll}
              disabled={buying || !selectedAgent}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {buying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <FiExternalLink size={14} />
                  Buy Now — {totalEstimate.toFixed(4)} BOT
                </>
              )}
            </button>

            <p className="text-[10px] text-zinc-600 text-center">
              Each service creates a separate prepaid session. Credits are granted instantly after payment confirms.
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default CartDrawer;
