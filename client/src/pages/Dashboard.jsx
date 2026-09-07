import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import api, { getCachedUserDetail, invalidateUserCache } from '../utils/api';
import { FiArrowUpRight, FiArrowDownLeft, FiTrendingUp, FiTrendingDown, FiZap, FiShield, FiHash } from 'react-icons/fi';
import QRCode from 'qrcode.react';
import { saveAs } from 'file-saver';
import moment from 'moment';

const Dashboard = () => {
  const [transactions, setTransactions] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    ethSent: '0.0000',
    ethReceived: '0.0000',
    txCount: 0,
    ethVolume: '0.0000'
  });

  const chartRefs = useRef({
    internal: null,
    external: null
  });

  const downloadQRCode = (transaction) => {
    const canvas = document.getElementById(`qr-code-${transaction._id || transaction.id}`);
    if (!canvas) return;
    canvas.toBlob((blob) => {
      saveAs(blob, `transaction-${transaction._id || transaction.id}.png`);
    });
  };

  const groupPaymentsByDate = (pays) => {
    const dateMap = {};
    for (let i = 6; i >= 0; i--) {
      const dateKey = moment().subtract(i, 'days').format('YYYY-MM-DD');
      dateMap[dateKey] = 0;
    }

    pays.forEach(p => {
      const dateKey = moment(p.timestamp || p.createdAt || p.date).format('YYYY-MM-DD');
      if (Object.prototype.hasOwnProperty.call(dateMap, dateKey)) {
        const botVal = Number(p.botAmount || p.amount || 0);
        dateMap[dateKey] += botVal;
      }
    });

    return Object.keys(dateMap).map(dateKey => ({
      date: moment(dateKey).format('MMM DD'),
      amount: parseFloat(dateMap[dateKey].toFixed(4))
    }));
  };

  const fetchDashboardData = async () => {
    try {
      const [payRes, payResExt, transferRes, transferResExt, userData] = await Promise.all([
        api.get('/pay/paymentRead').catch(() => ({ data: [] })),
        api.get('/pay/paymentReadExternal').catch(() => ({ data: [] })),
        api.get('/money-transfer').catch(() => ({ data: [] })),
        api.get('/money-transfer/external').catch(() => ({ data: [] })),
        getCachedUserDetail().catch(() => { invalidateUserCache(); return null; }),
      ]);

      const botPrice = Number(userData?.bankDetails?.botPrice || 9.72);

      // 1. On-chain payments
      const pays = Array.isArray(payRes.data) ? payRes.data : [];
      const extPays = Array.isArray(payResExt.data) ? payResExt.data : [];
      const allPaysCombined = [...pays, ...extPays];

      const normalizedPays = allPaysCombined.map((p) => {
        const coin = p.coin || 'USDC';
        const ethAmt = Number(p.botAmountSnapshot || p.amount || 0);
        return {
          ...p,
          _id: p._id || p.id,
          amountDisplay: `${ethAmt.toFixed(4)} ${coin}`,
          coin,
          botAmount: ethAmt,
          receiverId: p.toUPI || 'Recipient',
          timestamp: p.date || p.createdAt || new Date().toISOString()
        };
      });

      // 2. On-chain transfers
      const transfers = Array.isArray(transferRes.data) ? transferRes.data : [];
      const extTransfers = Array.isArray(transferResExt.data) ? transferResExt.data : [];
      const allTransfersCombined = [...transfers, ...extTransfers];

      const normalizedTransfers = allTransfersCombined.map((t) => {
        const ethAmt = Number(t.botAmount || t.amount || 0);
        return {
          ...t,
          _id: t._id || t.id,
          amountDisplay: `${ethAmt.toFixed(4)} ${t.coin || 'USDC'}`,
          coin: t.coin || 'USDC',
          botAmount: ethAmt,
          receiverId: t.receiverUPI || t.senderUPI || t.receiver || 'Recipient',
          timestamp: t.timestamp || t.createdAt || new Date().toISOString()
        };
      });

      // 3. Merge & deduplicate by txHash first to prevent duplicate entries
      const mergedList = [...normalizedPays, ...normalizedTransfers];
      const dupMap = new Map();
      mergedList.forEach(item => {
        const key = (item.txHash && String(item.txHash).startsWith('0x'))
          ? String(item.txHash).toLowerCase()
          : (item._id ? String(item._id) : JSON.stringify(item));
        
        if (!dupMap.has(key)) {
          dupMap.set(key, item);
        } else {
          const existing = dupMap.get(key);
          const existingDate = existing.timestamp || existing.createdAt || existing.date;
          const itemDate = item.timestamp || item.createdAt || item.date;
          if (!existingDate && itemDate) {
            dupMap.set(key, item);
          }
        }
      });

      const uniqueTransactions = Array.from(dupMap.values());

      // Web3 Analytics calculation
      const uObj = userData || {};
      const userId = uObj._id || uObj.id;
      const userTag = uObj.globalPayTag;
      const userUpi = uObj.upiId;
      const userEmail = uObj.email;
      const userIntWallet = uObj.internalWalletAddress;
      const userExtWallet = uObj.metamaskId || uObj.externalWallet;

      const isSentByUser = (t) => {
        const sVal = String(t.sender?._id || t.sender || t.senderUPI || '').toLowerCase();
        if (userId && sVal === String(userId).toLowerCase()) return true;
        if (userTag && sVal === String(userTag).toLowerCase()) return true;
        if (userTag && sVal === `@${String(userTag).replace(/^@/, '').toLowerCase()}`) return true;
        if (userUpi && sVal === String(userUpi).toLowerCase()) return true;
        if (userEmail && sVal === String(userEmail).toLowerCase()) return true;
        if (userIntWallet && sVal === String(userIntWallet).toLowerCase()) return true;
        if (userExtWallet && sVal === String(userExtWallet).toLowerCase()) return true;
        return false;
      };

      const isReceivedByUser = (t) => {
        const rVal = String(t.receiver?._id || t.receiver || t.receiverUPI || t.toUPI || t.destinationAddress || '').toLowerCase();
        if (userId && rVal === String(userId).toLowerCase()) return true;
        if (userTag && rVal === String(userTag).toLowerCase()) return true;
        if (userTag && rVal === `@${String(userTag).replace(/^@/, '').toLowerCase()}`) return true;
        if (userUpi && rVal === String(userUpi).toLowerCase()) return true;
        if (userEmail && rVal === String(userEmail).toLowerCase()) return true;
        if (userIntWallet && rVal === String(userIntWallet).toLowerCase()) return true;
        if (userExtWallet && rVal === String(userExtWallet).toLowerCase()) return true;
        return false;
      };

      const allTransactions = uniqueTransactions.map(t => {
        const isOutgoing = isSentByUser(t);
        const isIncoming = isReceivedByUser(t);

        // Resolve wallet labels based on actual database resolved wallet types
        const sWalletType = String(t.senderWalletType || '').toLowerCase();
        const rWalletType = String(t.receivingWalletType || t.receiverWalletType || '').toLowerCase();

        const senderLabel = sWalletType === 'external' ? 'External Wallet' : 'Internal Vault';
        const receiverLabel = rWalletType === 'external' ? 'External Wallet' : 'Internal Vault';
        
        const typeStr = `${senderLabel} ➔ ${receiverLabel}`;

        // Dynamic Receiver tag or name
        const displayTag = isOutgoing 
          ? (t.receiverUPI || t.toUPI || t.receiver?.globalPayTag || t.receiver?.upiId || t.receiver?.email || 'Recipient')
          : (t.senderUPI || t.sender?.globalPayTag || t.sender?.upiId || t.sender?.email || 'Sender');

        return {
          ...t,
          type: typeStr,
          isOutgoing,
          isIncoming,
          receiverId: displayTag,
        };
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setTransactions(allTransactions);
      if (userData) setUser(userData);

      const ethSent = allTransactions
        .filter(t => t.isOutgoing && !t.isIncoming)
        .reduce((s, t) => s + (t.botAmount || 0), 0);

      const ethReceived = allTransactions
        .filter(t => t.isIncoming)
        .reduce((s, t) => s + (t.botAmount || 0), 0);

      const totalVol = ethSent + ethReceived;

      setTotals({
        ethSent: ethSent.toFixed(4),
        ethReceived: ethReceived.toFixed(4),
        txCount: allTransactions.length,
        ethVolume: totalVol.toFixed(4)
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!loading) {
      drawCharts(transactions);
    }
  }, [transactions, loading]);

  const destroyChart = (refName) => {
    if (chartRefs.current[refName]) {
      chartRefs.current[refName].destroy();
      chartRefs.current[refName] = null;
    }
  };

  const drawCharts = (data) => {
    destroyChart('internal');
    destroyChart('external');

    // Wallet-aware chart split: use the actual senderWalletType field
    const internalPayments = data.filter(p => {
      const swt = String(p.senderWalletType || '').toLowerCase();
      return !swt || swt === 'internal' || swt === '';
    });
    const externalPayments = data.filter(p => {
      const swt = String(p.senderWalletType || '').toLowerCase();
      return swt === 'external';
    });

    const aggregatedInternal = groupPaymentsByDate(internalPayments);
    const aggregatedExternal = groupPaymentsByDate(externalPayments);

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#52525b', font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#52525b', font: { size: 10 } }
        }
      }
    };

    const ctxInternal = document.getElementById('internalChart')?.getContext('2d');
    if (ctxInternal) {
      const gradient = ctxInternal.createLinearGradient(0, 0, 0, 350);
      gradient.addColorStop(0, 'rgba(168, 85, 247, 0.35)');
      gradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

      chartRefs.current.internal = new Chart(ctxInternal, {
        type: 'line',
        data: {
          labels: aggregatedInternal.map(a => a.date),
          datasets: [{
            label: 'Internal Vault',
            data: aggregatedInternal.map(a => a.amount),
            borderColor: '#a855f7',
            backgroundColor: gradient,
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: '#a855f7',
            pointBorderColor: '#05070B',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7
          }]
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            tooltip: {
              backgroundColor: 'rgba(9, 9, 11, 0.95)',
              titleColor: '#a1a1aa',
              bodyColor: '#a855f7',
              borderColor: 'rgba(168, 85, 247, 0.3)',
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              callbacks: {
                label: function (context) {
                  return 'Vault Transferred: ' + context.parsed.y.toFixed(4) + ' USDC';
                }
              }
            }
          }
        }
      });
    }

    const ctxExternal = document.getElementById('externalChart')?.getContext('2d');
    if (ctxExternal) {
      const gradient = ctxExternal.createLinearGradient(0, 0, 0, 350);
      gradient.addColorStop(0, 'rgba(34, 211, 238, 0.35)');
      gradient.addColorStop(1, 'rgba(34, 211, 238, 0.0)');

      chartRefs.current.external = new Chart(ctxExternal, {
        type: 'line',
        data: {
          labels: aggregatedExternal.map(a => a.date),
          datasets: [{
            label: 'External Wallet',
            data: aggregatedExternal.map(a => a.amount),
            borderColor: '#22d3ee',
            backgroundColor: gradient,
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: '#22d3ee',
            pointBorderColor: '#05070B',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7
          }]
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            tooltip: {
              backgroundColor: 'rgba(9, 9, 11, 0.95)',
              titleColor: '#a1a1aa',
              bodyColor: '#22d3ee',
              borderColor: 'rgba(34, 211, 238, 0.3)',
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              callbacks: {
                label: function (context) {
                  return 'External Transferred: ' + context.parsed.y.toFixed(4) + ' USDC';
                }
              }
            }
          }
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-primary text-white p-3 sm:p-4 md:p-8 font-sans selection:bg-secondary/30">
      <div className="max-w-[1600px] mx-auto space-y-10">

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 px-2">
          <div>
            <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-secondary to-secondary">Overview</h1>
          </div>

          {user && user.globalPayTag && (
            <div className="bg-zinc-900/50 border border-zinc-800/80 px-4 py-2 rounded-xl flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Global PayTag</span>
              <span className="text-sm font-black text-secondary bg-secondary/10 px-3 py-1 rounded-lg border border-secondary/20">
                {user.globalPayTag}
              </span>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-r from-secondary/5 via-zinc-900/40 to-secondary/5 border border-zinc-800/80 rounded-[2.5rem] p-6 md:p-8 backdrop-blur-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
            <div className="flex items-center gap-5 w-full lg:w-auto">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary to-secondary p-0.5 shadow-lg">
                <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
                  <FiShield size={24} className="text-secondary" />
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Primary Receiving Wallet</p>
                <div className="flex items-center gap-3 mt-1">
                  <h3 className="text-xl font-black">
                    {user?.primaryReceivingWallet === 'external' ? 'External Web3 Wallet' : 'Internal Platform Vault'}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Active Rail
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full lg:w-auto">
              <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Vault Address</p>
                <p className="text-xs text-secondary font-mono font-bold truncate">
                  {user?.internalWalletAddress || 'Generating...'}
                </p>
              </div>

              <div className="bg-zinc-950/60 border border-zinc-800/80 p-4 rounded-2xl">
                {user?.metamask ? (
                  <div>
                    <div className="flex items-center gap-2 text-cyan-400 mb-1">
                      <span className="text-xs">✓</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Web3 Identity Linked</span>
                    </div>
                    <p className="text-xs text-zinc-400 font-mono truncate">{user.metamask}</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-amber-500 mb-1">
                      <span className="text-xs">⚡</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Web3 Identity</span>
                    </div>
                    <a href="/web3-kyc" className="text-xs font-bold text-white underline">Connect Web3 Wallet</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'USDC Sent', value: `${totals.ethSent} USDC`, icon: FiTrendingUp, color: 'text-orange-400 border-orange-500/20', trend: 'On-Chain' },
            { label: 'USDC Received', value: `${totals.ethReceived} USDC`, icon: FiTrendingDown, color: 'text-emerald-400 border-emerald-500/20', trend: 'Confirmed' },
            { label: 'On-Chain Transactions', value: totals.txCount, icon: FiZap, color: 'text-secondary border-secondary/20', trend: 'All Time' },
            { label: 'USDC Volume', value: `${totals.ethVolume} USDC`, icon: FiHash, color: 'text-cyan-400 border-cyan-500/20', trend: 'Total Volume' },
          ].map((stat, i) => (
            <div key={i} className="group bg-zinc-900/30 backdrop-blur-md border border-zinc-800/50 p-4 rounded-2xl hover:border-secondary/30 transition-all duration-500 shadow-xl relative overflow-hidden">
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border bg-zinc-950/50 ${stat.color}`}>
                    <stat.icon size={16} />
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-0.5">{stat.label}</p>
                    <h3 className="text-xl font-black tracking-tight">{stat.value}</h3>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-zinc-400 text-[9px] font-bold uppercase tracking-widest bg-zinc-800/50 border border-zinc-700/50 px-2 py-1 rounded-md">{stat.trend}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900/30 backdrop-blur-md border border-zinc-800/50 p-6 rounded-[2rem] shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Internal Vault (USDC)</h3>
              <span className="text-[10px] font-bold text-secondary bg-secondary/10 px-2 py-1 rounded-full border border-secondary/10">7D WINDOW</span>
            </div>
            <div className="h-56 relative">
              <canvas id="internalChart"></canvas>
            </div>
          </div>

          <div className="bg-zinc-900/30 backdrop-blur-md border border-zinc-800/50 p-6 rounded-[2rem] shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">External Wallet (USDC)</h3>
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full border border-cyan-500/10">7D WINDOW</span>
            </div>
            <div className="h-56 relative">
              <canvas id="externalChart"></canvas>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-black tracking-tighter">On-Chain Gateway Ledger</h2>
          </div>

          <div className="bg-zinc-900/30 backdrop-blur-md border border-zinc-800/50 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-zinc-900/50 border-b border-zinc-800/50">
                  <th className="px-4 sm:px-8 py-4 sm:py-6 text-[10px] font-black uppercase tracking-widest text-zinc-500">Receiver / PayTag</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-6 text-[10px] font-black uppercase tracking-widest text-zinc-500">Amount Sent</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-6 text-[10px] font-black uppercase tracking-widest text-zinc-500">Asset / Coin</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-6 text-[10px] font-black uppercase tracking-widest text-zinc-500">Timestamp</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-6 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">Receipt Key</th>
                  <th className="px-4 sm:px-8 py-4 sm:py-6 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={`skeleton-${i}`} className="animate-pulse border-b border-zinc-800/30">
                      <td className="px-4 sm:px-8 py-4 sm:py-6"><div className="h-10 w-32 bg-zinc-800/50 rounded-xl"></div></td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6"><div className="h-5 w-16 bg-zinc-800/50 rounded-md"></div></td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6"><div className="h-5 w-16 bg-zinc-800/50 rounded-full"></div></td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6"><div className="h-4 w-20 bg-zinc-800/50 rounded-md"></div></td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6"><div className="h-8 w-8 bg-zinc-800/50 rounded-lg mx-auto"></div></td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6 text-right"><div className="h-8 w-20 bg-zinc-800/50 rounded-xl ml-auto"></div></td>
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr><td colSpan="6" className="p-20 text-center text-zinc-500 font-black uppercase tracking-[0.3em]">No Transactions Detected</td></tr>
                ) : (
                  transactions.slice(0, 10).map((t) => (
                    <tr key={t._id} className="group hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border ${t.isOutgoing ? 'border-orange-500/20 text-orange-400' : 'border-emerald-500/20 text-emerald-400'}`}>
                            {t.isOutgoing ? <FiArrowUpRight size={14} /> : <FiArrowDownLeft size={14} />}
                          </div>
                          <div>
                            <p className="text-white font-bold text-xs sm:text-sm tracking-tight">{t.receiverId || 'Unknown'}</p>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">{t.type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <p className={`text-sm sm:text-base font-black ${t.isOutgoing ? 'text-white' : 'text-emerald-400'}`}>
                          {t.isOutgoing ? '-' : '+'}{t.amountDisplay}
                        </p>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <span className={`px-2 sm:px-3 py-1 bg-zinc-900 border rounded-full text-[9px] font-black uppercase tracking-widest ${t.coin === 'USDC' ? 'text-secondary border-secondary/20' : 'text-cyan-400 border-cyan-500/20'}`}>
                          {t.coin}
                        </span>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <p className="text-zinc-500 text-[10px] sm:text-xs font-medium">{moment(t.timestamp).format('MMM DD, HH:mm')}</p>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <div className="flex justify-center">
                          <QRCode id={`qr-code-${t._id}`} value={JSON.stringify(t)} size={28} bgColor="transparent" fgColor="#6b21a8" />
                        </div>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6 text-right">
                        {t.txHash ? (
                          <a
                            href={`${import.meta.env.VITE_EXPLORER_URL || import.meta.env.VITE_ARC_EXPLORER_URL || 'https://testnet.arcscan.app'}/tx/${t.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block px-4 py-2 bg-secondary/5 hover:bg-secondary/10 border border-secondary/20 rounded-xl text-[9px] font-black uppercase text-secondary hover:text-white transition-all"
                          >
                            VERIFY TX
                          </a>
                        ) : (
                          <span className="inline-block px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[9px] font-black uppercase text-amber-400">SETTLED</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
