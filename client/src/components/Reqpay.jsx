import React, { useState, useEffect } from "react";
import { FiFileText, FiClock, FiCheckCircle, FiZap } from "react-icons/fi";
import api, { fetchLiveBotPrice } from "../utils/api";
import QRPaymentModal from "./QRPaymentModal";

const Reqpay = ({
  name,
  sender,
  amount,
  currency,
  requestedAmount,
  requestedCurrency,
  exchangeRateSnapshot,
  botPriceSnapshot,
  botAmountSnapshot,
  status,
  isSentByMe,
  reqId,
  receiverWalletAddress,
  receivingWalletType,
  createdAt,
  onSettle,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [rateDetails, setRateDetails] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(status || "Pending");
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [liveBotPriceState, setLiveBotPriceState] = useState(null);
  const [liveReceiverWallet, setLiveReceiverWallet] = useState(receiverWalletAddress || "");
  const [liveReceivingWalletType, setLiveReceivingWalletType] = useState(receivingWalletType || "internal");

  React.useEffect(() => {
    setCurrentStatus(status || "Pending");
  }, [status]);

  React.useEffect(() => {
    const updateBotPrice = () => {
      fetchLiveBotPrice().then(price => {
        if (price > 0) setLiveBotPriceState(price);
      });
    };
    updateBotPrice();
    const interval = setInterval(updateBotPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  // Re-resolve receiver's current primary wallet so changes made after invoice
  // creation are reflected at payment time.
  useEffect(() => {
    if (isSentByMe || currentStatus === "Paid" || currentStatus === "Completed" || currentStatus === "Settled") return;
    let cancelled = false;
    const resolveReceiver = async () => {
      try {
        const cleanTag = (sender || '').replace(/^@/, '').trim();
        if (!cleanTag) return;
        const res = await api.get(`/auth/fetchdetail?upi=${cleanTag}`);
        const data = res.data;
        if (cancelled) return;
        const isExt = String(data.primaryReceivingWallet || 'internal').toLowerCase() === 'external';
        setLiveReceiverWallet(isExt
          ? (data.metamask || data.receiverWalletAddress || '')
          : (data.internalWalletAddress || data.receiverWalletAddress || ''));
        setLiveReceivingWalletType(isExt ? 'external' : 'internal');
      } catch (err) {
        console.warn("Reqpay: failed to re-resolve receiver wallet:", err.message);
      }
    };
    resolveReceiver();
    return () => { cancelled = true; };
  }, [sender, isSentByMe, currentStatus]);

  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const cached = sessionStorage.getItem("reqpay_user_cache");
        if (cached) {
          const user = JSON.parse(cached);
          setCurrentUser(user);
          const region = user.region || "India";
          const cur = region === "Mexico" ? "MXN" : region === "Brazil" ? "BRL" : "INR";
          setRateDetails({
            currency: cur,
            botPrice: Number(user.bankDetails?.botPrice) || null,
          });
          return;
        }
        const res = await api.get("/auth/fetchdetail");
        const user = res.data;
        sessionStorage.setItem("reqpay_user_cache", JSON.stringify(user));
        setCurrentUser(user);
        const region = user.region || "India";
        const cur = region === "Mexico" ? "MXN" : region === "Brazil" ? "BRL" : "INR";
        setRateDetails({
          currency: cur,
          botPrice: Number(user.bankDetails?.botPrice) || null,
        });
      } catch (err) {
        console.warn("Reqpay: failed to fetch user:", err);
      }
    };
    fetchUser();
  }, []);

  // 24-Hour Countdown Timer Effect
  React.useEffect(() => {
    if (currentStatus === "Paid" || currentStatus === "Completed" || currentStatus === "Settled" || currentStatus === "Expired" || currentStatus === "Rejected") {
      setTimeLeftStr(currentStatus);
      return;
    }

    const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();
    const expiryMs = createdMs + 24 * 60 * 60 * 1000;

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiryMs - now;

      if (diff <= 0) {
        setCurrentStatus("Expired");
        setTimeLeftStr("Expired");
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const hStr = hours > 0 ? `${hours}h ` : "";
        const mStr = `${minutes}m `;
        const sStr = `${seconds}s remaining`;
        setTimeLeftStr(`${hStr}${mStr}${sStr}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [createdAt, currentStatus]);

  // Dynamic live USDC calculation protecting merchant USD value from price fluctuations
  const reqAmount = requestedAmount !== undefined && requestedAmount !== null ? Number(requestedAmount) : Number(amount || 0);
  const reqCurrency = (requestedCurrency || currency || "INR").toUpperCase();
  const rateSnapshot = Number(exchangeRateSnapshot) || 83.5;
  const botPriceSnapshotNum = Number(botPriceSnapshot) || 0;
  // Prefer the live feed, then the invoice's stored live snapshot; the
  // account-level bankDetails.botPrice is a stale fallback only.
  const liveBotPrice = Number(liveBotPriceState || botPriceSnapshotNum || rateDetails?.botPrice || 0);

  // Exact target USD value requested by merchant
  const targetUSD = reqCurrency === "USD" ? reqAmount
    : reqCurrency === "USDC" ? reqAmount
    : (reqAmount / rateSnapshot);
  // Recalculated required USDC amount based on LIVE USDC price so merchant receives exact USD value
  // Fallbacks never treat the USD amount as USDC: prefer the live rate, then the
  // snapshot stored at invoice creation, then the snapshot rate, else a sane floor.
  const liveBotRequiredAmount = reqCurrency === "USDC"
    ? reqAmount
    : (liveBotPrice > 0
      ? (targetUSD / liveBotPrice)
      : (botAmountSnapshot ? Number(botAmountSnapshot)
        : (botPriceSnapshotNum > 0 ? (targetUSD / botPriceSnapshotNum) : 0)));

  // Build the qrData object that QRPaymentModal expects.
  // Uses live-resolved wallet address so receiver's primary wallet changes are picked up.
  const qrData = {
    receiver: sender,
    payTag: sender,
    wallet: liveReceiverWallet || receiverWalletAddress || "",
    amount: Number(liveBotRequiredAmount) || 0,
    memo: name && name !== "Unknown" ? name : "",
    paymentId: reqId || "",
    receivingWalletType: liveReceivingWalletType || receivingWalletType || "internal",
    type: "request",
  };

  const handleSettle = () => {
    if (isSentByMe || currentStatus === "Paid" || currentStatus === "Completed" || currentStatus === "Settled" || currentStatus === "Expired") return;
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    if (onSettle) onSettle();
  };

  const isPaid = currentStatus === "Paid" || currentStatus === "Completed" || currentStatus === "Settled";
  const isExpired = currentStatus === "Expired";

  return (
    <>
      <div
        className={`bg-zinc-900/20 border rounded-xl sm:rounded-2xl w-full overflow-hidden group transition-all duration-200 ${
          isPaid
            ? "border-emerald-500/20"
            : isExpired
            ? "border-red-500/20"
            : "border-zinc-800/50 hover:border-zinc-700/60"
        }`}
      >
        <div className="p-3.5 sm:p-5">
          {/* Top section: icon, title, sender, timer */}
          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center border shrink-0 ${
                isPaid
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : isExpired
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : "bg-blue-500/10 border-blue-500/20 text-blue-400"
              }`}
            >
              <FiFileText size={16} className="sm:w-[18px] sm:h-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-sm sm:text-base truncate max-w-[160px] sm:max-w-[240px]">
                  {name === "Unknown"
                    ? isSentByMe
                      ? "Requested Payment"
                      : "Pending Invoice"
                    : name}
                </span>
                {isExpired && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                    EXPIRED
                  </span>
                )}
                {isPaid && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    PAID
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-zinc-500 text-[11px] sm:text-xs">
                {isSentByMe ? (
                  <FiCheckCircle className="text-emerald-400 shrink-0" size={11} />
                ) : (
                  <FiClock className="text-blue-400 shrink-0" size={11} />
                )}
                <span className="truncate">{isSentByMe ? "To: " : "From: "}{sender}</span>
              </div>
              {!isPaid && !isExpired && (
                <div className="flex items-center gap-1 mt-1 text-amber-400/80 text-[11px] sm:text-xs animate-pulse">
                  <FiClock size={10} />
                  <span className="truncate">{timeLeftStr}</span>
                </div>
              )}
            </div>
          </div>

          {/* Divider on mobile */}
          <div className="sm:hidden border-t border-zinc-800/40 my-3" />

          {/* Bottom section: amount + action */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-zinc-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Amount Due</div>
              <div className="font-black text-base sm:text-xl text-amber-400 tracking-tight mt-0.5">
                {Number(liveBotRequiredAmount).toFixed(4)} USDC
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-500 font-semibold mt-0.5">
                ≈ ${targetUSD.toFixed(2)} USD
              </div>
            </div>

            {isPaid ? (
              <button disabled className="px-4 sm:px-6 py-2 sm:py-2.5 bg-emerald-950/30 text-emerald-400 rounded-xl font-bold text-[11px] sm:text-sm tracking-wider border border-emerald-500/30 cursor-not-allowed flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <FiCheckCircle size={13} /> Paid
              </button>
            ) : isExpired ? (
              <button disabled className="px-4 sm:px-6 py-2 sm:py-2.5 bg-red-950/30 text-red-400 rounded-xl font-bold text-[11px] sm:text-sm tracking-wider border border-red-500/30 cursor-not-allowed shrink-0 whitespace-nowrap">
                Expired
              </button>
            ) : isSentByMe ? (
              <button disabled className="px-4 sm:px-6 py-2 sm:py-2.5 bg-zinc-800/50 text-zinc-500 rounded-xl font-bold text-[11px] sm:text-sm tracking-wider border border-zinc-700/50 cursor-not-allowed shrink-0 whitespace-nowrap">
                Awaiting
              </button>
            ) : (
              <button
                onClick={handleSettle}
                className="px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold text-[11px] sm:text-sm tracking-wider shadow-lg transition-all border border-blue-400/30 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <FiZap size={12} /> Settle
              </button>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <QRPaymentModal
          isOpen={showModal}
          onClose={handleClose}
          qrData={qrData}
          user={currentUser}
        />
      )}
    </>
  );
};

export default Reqpay;
