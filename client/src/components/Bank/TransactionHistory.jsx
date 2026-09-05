import React, { useState, useCallback } from 'react';
import moment from 'moment';
import { ethers } from 'ethers';
import { FiArrowUpRight, FiArrowDownLeft, FiClock, FiActivity, FiArrowRight, FiXCircle } from 'react-icons/fi';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const TransactionHistory = ({ transactions, userData, onSuccess }) => {
  const [showAll, setShowAll] = useState(false);

  if (!transactions) return (
    <div className="flex-1 bg-[#0a0a0a] border border-zinc-800/50 rounded-3xl flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-zinc-800 rounded-full"></div>
        <p className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">Encrypting History...</p>
      </div>
    </div>
  );

  const myIds = new Set([
    String(userData?._id || '').toLowerCase(),
    String(userData?.id || '').toLowerCase(),
    String(userData?.globalPayTag || userData?.global_pay_tag || '').toLowerCase(),
    String(userData?.globalPayTag || userData?.global_pay_tag || '').replace(/^@/, '').toLowerCase(),
    (userData?.globalPayTag || userData?.global_pay_tag) ? `@${String(userData.globalPayTag || userData.global_pay_tag).replace(/^@/, '').toLowerCase()}` : null,
    String(userData?.upiId || userData?.upi_id || '').toLowerCase(),
    String(userData?.upiId || userData?.upi_id || '').replace(/^@/, '').toLowerCase(),
    String(userData?.email || '').toLowerCase(),
    String(userData?.internalWalletAddress || userData?.internal_wallet_address || '').toLowerCase(),
    String(userData?.metamaskId || userData?.metamask_id || '').toLowerCase(),
  ].filter(Boolean));

  const isSenderMe = (t) => {
    const senderObjId = typeof t.sender === 'object' ? String(t.sender?.id || t.sender?._id || '') : String(t.sender_id || t.sender || '');
    if (senderObjId && myIds.has(senderObjId.toLowerCase())) return true;
    const sUPI = String(t.senderUPI || t.sender_pay_tag || t.sender?.globalPayTag || t.sender?.upiId || '').toLowerCase();
    if (sUPI && myIds.has(sUPI)) return true;
    if (sUPI && myIds.has(sUPI.replace(/^@/, ''))) return true;
    if (sUPI && myIds.has(`@${sUPI.replace(/^@/, '')}`)) return true;
    return false;
  };

  const getMetaMaskProvider = useCallback(() => {
    if (window.ethereum?.providers) {
      return window.ethereum.providers.find(p => p.isMetaMask);
    }
    if (window.ethereum?.isMetaMask) {
      return window.ethereum;
    }
    return window.ethereum || null;
  }, []);

  const waitForTxReceipt = useCallback(async (provider, txHash, maxAttempts = 30) => {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
      if (receipt) return receipt;
    }
    throw new Error('Tx receipt not found after timeout');
  }, []);

  const handleCancel = useCallback(async (t) => {
    let meta;
    try { meta = typeof t.rawSignedTx === 'string' ? JSON.parse(t.rawSignedTx) : t.rawSignedTx; } catch { return; }
    if (!meta || meta.type !== 'paymentManager' || !meta.paymentId) return;

    const mmProvider = getMetaMaskProvider();
    if (!mmProvider) {
      toast.error('MetaMask not detected. Please install MetaMask to cancel.');
      return;
    }

    try {
      const chainIdHex = '0x' + Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_BASE_CHAIN_ID || 84532).toString(16);
      let currentChainId;
      try {
        currentChainId = await mmProvider.request({ method: 'eth_chainId' });
      } catch { currentChainId = null; }

      if (currentChainId !== chainIdHex) {
        try {
          await mmProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
        } catch (e) {
          if (e.code === 4902) {
            await mmProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                rpcUrls: [import.meta.env.VITE_RPC_URL || import.meta.env.VITE_BASE_RPC_URL || 'https://sepolia.base.org'],
                chainName: import.meta.env.VITE_CHAIN_NAME || 'Base Sepolia',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                blockExplorerUrls: [import.meta.env.VITE_EXPLORER_URL || import.meta.env.VITE_BASE_EXPLORER_URL || 'https://sepolia.basescan.org']
              }]
            });
          }
        }
      }

      const accounts = await mmProvider.request({ method: 'eth_requestAccounts' });
      const fromAddr = accounts[0];

      const contractAddress = import.meta.env.VITE_GLOBAL_PAY_MANAGER_ADDRESS || '0x6F3B1DC09A8C968F0B829276570bCF10AB9858c1';

      const cancelIface = new ethers.utils.Interface([
        'function cancel(bytes32 id)',
      ]);
      const callData = cancelIface.encodeFunctionData('cancel', [meta.paymentId]);

      const cancelTxHash = await mmProvider.request({
        method: 'eth_sendTransaction',
        params: [{ from: fromAddr, to: contractAddress, data: callData }]
      });

      const receipt = await waitForTxReceipt(mmProvider, cancelTxHash);

      if (Number(receipt.status) !== 1) {
        throw new Error('Cancel transaction reverted on chain');
      }

      await api.post('/pay/cancelContractFunding', {
        transferId: t.id,
        cancelTxHash,
      });

      toast.success('Scheduled payment cancelled successfully!');
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    }
  }, [getMetaMaskProvider, waitForTxReceipt]);

  const hasValidTxHash = (t) => {
    return typeof t.txHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(t.txHash.trim());
  };

  const isCancellable = (t) => {
    if (!isSenderMe(t)) return false; // only the sender can cancel a schedule
    if (t.status !== 'PENDING') return false;
    if (!t.rawSignedTx) return false;
    let meta;
    try { meta = typeof t.rawSignedTx === 'string' ? JSON.parse(t.rawSignedTx) : t.rawSignedTx; } catch { return false; }
    return meta?.type === 'paymentManager' && !!meta?.paymentId;
  };

  return (
    <div className="bg-[#0a0a0a] border-zinc-800/50 border p-5 sm:p-8 rounded-[2.5rem] flex-1 shadow-2xl h-full flex flex-col relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>

      <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tighter">Activity Log</h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-1">On-Chain Transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 text-xs font-medium">{transactions.length} Transactions</span>
          <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-amber-500">
            <FiActivity size={16} />
          </div>
        </div>
      </div>

      <div className="overflow-y-auto pr-3 custom-scrollbar flex-1 relative z-10 space-y-3 max-h-[600px]">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 opacity-30 min-h-[300px]">
            <FiClock className="text-6xl mb-4" />
            <p className="font-black uppercase text-xs tracking-[0.3em]">No On-Chain Activity Detected</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              const displayTransactions = [];
              transactions.forEach((transaction, index) => {
                if (transaction.status === 'FAILED') return;
                if (transaction.status === 'PENDING' && !hasValidTxHash(transaction)) return;
                const isSent = isSenderMe(transaction);
                // A funded-but-not-yet-released schedule is only visible to the
                // sender ("Funds Locked"); the receiver sees it once it releases.
                if (transaction.paymentStage === 'pending_release' && !isSent) return;
                if (isSent) {
                  displayTransactions.push({ ...transaction, isSent: true, key: `${index}-sent` });
                } else {
                  displayTransactions.push({ ...transaction, isSent: false, key: `${index}-received` });
                }
              });

              const visibleTransactions = showAll ? displayTransactions : displayTransactions.slice(0, 5);

              return visibleTransactions.map((t) => {
                const isSent = t.isSent;
                const txType = t.txType || 'direct';
                const displayReceiver = t.receiverUPI || t.receiver?.globalPayTag || 'Recipient';
                const displaySender = t.senderUPI || t.sender?.globalPayTag || 'Sender';
                const ethAmt = Number(t.botAmount || t.amount || 0);
                const targetTag = displayReceiver;
                const senderTag = displaySender;

                let title, subtitle, iconColor, iconBg, iconBorder;
                switch (txType) {
                  case 'scheduled_funding':
                    title = 'Scheduled Payment';
                    subtitle = 'Funds Locked';
                    iconColor = 'text-blue-500';
                    iconBg = 'bg-blue-500/10';
                    iconBorder = 'border-blue-500/20';
                    break;
                  case 'scheduled_release':
                    if (isSent) {
                      title = 'Scheduled Payment Delivered';
                      subtitle = `To ${targetTag}`;
                    } else {
                      title = 'Scheduled Payment Received';
                      subtitle = `From ${senderTag}`;
                    }
                    iconColor = isSent ? 'text-red-500' : 'text-emerald-500';
                    iconBg = isSent ? 'bg-red-500/10' : 'bg-emerald-500/10';
                    iconBorder = isSent ? 'border-red-500/20' : 'border-emerald-500/20';
                    break;
                  case 'scheduled_cancellation':
                    title = 'Scheduled Payment Cancelled';
                    subtitle = isSent ? 'Refunded to your wallet' : `Cancelled by ${senderTag}`;
                    iconColor = 'text-zinc-500';
                    iconBg = 'bg-zinc-800/30';
                    iconBorder = 'border-zinc-700/30';
                    break;
                  case 'ai':
                    title = isSent ? 'AI Payment Sent' : 'AI Payment Received';
                    subtitle = isSent ? `To ${targetTag}` : `From ${senderTag}`;
                    iconColor = 'text-purple-500';
                    iconBg = 'bg-purple-500/10';
                    iconBorder = 'border-purple-500/20';
                    break;
                  case 'qr':
                    title = isSent ? 'QR Payment Sent' : 'QR Payment Received';
                    subtitle = isSent ? `To ${targetTag}` : `From ${senderTag}`;
                    iconColor = isSent ? 'text-red-500' : 'text-emerald-500';
                    iconBg = isSent ? 'bg-red-500/10' : 'bg-emerald-500/10';
                    iconBorder = isSent ? 'border-red-500/20' : 'border-emerald-500/20';
                    break;
                  case 'request':
                    title = isSent ? 'Request Payment Sent' : 'Request Payment Received';
                    subtitle = isSent ? `To ${targetTag}` : `From ${senderTag}`;
                    iconColor = isSent ? 'text-red-500' : 'text-emerald-500';
                    iconBg = isSent ? 'bg-red-500/10' : 'bg-emerald-500/10';
                    iconBorder = isSent ? 'border-red-500/20' : 'border-emerald-500/20';
                    break;
                  default:
                    title = isSent ? 'Payment Sent' : 'Payment Received';
                    subtitle = isSent ? `To ${targetTag}` : `From ${senderTag}`;
                    iconColor = isSent ? 'text-red-500' : 'text-emerald-500';
                    iconBg = isSent ? 'bg-red-500/10' : 'bg-emerald-500/10';
                    iconBorder = isSent ? 'border-red-500/20' : 'border-emerald-500/20';
                }

                return (
                  <div
                    key={t.key}
                    className="group/item bg-zinc-900/30 hover:bg-zinc-900 border border-zinc-800/30 hover:border-zinc-700/50 p-4 rounded-2xl transition-all duration-500 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor} border ${iconBorder}`}>
                        {isSent ? <FiArrowUpRight size={18} strokeWidth={2.5} /> : <FiArrowDownLeft size={18} strokeWidth={2.5} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-bold text-sm tracking-tight truncate">{title}</p>
                          {t.status === 'PENDING' && txType === 'scheduled_funding' && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[7px] font-bold tracking-wider uppercase text-yellow-500 bg-yellow-500/10 border border-yellow-500/30">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-500 text-xs truncate mt-0.5">{subtitle}</p>
                        <div className="flex items-center gap-2 text-zinc-600 text-[10px] mt-1">
                          <span>{moment(txType === 'scheduled_release' ? (t.releasedAt || t.timestamp) : t.timestamp).format('DD MMM • hh:mm A')}</span>
                          {txType === 'scheduled_release' && <span className="text-zinc-600">· Scheduled</span>}
                          {txType === 'ai' && <span className="text-zinc-600">· AI Agent</span>}
                          {txType === 'qr' && <span className="text-zinc-600">· QR</span>}
                          {txType === 'request' && <span className="text-zinc-600">· Request</span>}
                          {txType === 'scheduled_cancellation' && <span className="text-zinc-600">· Cancelled</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {isCancellable(t) && (
                        <button
                          onClick={() => handleCancel(t)}
                          className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                      <div className="text-right">
                        <p className={`text-lg font-bold tracking-tight ${txType === 'scheduled_funding' ? 'text-zinc-400' : isSent ? 'text-white' : 'text-emerald-500'}`}>
                          {txType === 'scheduled_funding' ? '' : isSent ? '-' : '+'}{ethAmt.toFixed(4)} ETH
                        </p>
                        {hasValidTxHash(t) && (
                          <a
                            href={`${import.meta.env.VITE_EXPLORER_URL || import.meta.env.VITE_BASE_EXPLORER_URL || 'https://sepolia.basescan.org'}/tx/${t.txHash.trim()}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[9px] font-medium text-cyan-400/80 hover:text-cyan-300 transition-colors mt-0.5"
                          >
                            Basescan ↗
                          </a>
                        )}
                        {(t.status === 'CANCELLED' || t.status === 'FAILED') && (
                          <span className={`block text-[9px] font-bold uppercase tracking-widest mt-0.5 ${t.status === 'CANCELLED' ? 'text-zinc-600' : 'text-red-500'}`}>
                            {t.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {transactions.length > 5 && (
        <div className="mt-5 pt-5 border-t border-zinc-800/50 relative z-10">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-all flex items-center justify-center gap-2 group"
          >
            {showAll ? 'View Less' : 'View Complete History'} <FiArrowRight className={`transition-transform ${showAll ? '-rotate-90' : 'group-hover:translate-x-1'}`} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;