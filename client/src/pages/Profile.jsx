import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { FaUserCircle, FaEdit, FaCheckCircle, FaSignOutAlt, FaShieldAlt } from 'react-icons/fa';
import { FiArrowUpRight, FiSend, FiCopy, FiCheck, FiExternalLink } from 'react-icons/fi';
import { useExternalWallet } from '../hooks/useExternalWallet';
import toast from 'react-hot-toast';
import moment from 'moment';
import api, { getCachedUserDetail, refreshUserCache, invalidateUserCache } from '../utils/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const formatAddr = (addr) => {
  if (!addr || addr === "Not Generated" || addr === "Not Connected") return addr || "";
  if (typeof addr === "string" && addr.startsWith("0x") && addr.length > 10) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }
  return addr;
};

const Profile = () => {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const ext = useExternalWallet();

  // User data
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("User");
  const [email, setEmail] = useState("");
  const [mob, setMob] = useState("..");
  const [dob, setDob] = useState("..");
  const [kyc, setKyc] = useState(false);
  const [botBalance, setBotBalance] = useState(0);   // internal vault BOT balance
  const [extBalance, setExtBalance] = useState(0);   // external wallet balance
  const [liveExtBalance, setLiveExtBalance] = useState(0); // live on-chain balance
  const [botPrice, setBotPrice] = useState(1.0);    // live price
  const [walletAddr, setWalletAddr] = useState("");
  const [externalWallet, setExternalWallet] = useState("");
  const [globalPayTag, setGlobalPayTag] = useState("");
  const [box, setBox] = useState(false);
  const [copied, setCopied] = useState("");
  const [primaryWallet, setPrimaryWallet] = useState("internal");

  const isManuallyDisconnected = typeof window !== 'undefined' && (
    localStorage.getItem('external_wallet_disconnected') === 'true' ||
    localStorage.getItem('wallet_disconnected') === 'true' ||
    sessionStorage.getItem('wallet_disconnected') === 'true'
  );

  const activeExtWallet = (!isManuallyDisconnected && (ext.isConnected ? ext.address : "")) || (externalWallet && externalWallet !== "Not Connected" && !isManuallyDisconnected ? externalWallet : "");
  const isExtConnected = Boolean(activeExtWallet && activeExtWallet !== "Not Connected" && !isManuallyDisconnected);

  // When the user connects an external wallet via the modal, persist it.
  useEffect(() => {
    if (ext.isConnected && ext.address && !isManuallyDisconnected && ext.address !== externalWallet) {
      api.put('/auth/update-external-wallet', { walletAddress: ext.address })
        .then(() => {
          setExternalWallet(ext.address);
          refreshUserCache().then(() => loadProfile());
        })
        .catch(err => console.error("Wallet sync error:", err));
    }
  }, [ext.isConnected, ext.address]);

  // Live RPC balance query for both internal vault and external wallet on Arc Testnet
  useEffect(() => {
    import('ethers').then(async ({ ethers }) => {
      const rpc = import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io';
      const provider = new ethers.providers.JsonRpcProvider(rpc);

      // Internal Vault on-chain balance
      if (walletAddr && walletAddr.startsWith('0x') && walletAddr.length >= 40 && walletAddr !== '0x0000000000000000000000000000000000000000') {
        try {
          const rawInt = await provider.getBalance(walletAddr);
          const val = parseFloat(ethers.utils.formatUnits(rawInt, 18));
          if (!isNaN(val)) setBotBalance(val);
        } catch (err) {
          console.error("Internal wallet Arc balance fetch error:", err);
        }
      }

      // External Wallet on-chain balance
      if (activeExtWallet && activeExtWallet.startsWith('0x') && activeExtWallet.length >= 40) {
        try {
          const rawBal = await provider.getBalance(activeExtWallet);
          const extVal = parseFloat(ethers.utils.formatUnits(rawBal, 18));
          if (!isNaN(extVal)) {
            setLiveExtBalance(extVal);
            setExtBalance(extVal);
          }
        } catch (err) {
          console.error("External wallet Arc balance fetch error:", err);
          setLiveExtBalance(0);
          setExtBalance(0);
        }
      } else {
        setLiveExtBalance(0);
        setExtBalance(0);
      }
    }).catch(e => console.error(e));
  }, [walletAddr, activeExtWallet]);

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  // Transaction data
  const [transactions, setTransactions] = useState([]);

  const token = localStorage.getItem("token");

  const loadProfile = async () => {
    if (!token) return;
    try {
      // Fetch fresh profile directly from backend to avoid stale cache
      const res = await api.get('/auth/fetchdetail').catch(() => null);
      const d = res?.data || await getCachedUserDetail();
      if (!d) return;
      if (d._id || d.id) setUserId(String(d._id || d.id));
      setEmail(d.email || "..");
      setName(d.username || d.email?.split('@')[0] || "User");
      setMob(d.mobile || "..");
      setDob(d.dob || "..");
      setKyc(d.kyc || false);
      const userInternal = d.internalWalletAddress || d.internal_wallet_address || "Not Generated";
      setWalletAddr(userInternal);
      const savedExt = d.metamaskId || d.metamask || d.externalWallet || "";
      if (savedExt && savedExt !== "Not Connected" && !isManuallyDisconnected) {
        setExternalWallet(savedExt);
      } else {
        setExternalWallet("");
      }
      setGlobalPayTag(d.globalPayTag || "");
      setPrimaryWallet(d.primaryReceivingWallet || "internal");

      // Check on-chain balance immediately
      if (userInternal && userInternal.startsWith('0x') && userInternal.length >= 40 && userInternal !== '0x0000000000000000000000000000000000000000') {
        import('ethers').then(async ({ ethers }) => {
          try {
            const rpc = import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io';
            const provider = new ethers.providers.JsonRpcProvider(rpc);
            const rawInt = await provider.getBalance(userInternal);
            const val = parseFloat(ethers.utils.formatUnits(rawInt, 18));
            if (!isNaN(val)) setBotBalance(val);
          } catch (e) {
            console.error("Live Arc balance fetch error on loadProfile:", e);
          }
        }).catch(() => {});
      } else if (d.bankDetails) {
        const intBal = Number(d.bankDetails.usdcBalance || d.bankDetails.internalBalance || 0);
        setBotBalance(intBal);
      }

      if (d.bankDetails) {
        setBotPrice(Number(d.bankDetails.botPrice) || 1.0);
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    }
  };

  const handleLinkInternalWallet = async () => {
    setIsGenerating(true);
    const toastId = toast.loading("Initializing secure MPC wallet creation...");
    try {
      const res = await api.post('/auth/mpc-create-wallet', { forceMigration: true });
      toast.success("Platform MPC Vault Wallet generated and linked successfully!", { id: toastId });
      await refreshUserCache();
      await loadProfile();
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate MPC wallet: " + (err.response?.data?.message || err.message || err), { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConnectWeb3 = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('external_wallet_disconnected');
      localStorage.removeItem('wallet_disconnected');
      sessionStorage.removeItem('wallet_disconnected');
    }
    const connected = await ext.connect();
    if (!connected) toast.error('Wallet connection was cancelled or failed.');
  };

  const handleDisconnectWeb3 = async () => {
    if (!window.confirm('Disconnect your external Web3 wallet?')) return;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('external_wallet_disconnected', 'true');
        localStorage.setItem('wallet_disconnected', 'true');
        sessionStorage.setItem('wallet_disconnected', 'true');
      }
      await ext.disconnect();
      await api.put('/auth/update-external-wallet', { walletAddress: '' });
      setExternalWallet("");
      setExtBalance(0);
      window.location.reload();
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  };

  const fetchTransactions = async () => {
    if (!token) return;
    try {
      const res = await api.get("/money-transfer/external").catch(() => ({ data: [] }));
      const extList = res.data || [];
      const txMap = new Map();
      extList.forEach(tx => {
        const k = (tx.txHash || tx.tx_hash || tx._id || tx.id || '').toLowerCase();
        if (k && !txMap.has(k)) {
          txMap.set(k, tx);
        }
      });
      setTransactions(Array.from(txMap.values()));
    } catch (err) {
      console.error("Failed to fetch external transactions:", err);
    }
  };

  useEffect(() => {
    loadProfile();
    fetchTransactions();
  }, [token]);

  const logoutHandler = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    window.location.href = "/";
  };

  const handleMakePrimary = async (type) => {
    const displayType = type === 'external' ? 'External Wallet' : 'Internal Wallet';
    if (!window.confirm(`Future payments will be received in your ${displayType}.`)) {
      return;
    }
    try {
      await api.put("/auth/update-primary-wallet", { primaryReceivingWallet: type });
      setPrimaryWallet(type);
      refreshUserCache().then(() => loadProfile());
    } catch (err) {
      console.error("Failed to update primary receiving wallet:", err);
      const errMsg = err.response?.data?.message || "Failed to update primary wallet selection.";
      alert(errMsg);
    }
  };

  const toggleBox = () => setBox(!box);

  const updateProfile = async () => {
    try {
      await api.put("/auth/update", { name, mob, dob });
      setBox(false);
      fetchUser();
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  // Direction helper for external ledger
  const myExtIds = new Set([
    String(userId || '').toLowerCase(),
    String(globalPayTag || '').toLowerCase(),
    String(globalPayTag || '').replace(/^@/, '').toLowerCase(),
    globalPayTag ? `@${String(globalPayTag).replace(/^@/, '').toLowerCase()}` : null,
    String(email || '').toLowerCase(),
    String(walletAddr || '').toLowerCase(),
    String(activeExtWallet || '').toLowerCase(),
  ].filter(Boolean));

  const isSenderMeExt = (t) => {
    const senderObjId = typeof t.sender === 'object' ? String(t.sender?.id || t.sender?._id || '') : String(t.sender_id || t.sender || '');
    if (senderObjId && myExtIds.has(senderObjId.toLowerCase())) return true;
    const sUPI = String(t.senderUPI || t.sender_pay_tag || t.sender?.globalPayTag || t.sender?.upiId || '').toLowerCase();
    if (sUPI && myExtIds.has(sUPI)) return true;
    if (sUPI && myExtIds.has(sUPI.replace(/^@/, ''))) return true;
    if (sUPI && myExtIds.has(`@${sUPI.replace(/^@/, '')}`)) return true;
    return false;
  };

  // Use external records, deduplicate by txHash to prevent showing the same transaction twice
  const allExternal = transactions.filter(t => {
    const isSent = isSenderMeExt(t);
    // Strict isolation: only show transaction if the current user's leg used the external Web3 wallet
    const isMyLegExternal = isSent
      ? (t.senderWalletType === 'external')
      : (t.receivingWalletType === 'external');
    if (!isMyLegExternal) return false;

    const isScheduleRow = (t.txType === 'scheduled_funding' || t.txType === 'scheduled_cancellation' || t.txType === 'scheduled_release')
      || t.paymentStage === 'pending_release' || t.paymentStage === 'cancelled';
    // Failed schedules still represent real on-chain events — surface them
    // instead of silently hiding the payment from the activity log.
    if (t.status === 'FAILED' && !isScheduleRow) return false;
    if (t.status === 'PENDING' && !(typeof t.txHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(t.txHash.trim()))) return false;
    // Hide pending-funded schedules from the receiver — only the sender sees "Funds Locked"
    if (t.paymentStage === 'pending_release' && !isSent) return false;
    // A cancelled/failed schedule never reaches the receiver — only surface it to the sender
    if (t.txType === 'scheduled_cancellation' && !isSent) return false;
    return true;
  });
  // Chart data for send/receive (external-only, excluding pending-funded and failed/pending-without-tx)
  const sentTxs = allExternal.filter(t => isSenderMeExt(t) && t.paymentStage !== 'pending_release' && !(t.status === 'FAILED' && (t.txType === 'scheduled_cancellation' || t.txType === 'scheduled_release')));
  const receivedTxs = allExternal.filter(t => !isSenderMeExt(t) && !(t.status === 'FAILED' && (t.txType === 'scheduled_cancellation' || t.txType === 'scheduled_release')));
  const totalSent = sentTxs.reduce((s, t) => s + Number(t.botAmount || t.amount || 0), 0);
  const totalReceived = receivedTxs.reduce((s, t) => s + Number(t.botAmount || t.amount || 0), 0);

  const baseTxs = [...allExternal.filter(t => t.paymentStage !== 'pending_release' && !(t.status === 'FAILED' && (t.txType === 'scheduled_cancellation' || t.txType === 'scheduled_release')))].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-8);
  const chartTxs = [];

  baseTxs.forEach((t) => {
    const isSent = isSenderMeExt(t);
    chartTxs.push({ ...t, isSent });
  });

  const chartData = {
    labels: chartTxs.map(t => moment(t.timestamp).format('DD MMM')),
    datasets: [
      {
        label: 'Amount',
        data: chartTxs.map(t => Number(t.botAmount || t.amount || 0)),
        backgroundColor: chartTxs.map(t => t.isSent ? 'rgba(251, 146, 60, 0.85)' : 'rgba(139, 92, 246, 0.85)'),
        borderRadius: 6,
        barThickness: 14,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#000', titleFont: { size: 10, weight: '900' }, bodyFont: { size: 12 }, padding: 10, displayColors: false, callbacks: { label: (c) => `${c.raw.toFixed(2)} USDC` } } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#52525b', font: { size: 9, weight: '700' }, callback: v => `${v} USDC` } },
      x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 9, weight: '700' } } }
    }
  };

  const extMap = new Map();
  allExternal.forEach(item => {
    const key = (item.txHash && String(item.txHash).startsWith('0x'))
      ? String(item.txHash).toLowerCase()
      : (item._id ? String(item._id) : JSON.stringify(item));
    
    if (!extMap.has(key)) {
      extMap.set(key, item);
    } else {
      const existing = extMap.get(key);
      const existingDate = existing.timestamp || existing.date || existing.createdAt;
      const itemDate = item.timestamp || item.date || item.createdAt;
      if (!existingDate && itemDate) {
        extMap.set(key, item);
      }
    }
  });
  const displayExternalPayments = Array.from(extMap.values()).sort((a, b) =>
    new Date(b.timestamp || b.date || b.createdAt || 0) - new Date(a.timestamp || a.date || a.createdAt || 0)
  );

  const totalCryptoTx = displayExternalPayments.length;
  const totalCryptoValue = displayExternalPayments.reduce((s, p) => s + Number(p.botAmountSnapshot || p.botAmount || p.amount || 0), 0);

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative font-sans"
      style={{ backgroundImage: "url('/cryp.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/60"></div>

      <div className="relative z-10 max-w-[1400px] mx-auto p-3 sm:p-4 md:p-8 lg:p-12">

        {/* ========== 2x2 GRID ========== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

          {/* ─── CARD 1: User Profile ─── */}
          <div className="relative bg-[#0c0c0c]/80 backdrop-blur-xl border border-zinc-800/60 rounded-[2rem] p-5 sm:p-8 shadow-2xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-6">
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.25em]">Profile</p>
                <button onClick={toggleBox} className="p-2 bg-zinc-800/60 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-amber-500 transition-all border border-zinc-700/40">
                  <FaEdit size={14} />
                </button>
              </div>

              <div className="flex items-center gap-5 mb-8">
                <div className="relative">
                  <div className="w-16 h-16 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-full flex items-center justify-center border-2 border-zinc-700/50 shadow-xl">
                    <FaUserCircle className="text-zinc-600 text-5xl" />
                  </div>
                  {kyc && (
                    <div className="absolute -bottom-1 -right-1 bg-amber-500 p-1 rounded-full border-2 border-[#0c0c0c] text-[#0c0c0c]">
                      <FaCheckCircle size={8} />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">{name}</h2>
                  <p className="text-zinc-500 text-xs mt-0.5">{email}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/40">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Email</span>
                  <span className="text-zinc-300 text-sm font-semibold truncate ml-4 text-right">{email}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/40">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">GlobalPay Tag</span>
                  {globalPayTag ? (
                    <span className="text-amber-400 text-sm font-black bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {globalPayTag}
                    </span>
                  ) : (
                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest bg-zinc-800 px-2 py-0.5 rounded animate-pulse">
                      Generating...
                    </span>
                  )}
                </div>

                {/* Receiving Wallet Settings inside Profile Box */}
                {true && (
                  <div className="pt-4 border-t border-zinc-800/60 mt-4 space-y-4">
                    <p className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Receiving Wallet</p>

                    {/* Internal Wallet */}
                    <div className={`p-4 rounded-xl border transition-all ${primaryWallet === 'internal' ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-900/40 border-zinc-800/40'}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${primaryWallet === 'internal' ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`}></span>
                          <span className="text-white font-bold text-xs">Internal Wallet</span>
                        </div>
                        {primaryWallet === 'internal' ? (
                          <span className="text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">Active</span>
                        ) : (
                          <button
                            onClick={() => handleMakePrimary('internal')}
                            className="text-[8px] font-black uppercase bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2 py-1 rounded transition-all border border-zinc-700/30"
                          >
                            Make Primary
                          </button>
                        )}
                      </div>
                      {walletAddr === "Not Generated" ? (
                        <button
                          onClick={handleLinkInternalWallet}
                          disabled={isGenerating}
                          className="mt-1 w-full py-1.5 text-[10px] font-bold bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 rounded-lg transition-all"
                        >
                          {isGenerating ? "Generating..." : "Generate platform Wallet"}
                        </button>
                      ) : (
                        <span className="text-zinc-400 text-xs block font-mono" title={walletAddr}>{formatAddr(walletAddr)}</span>
                      )}
                    </div>

                    {/* External Wallet */}
                    <div className={`p-4 rounded-xl border transition-all ${primaryWallet === 'external' ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-900/40 border-zinc-800/40'}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${primaryWallet === 'external' ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`}></span>
                          <span className="text-white font-bold text-xs">External Wallet</span>
                        </div>
                        {primaryWallet === 'external' ? (
                          <span className="text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">Active</span>
                        ) : (
                          <button
                            onClick={() => handleMakePrimary('external')}
                            disabled={!isExtConnected}
                            className={`text-[8px] font-black uppercase px-2 py-1 rounded transition-all border ${!isExtConnected
                              ? 'bg-zinc-800/30 text-zinc-650 cursor-not-allowed border-zinc-800/50'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700/30'
                              }`}
                          >
                            Set Primary
                          </button>
                        )}
                      </div>
                      <span className="text-zinc-400 text-xs block font-mono" title={externalWallet}>{formatAddr(externalWallet) || 'Not Connected'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-auto pt-6">
              <Link to="/web3-kyc" className="hidden flex-1 flex items-center justify-center gap-2 bg-zinc-800/40 hover:bg-zinc-800 py-3 rounded-xl border border-zinc-700/30 transition-all">
                <FaShieldAlt className={kyc ? "text-emerald-500" : "text-amber-500"} size={12} />
                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">{kyc ? "Verified" : "Web3 Identity"}</span>
              </Link>
              <button onClick={logoutHandler} className="flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-5 py-3 rounded-xl border border-red-500/10 transition-all">
                <FaSignOutAlt size={12} />
                <span className="text-[10px] font-black uppercase tracking-widest">Sign Out</span>
              </button>
            </div>

            {/* Edit Overlay */}
            {box && (
              <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-2xl z-50 flex flex-col p-8 rounded-[2rem]">
                <div className="flex justify-between items-center mb-8">
                  <h4 className="text-white font-black uppercase tracking-widest text-xs">Update Details</h4>
                  <button onClick={toggleBox} className="text-zinc-500 hover:text-white text-lg">✕</button>
                </div>
                <div className="space-y-4 flex-1">
                  <div>
                    <label className="text-[9px] text-zinc-600 font-black uppercase tracking-widest ml-1">Full Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm font-semibold outline-none focus:border-amber-500 transition-all mt-1" />
                  </div>
                </div>
                <button onClick={updateProfile} className="w-full bg-amber-500 text-zinc-950 py-4 rounded-xl font-black uppercase tracking-widest mt-6 shadow-xl shadow-amber-500/20 active:scale-95 transition-all">
                  Save Information
                </button>
              </div>
            )}
          </div>

          {/* ─── CARD 2: Wallet Details (was Bank Details) ─── */}
          <div className="relative bg-[#0c0c0c]/80 backdrop-blur-xl border border-zinc-800/60 rounded-[2rem] p-5 sm:p-8 shadow-2xl overflow-hidden">
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.25em] mb-6">Wallet Details</p>

            <div className="space-y-4">
              {/* External Wallet */}
              <div className="bg-gradient-to-br from-cyan-900/30 to-zinc-900/50 rounded-2xl p-5 border border-cyan-700/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center border border-cyan-500/20 text-cyan-400 text-sm">🔗</div>
                    <div>
                      <p className="text-white font-bold text-sm">External Wallet</p>
                      <p className="text-cyan-400 text-[10px]">{isExtConnected ? 'Connected Web3 Wallet' : 'Link your browser wallet'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${isExtConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                      {isExtConnected ? 'Connected' : 'Disconnected'}
                    </span>
                    {isExtConnected && (
                      <button onClick={handleDisconnectWeb3} className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors p-1" title="Disconnect Wallet">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60">
                  <div>
                    <span className="text-zinc-300 text-xs font-mono block" title={activeExtWallet}>
                      {isExtConnected ? formatAddr(activeExtWallet) : 'Not connected'}
                    </span>
                    {isExtConnected ? (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <button onClick={() => copyToClipboard(activeExtWallet, 'extwallet')} className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-all flex items-center gap-1">
                          {copied === 'extwallet' ? <FiCheck size={10} className="text-emerald-500" /> : <FiCopy size={10} />}
                          {copied === 'extwallet' ? 'Copied' : 'Copy Address'}
                        </button>
                        <a
                          href={`${import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app'}/address/${activeExtWallet}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-zinc-400 hover:text-cyan-400 transition-all flex items-center gap-1"
                        >
                          <FiExternalLink size={10} /> Explorer
                        </a>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <button
                          onClick={handleConnectWeb3}
                          className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black text-[10px] uppercase py-1.5 px-3 rounded-lg transition-all"
                        >
                          Connect Web3 Wallet
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-cyan-400 text-[9px] font-black uppercase tracking-widest">External Balance</p>
                    <h3 className="text-xl font-black text-white tracking-tighter mt-0.5">
                      {(isExtConnected ? liveExtBalance : 0).toFixed(4)} USDC
                    </h3>
                    {isExtConnected && liveExtBalance > 0 && (
                      <span className="block text-xs text-zinc-400 font-medium mt-0.5">
                        ≈ ${(liveExtBalance * (botPrice > 0 ? botPrice : 1)).toFixed(2)} USD
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Internal Platform Vault */}
              <div className="bg-gradient-to-br from-amber-900/40 to-yellow-900/30 rounded-2xl p-5 border border-amber-700/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20 text-amber-400 text-sm">⚡</div>
                    <div>
                      <p className="text-white font-bold text-sm">Internal Vault</p>
                      <p className="text-amber-300 text-[10px]">USDC Native Gas · Arc Testnet</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 text-[9px] font-black uppercase tracking-widest">Vault Balance</p>
                  <h3 className="text-2xl font-black text-white tracking-tighter mt-0.5">
                    {botBalance > 0 ? botBalance.toFixed(2) : '0.00'} USDC
                    <span className="block text-xs text-zinc-400 font-medium mt-0.5">
                      ≈ ${(botBalance * (botPrice > 0 ? botPrice : 1)).toFixed(2)} USD
                    </span>
                  </h3>
                </div>
              </div>

              {/* Quick Address List */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/40">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Internal Address</span>
                  <div className="flex items-center gap-2">
                    {walletAddr === "Not Generated" ? (
                      <button
                        onClick={handleLinkInternalWallet}
                        disabled={isGenerating}
                        className="px-3 py-1 text-[10px] font-bold bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 rounded-lg transition-all"
                      >
                        {isGenerating ? "Generating..." : "Generate Wallet"}
                      </button>
                    ) : (
                      <>
                        <span className="text-zinc-300 text-xs font-mono" title={walletAddr}>{formatAddr(walletAddr)}</span>
                        <button onClick={() => copyToClipboard(walletAddr, 'wallet')} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-amber-500 transition-all">
                          {copied === 'wallet' ? <FiCheck size={12} className="text-emerald-500" /> : <FiCopy size={12} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/40">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">GlobalPay Tag</span>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-sm font-black">{globalPayTag || '—'}</span>
                    {globalPayTag && (
                      <button onClick={() => copyToClipboard(globalPayTag, 'tag')} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-amber-500 transition-all">
                        {copied === 'tag' ? <FiCheck size={12} className="text-emerald-500" /> : <FiCopy size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── CARD 3: Transaction Graph (Send & Receive) ─── */}
          <div className="relative bg-[#0c0c0c]/80 backdrop-blur-xl border border-zinc-800/60 rounded-[2rem] p-5 sm:p-8 shadow-2xl overflow-hidden">
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.25em] mb-2">Activity Summary</p>

            <div className="flex items-baseline gap-3 mb-1">
              <h3 className="text-xl sm:text-3xl font-black text-white tracking-tighter">{totalSent.toFixed(2)} USDC</h3>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-orange-400"></div>
                <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest">Sent {totalSent.toFixed(2)} USDC</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-violet-500"></div>
                <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest">Received {totalReceived.toFixed(2)} USDC</span>
              </div>
            </div>

            <div className="h-[220px]">
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* ─── CARD 4: Wallet Transactions ─── */}
          <div className="relative bg-[#0c0c0c]/80 backdrop-blur-xl border border-zinc-800/60 rounded-[2rem] p-5 sm:p-8 shadow-2xl overflow-hidden">
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.25em] mb-2">On-Chain Activity</p>

            <div className="flex items-baseline justify-between mb-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tighter">{totalCryptoTx}</h3>
                <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest mt-0.5">Total On-Chain Txs</p>
              </div>
              <span className="text-emerald-500 text-[8px] sm:text-[10px] font-black bg-emerald-500/10 px-2 sm:px-3 py-1 rounded-full border border-emerald-500/20">
                {totalCryptoValue.toFixed(2)} USDC Volume
              </span>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[320px] pr-1 custom-scrollbar">
              {displayExternalPayments.length > 0 ? (
                displayExternalPayments.map((p, i) => {
                  const isSentByMe = isSenderMeExt(p);
                  const txType = p.txType || 'direct';
                  const explorerUrl = import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || "https://testnet.arcscan.app";
                  const hasValidTxHash = typeof p.txHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(p.txHash.trim());
                  const explorerLink = hasValidTxHash ? `${explorerUrl}/tx/${p.txHash.trim()}` : explorerUrl;
                  const targetTag = p.toUPI || p.receiverUPI || p.destinationAddress || 'Recipient';
                  const senderTag = p.sender?.globalPayTag || p.senderUPI || 'Sender';
                  const botAmt = Number(p.botAmountSnapshot || p.botAmount || p.amount || 0);
                  const displayDate = txType === 'scheduled_release'
                    ? (p.releasedAt || p.timestamp)
                    : (p.timestamp || p.date || p.createdAt);
                  const formattedDate = displayDate ? moment(displayDate).format('DD MMM, hh:mm A') : null;

                  // Determine payment label, method badge, icon colour, and amount prefix
                  let title, subtitle, methodLabel, iconColor, iconBg, iconBorder, amtPrefix;
                  switch (txType) {
                    case 'scheduled_funding':
                      title = 'Scheduled Payment';
                      subtitle = 'Funds Locked';
                      methodLabel = 'Scheduled';
                      iconColor = 'text-blue-500';
                      iconBg = 'bg-blue-500/10';
                      iconBorder = 'border-blue-500/20';
                      amtPrefix = '';
                      break;
                    case 'scheduled_release':
                      if (isSentByMe) {
                        title = 'Scheduled Payment Delivered';
                        subtitle = `To ${targetTag}`;
                        amtPrefix = '-';
                      } else {
                        title = 'Scheduled Payment Received';
                        subtitle = `From ${senderTag}`;
                        amtPrefix = '+';
                      }
                      methodLabel = 'Scheduled';
                      iconColor = 'text-amber-500';
                      iconBg = 'bg-amber-500/10';
                      iconBorder = 'border-amber-500/20';
                      break;
                    case 'scheduled_cancellation':
                      title = 'Scheduled Payment Cancelled';
                      subtitle = isSentByMe ? 'Refunded to your wallet' : `Cancelled by ${senderTag}`;
                      methodLabel = 'Scheduled';
                      amtPrefix = '';
                      iconColor = 'text-red-500';
                      iconBg = 'bg-red-500/10';
                      iconBorder = 'border-red-500/20';
                      break;
                    case 'ai':
                      if (isSentByMe) {
                        title = 'AI Payment Sent';
                        subtitle = `To ${targetTag}`;
                        amtPrefix = '-';
                      } else {
                        title = 'AI Payment Received';
                        subtitle = `From ${senderTag}`;
                        amtPrefix = '+';
                      }
                      methodLabel = 'AI Agent';
                      iconColor = isSentByMe ? 'text-purple-500' : 'text-emerald-500';
                      iconBg = isSentByMe ? 'bg-purple-500/10' : 'bg-emerald-500/10';
                      iconBorder = isSentByMe ? 'border-purple-500/20' : 'border-emerald-500/20';
                      break;
                    case 'qr':
                      if (isSentByMe) {
                        title = 'QR Payment Sent';
                        subtitle = `To ${targetTag}`;
                        amtPrefix = '-';
                      } else {
                        title = 'QR Payment Received';
                        subtitle = `From ${senderTag}`;
                        amtPrefix = '+';
                      }
                      methodLabel = 'QR';
                      iconColor = isSentByMe ? 'text-cyan-500' : 'text-emerald-500';
                      iconBg = isSentByMe ? 'bg-cyan-500/10' : 'bg-emerald-500/10';
                      iconBorder = isSentByMe ? 'border-cyan-500/20' : 'border-emerald-500/20';
                      break;
                    case 'request':
                      if (isSentByMe) {
                        title = 'Request Paid';
                        subtitle = `To ${targetTag}`;
                        amtPrefix = '-';
                      } else {
                        title = 'Request Received';
                        subtitle = `From ${senderTag}`;
                        amtPrefix = '+';
                      }
                      methodLabel = 'Request';
                      iconColor = isSentByMe ? 'text-orange-500' : 'text-emerald-500';
                      iconBg = isSentByMe ? 'bg-orange-500/10' : 'bg-emerald-500/10';
                      iconBorder = isSentByMe ? 'border-orange-500/20' : 'border-emerald-500/20';
                      break;
                    default: // direct
                      if (isSentByMe) {
                        title = 'Payment Sent';
                        subtitle = `To ${targetTag}`;
                        amtPrefix = '-';
                      } else {
                        title = 'Payment Received';
                        subtitle = `From ${senderTag}`;
                        amtPrefix = '+';
                      }
                      methodLabel = 'Direct';
                      iconColor = isSentByMe ? 'text-amber-500' : 'text-emerald-500';
                      iconBg = isSentByMe ? 'bg-amber-500/10' : 'bg-emerald-500/10';
                      iconBorder = isSentByMe ? 'border-amber-500/20' : 'border-emerald-500/20';
                  }

                  return (
                    <div key={i} className="flex items-center justify-between gap-3 py-3 px-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/30 hover:border-zinc-700/50 hover:bg-zinc-900/60 transition-all group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-base font-black ${iconColor} ${iconBg} ${iconBorder}`}>
                          ⚡
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="text-white text-xs font-bold truncate">{title}</p>

                            {txType === 'scheduled_funding' && (
                              <span className="px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase border border-blue-500/30 text-blue-500 bg-blue-500/10 shrink-0">
                                Pending Release
                              </span>
                            )}

                            {txType === 'scheduled_cancellation' && (
                              <span className="px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase border border-red-500/30 text-red-500 bg-red-500/10 shrink-0">
                                Cancelled
                              </span>
                            )}

                            {methodLabel && txType !== 'scheduled_funding' && (
                              <span className="px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase border border-zinc-600/30 text-zinc-400 bg-zinc-800/50 shrink-0">
                                {methodLabel}
                              </span>
                            )}

                            {hasValidTxHash && txType !== 'scheduled_funding' && (
                              <a
                                href={explorerLink}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase border border-cyan-500/30 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors flex items-center gap-1 shrink-0"
                              >
                                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></span>
                                ArcScan ↗
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[9px]">
                            <p className="text-zinc-400 truncate max-w-[140px]">{subtitle}</p>
                            {formattedDate && (
                              <p className="text-zinc-500 shrink-0 font-bold">{formattedDate}</p>
                            )}
                          </div>

                          {(txType === 'scheduled_funding' || txType === 'scheduled_release') && (
                            <>
                              {(p.scheduledAt || p.release_at) && (
                                <div className="flex items-center gap-2 text-[9px] mt-0.5">
                                  <span className="text-zinc-500">Scheduled for:</span>
                                  <span className="text-zinc-300 font-bold">
                                    {moment(p.scheduledAt || Number(p.release_at) * 1000).format('DD MMM, hh:mm A')}
                                  </span>
                                </div>
                              )}
                              {txType === 'scheduled_funding' && p.receiverWalletAddress && (
                                <div className="flex items-center gap-2 text-[9px] mt-0.5">
                                  <span className="text-zinc-500">Wallet:</span>
                                  <span className="text-zinc-400 font-mono truncate max-w-[160px]">
                                    {p.receiverWalletAddress}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-sm font-black ${isSentByMe || txType === 'scheduled_funding' ? 'text-white' : 'text-emerald-400'}`}>
                          {amtPrefix}{botAmt.toFixed(2)} USDC
                        </p>
                        {txType === 'scheduled_funding' && (
                          <a
                            href={explorerLink}
                            target="_blank"
                            rel="noreferrer"
                            className="block mt-1 text-[8px] font-bold tracking-wider text-blue-500 hover:text-blue-400 transition-colors"
                          >
                            View funding tx ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4 border border-zinc-800">
                    <FiArrowUpRight className="text-zinc-700" size={24} />
                  </div>
                  <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">No transactions yet</p>
                  <p className="text-zinc-700 text-[9px] mt-1">Your sent payments will appear here</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Profile;
