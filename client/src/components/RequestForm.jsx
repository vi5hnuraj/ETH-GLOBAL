import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api, { fetchLiveBotPrice } from '../utils/api';
import { FiSend, FiUser, FiDollarSign, FiZap } from 'react-icons/fi';

const RequestForm = () => {
  const [formData, setFormData] = useState({
    receiver: '',
    amount: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = localStorage.getItem("token");

  // USD Currency State
  const [currencyCode] = useState("USD");
  const [currencySymbol] = useState("$");
  const [botPrice, setBotPrice] = useState(null);

  // 🔹 Fetch Live ETH Price from Coinstore ETHUSDT Ticker
  useEffect(() => {
    const updateBotPrice = () => {
      fetchLiveBotPrice().then(price => {
        if (price > 0) setBotPrice(price);
      });
    };
    updateBotPrice();
    const interval = setInterval(updateBotPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  const targetUSD = formData.amount ? Number(formData.amount) : 0;
  const botEquivalent = targetUSD > 0 && botPrice > 0 ? (targetUSD / botPrice).toFixed(4) : "0.0000";

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.receiver || !formData.amount || Number(formData.amount) <= 0) {
      toast.error('Please enter valid receiver details and amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post(`/money-transfer/money-requested`, {
        ...formData,
        currency: "USD",
      });
      toast.success('Invoice sent securely!');
      setFormData({ receiver: '', amount: '' });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to send request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative bg-[#0c0c0c]/80 backdrop-blur-xl border border-zinc-800/60 rounded-[2rem] p-5 sm:p-8 shadow-2xl overflow-hidden group max-w-xl mx-auto">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-700 pointer-events-none" />

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">Request Money</h3>
            <p className="text-zinc-500 text-[11px] sm:text-xs mt-0.5 font-medium">Create a secure USD invoice</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <FiZap size={18} />
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest ml-1">Customer PayTag</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <FiUser className="text-zinc-500" />
              </div>
              <input
                type="text"
                name="receiver"
                value={formData.receiver}
                onChange={handleChange}
                className="w-full pl-11 pr-4 py-4 bg-zinc-900/50 border border-zinc-800 outline-none rounded-2xl text-white placeholder-zinc-600 focus:border-blue-500/50 focus:bg-zinc-900 transition-all"
                placeholder="@customer_tag"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest ml-1">Requested Amount (USD)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-zinc-500 font-bold">$</span>
              </div>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className="w-full pl-11 pr-4 py-4 bg-zinc-900/50 border border-zinc-800 outline-none rounded-2xl text-white font-medium text-lg placeholder-zinc-600 focus:border-blue-500/50 focus:bg-zinc-900 transition-all"
                placeholder="0.00"
              />
            </div>

            {/* Crypto Auto-Conversion Display */}
            <div className="flex items-center justify-between px-2 pt-2">
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Customer Pays (Web3)</p>
              <div className="flex items-center gap-1.5 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                <p className="text-blue-400 text-[11px] font-black tracking-tight">≈ {botEquivalent} USDC</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !formData.amount || !formData.receiver}
            className={`w-full py-4 mt-2 rounded-2xl font-black text-sm uppercase tracking-widest text-white shadow-2xl transition-all flex items-center justify-center gap-2 group ${isSubmitting || !formData.amount || !formData.receiver
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 hover:scale-[1.02] border border-blue-400/30'
              }`}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Generate Invoice
                <FiSend size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RequestForm;
