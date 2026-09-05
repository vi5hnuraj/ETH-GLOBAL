import React, { useState } from 'react';
import { FiSend, FiUser, FiArrowRight, FiCreditCard } from 'react-icons/fi';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import { getMpcAccount, mpcChain } from "../../utils/mpcWallet";
import { ethers } from "ethers";
import ConfirmPaymentModal from "../ConfirmPaymentModal";

const TransactionForm = ({ onTransactionSuccess, userData }) => {
  const [formData, setFormData] = useState({
    senderUPI: userData?.globalPayTag || userData?.internalWalletAddress || '',
    receiverUPI: '',
    amount: '',
    network: 'base-sepolia'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.receiverUPI || !formData.amount) {
      toast.error('Please fill in all fields');
      return;
    }

    const cleanRecipient = formData.receiverUPI.replace(/^@/, '').trim().toLowerCase();
    const cleanSender = (userData?.globalPayTag || '').replace(/^@/, '').trim().toLowerCase();
    if (cleanRecipient && cleanSender && cleanRecipient === cleanSender) {
      toast.error("You cannot send money to yourself.");
      return;
    }

    const amtVal = Number(formData.amount);
    const ethBalance = Number(userData?.bankDetails?.usdcBalance || 0);

    if (amtVal <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    if (amtVal > ethBalance) {
      toast.error(`Insufficient balance. Your available ETH balance is ${ethBalance.toFixed(4)} ETH.`);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Resolving receiver and connecting to MPC Wallet...");

    try {
      // 1. Resolve receiver target wallet address
      const lookupUPI = formData.receiverUPI.replace(/^@/, '').trim();
      const lookupRes = await api.get(`/auth/fetchdetail?upi=${lookupUPI}`);
      const receiver = lookupRes.data;

      if (!receiver) {
        throw new Error("Receiver not found.");
      }

      const targetDestination = receiver.receiverWalletAddress || receiver.internalWalletAddress;

      if (!targetDestination) {
        throw new Error("Receiver does not have a valid receiving wallet address.");
      }

      // 2. Connect MPC account EOA
      const account = getMpcAccount();
      if (!account) {
        throw new Error("Internal MPC Wallet not connected yet. Please try again or refresh the page.");
      }

      const amtVal = Number(formData.amount);
      const tokenValueBig = BigInt(ethers.utils.parseUnits(amtVal.toFixed(18), 18).toString());

      // Ask for explicit sign-approval before broadcasting — same guarantee an
      // external wallet (MetaMask/OKX) popup provides on the other rail.
      setPendingConfirm({
        to: targetDestination,
        amount: amtVal,
        memo: `Transfer to ${cleanRecipient || targetDestination.slice(0, 6)}…`,
        tokenValueBig
      });
      setIsSubmitting(false);
      toast.dismiss(toastId);
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(err.response?.data?.message || err.message || 'Failed to send transaction');
      setIsSubmitting(false);
    }
  };

  const performInternalSend = async (confirm) => {
    const account = getMpcAccount();
    if (!account) {
      toast.error("Internal MPC Wallet not connected yet. Please try again or refresh the page.");
      setPendingConfirm(null);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Signing & broadcasting transaction from MPC Wallet...");
    try {
      const txResult = await account.sendTransaction({
        to: confirm.to,
        value: confirm.tokenValueBig
      });

      const txHash = txResult.transactionHash;

      toast.loading("Recording transaction log on GlobalPay...", { id: toastId });

      const response = await api.post(`/money-transfer/create`, {
        ...formData,
        senderUPI: userData?.globalPayTag || userData?.internalWalletAddress || formData.senderUPI,
        network: 'base-sepolia',
        senderWalletType: 'internal',
        txHash: txHash
      });

      toast.dismiss(toastId);
      toast.success('Transfer successful!');
      setPendingConfirm(null);
      if (onTransactionSuccess) onTransactionSuccess();
      setFormData({
        senderUPI: userData?.globalPayTag || userData?.internalWalletAddress || '',
        receiverUPI: '',
        amount: '',
        network: 'base-sepolia'
      });
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(err.response?.data?.message || err.message || 'Failed to send transaction');
      setPendingConfirm(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ethBalance = Number(userData?.bankDetails?.usdcBalance || 0);

  return (
    <div className="bg-zinc-900 border-zinc-800 border-[1px] p-5 sm:p-8 rounded-2xl flex-1 shadow-2xl transition-all duration-300">

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Quick Transfer</h2>
          <p className="text-zinc-500 text-sm mt-1">Send ETH instantly using GlobalPay Tag or Wallet Address</p>
        </div>
        <div className="bg-amber-500/10 p-3 rounded-xl text-amber-500">
          <FiSend size={24} />
        </div>
      </div>

      <div className="mb-8 p-4 bg-amber-950/20 border-amber-800/40 border rounded-xl flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <FiCreditCard size={18} />
          </div>
          <div>
            <p className="text-xs text-amber-400/80 uppercase font-bold tracking-wider">Available ETH Balance</p>
            <p className="text-xl font-bold text-white">{ethBalance.toFixed(4)} ETH</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-amber-400 font-medium">Blockchain</p>
          <p className="text-xs text-amber-200">Native ETH</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="senderUPI" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">Your GlobalPay Tag / Address</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-600">
              <FiUser size={18} />
            </div>
            <input
              type="text"
              id="senderUPI"
              name="senderUPI"
              value={userData?.globalPayTag || userData?.internalWalletAddress || formData.senderUPI}
              readOnly
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-800/30 border border-zinc-700 text-amber-400 focus:outline-none cursor-not-allowed text-sm font-mono font-bold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="receiverUPI" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">Receiver's Pay Tag or Wallet Address</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-amber-500 transition-colors">
              <FiArrowRight size={18} />
            </div>
            <input
              type="text"
              id="receiverUPI"
              name="receiverUPI"
              value={formData.receiverUPI}
              onChange={handleChange}
              autoComplete="off"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm"
              placeholder="recipient@paytag or 0x..."
            />
          </div>
        </div>

        <div>
          <label htmlFor="amount" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">Amount to Transfer (ETH)</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-amber-400 font-bold text-sm">
              ⚡
            </div>
            <input
              type="number"
              id="amount"
              name="amount"
              step="any"
              value={formData.amount}
              onChange={handleChange}
              className="w-full pl-8 pr-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-lg font-bold"
              placeholder="0.00"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-4 rounded-xl font-bold text-zinc-950 shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${isSubmitting
            ? 'bg-zinc-700 cursor-not-allowed text-white'
            : 'bg-amber-500 hover:bg-amber-400 hover:shadow-amber-500/20'
            }`}
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
          ) : (
            <>
              Confirm ETH Transfer
              <FiSend size={18} />
            </>
          )}
        </button>
      </form>

      {/* Internal Vault sign-approval overlay */}
      <ConfirmPaymentModal
        isOpen={Boolean(pendingConfirm)}
        to={pendingConfirm?.to || ""}
        amountETH={pendingConfirm?.amount || 0}
        memo={pendingConfirm?.memo || ""}
        loading={isSubmitting}
        onConfirm={() => performInternalSend(pendingConfirm)}
        onCancel={() => {
          setPendingConfirm(null);
          setIsSubmitting(false);
        }}
      />
    </div>
  );
};

export default TransactionForm;