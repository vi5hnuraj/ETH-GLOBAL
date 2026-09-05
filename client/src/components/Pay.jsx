import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import "../index.css";
import api, { refreshUserCache } from "../utils/api";
import { getMpcAccount } from "../utils/mpcWallet";
import { ethers } from "ethers";
import { useExternalWallet } from "../hooks/useExternalWallet";
import { getExternalProvider, waitForExternalProvider, getExternalSigner, sendExternalTransfer } from "../utils/externalPayment";
import ConfirmPaymentModal from "./ConfirmPaymentModal";
import {
  FiZap,
  FiShield,
  FiCreditCard,
  FiCheck,
  FiCheckCircle,
  FiX,
  FiUser,
  FiExternalLink,
} from "react-icons/fi";
import { toast } from "react-hot-toast";

const Pay = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [upi, setUpi] = useState(searchParams.get("upi") || "");
  const [option, setOption] = useState("USDC");
  const [amount, setAmount] = useState(searchParams.get("amount") || "");
  const [keyword, setKeyword] = useState(searchParams.get("memo") || "");
  const [loading, setLoading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const [walletRail, setWalletRail] = useState("internal");
  const [internalBal, setInternalBal] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [successData, setSuccessData] = useState(null);

  const ext = useExternalWallet();
  const token = localStorage.getItem("token");

  const [botPrice, setBotPrice] = useState(9.72);

  useEffect(() => {
    const fetchUserRegion = async () => {
      if (!token) return;
      try {
        const userRes = await api.get("/auth/fetchdetail", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = userRes.data;
        setCurrentUser(user);
        setInternalBal(Number(user?.bankDetails?.internalBalance || 0));
        const bd = user?.bankDetails;
        if (bd?.botPrice) setBotPrice(Number(bd.botPrice));
      } catch (err) {
        console.warn("Failed to fetch user region:", err);
      }
    };
    fetchUserRegion();
  }, [token]);

  const [exchangeRates, setExchangeRates] = useState(null);
  useEffect(() => {
    const fetchAllRates = async () => {
      try {
        const res = await api.get("/bank/exchange-rates");
        setExchangeRates(res.data);
      } catch (err) {
        console.warn("Failed to fetch exchange rates in Pay:", err);
      }
    };
    fetchAllRates();
  }, []);

  const reqCurrency = searchParams.get("reqCurrency") || "";
  const reqCurrencyUpper = reqCurrency.toUpperCase();
  const rateSnapshot =
    Number(searchParams.get("exchangeRateSnapshot")) ||
    exchangeRates?.[reqCurrencyUpper] ||
    (reqCurrencyUpper === "MXN" ? 17.5 : reqCurrencyUpper === "BRL" ? 5.1 : 83.5);
  const botPriceSnapshotVal =
    Number(searchParams.get("botPriceSnapshot")) || botPrice;
  const botAmountSnapshot = Number(searchParams.get("botAmountSnapshot")) || 0;
  const reqStatus = searchParams.get("status") || "Pending";

  // Displayed ETH amount (locked from request or entered manually)
  const displayBotAmt = botAmountSnapshot > 0
    ? botAmountSnapshot
    : amount
    ? (reqCurrencyUpper
        ? Number(amount) / rateSnapshot / botPriceSnapshotVal
        : Number(amount))
    : 0;

  const estimatedGas =
    walletRail === "internal" ? "0.0000 ETH (Vault Gasless)" : "0.0001 ETH";

  const explorerUrl =
    import.meta.env.VITE_EXPLORER_URL || import.meta.env.VITE_BASE_EXPLORER_URL || "https://sepolia.basescan.org";

  // ─── INTERNAL VAULT PAYMENT ───────────────────────────────────────────────
  const handleInternalPay = async () => {
    if (!upi) { toast.error("Enter a recipient UPI / PayTag"); return; }
    if (!displayBotAmt || displayBotAmt <= 0) { toast.error("Enter a valid amount"); return; }
    if (internalBal < displayBotAmt) {
      toast.error(`Insufficient Internal Vault balance (${internalBal.toFixed(4)} USDC)`);
      return;
    }

    const account = getMpcAccount();
    if (!account) {
      toast.error("Internal MPC Wallet not connected yet. Please try again or refresh the page.");
      return;
    }

    // The MPC wallet may have been regenerated server-side (e.g. via Profile
    // "Generate platform Wallet" or the provisioning heal). Refresh the cached
    // user detail before paying so the signing account reflects the live
    // provider_user_id instead of a stale address.
    await refreshUserCache();

    setLoading(true);
    const toastId = toast.loading("Connecting to MPC Wallet & resolving receiver address...");
    const reqId = searchParams.get("reqId");
    // Request IDs are UUIDs in Supabase (with legacy Mongo ObjectIds still
    // accepted). Forward the id so the backend can mark the invoice Paid.
    const validReqId = reqId && (
      /^[0-9a-fA-F]{24}$/.test(reqId) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reqId)
    ) ? reqId : undefined;

    try {
      // 1. Resolve receiver address from API
      const params = upi.startsWith("0x") ? { waddr: upi } : { upi };
      const receiverRes = await api.get("/auth/fetchdetail", { params });
      const receiver = receiverRes.data;

      if (!receiver || !receiver.receiverWalletAddress) {
        throw new Error("Receiver does not have a valid receiving wallet address.");
      }

      const targetDestination = receiver.receiverWalletAddress;

      toast.dismiss(toastId);

      // Convert value to bigint
      const tokenValueBig = BigInt(ethers.utils.parseUnits(displayBotAmt.toFixed(18), 18).toString());

      // Ask for explicit sign-approval before broadcasting — same guarantee an
      // external wallet (MetaMask/OKX) popup provides on the other rail.
      setPendingConfirm({
        to: targetDestination,
        amount: displayBotAmt,
        memo: keyword || "Payment",
        tokenValueBig
      });
      setLoading(false);
      return;
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.response?.data?.message || err.message || "Payment failed.");
      setLoading(false);
    }
  };

  // Execute an already-approved Internal Vault send (invoked from the
  // ConfirmPaymentModal overlay).
  const performInternalSend = async (confirm) => {
    const account = getMpcAccount();
    if (!account) {
      toast.error("Internal MPC Wallet not connected yet. Please try again or refresh the page.");
      setLoading(false);
      setPendingConfirm(null);
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Signing & broadcasting transaction from MPC Wallet...");
    try {
      const txResult = await account.sendTransaction({
        to: confirm.to,
        value: confirm.tokenValueBig
      });

      const txHash = txResult.transactionHash;

      toast.loading("Recording transaction log on GlobalPay...", { id: toastId });

      const reqId = searchParams.get("reqId");
      const validReqId = reqId && (
        /^[0-9a-fA-F]{24}$/.test(reqId) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reqId)
      ) ? reqId : undefined;

      await api.post("/pay/paymentWrite", {
        date: new Date().toISOString(),
        to: upi,
        amt: confirm.amount,
        sender: currentUser?._id || currentUser?.id,
        keyword: confirm.memo || "Payment",
        coin: "USDC",
        txHash: txHash,
        botAmountSnapshot: confirm.amount,
        senderWalletType: "internal",
        destinationAddress: confirm.to,
        reqId: validReqId,
      });

      toast.dismiss(toastId);
      toast.success("Internal MPC Vault Payment Completed!");
      setPendingConfirm(null);
      setSuccessData({
        txHash: txHash,
        amount: confirm.amount,
        receiver: upi,
        timestamp: new Date().toLocaleString(),
        rail: "Internal Vault",
      });
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.response?.data?.message || err.message || "Payment failed.");
      setPendingConfirm(null);
    } finally {
      setLoading(false);
    }
  };

  // ─── EXTERNAL WEB3 PAYMENT ─────────────────────────────────────────────
  const sendExternalPayment = async () => {
    let toastId;
    try {
      if (!token) return alert("You must be logged in to make payments.");
      if (!upi || !option) return alert("Please fill in all fields.");
      if (!displayBotAmt || displayBotAmt <= 0) return alert("Enter a valid amount.");

      // Resolve the connected browser wallet provider fresh at call time
      // (never rely on a stale hook closure right after a connect).
      let rawProvider = getExternalProvider();
      if (!rawProvider) {
        const connected = await ext.connect();
        rawProvider = await waitForExternalProvider();
        if (!connected || !rawProvider) {
          return alert("Please connect your external Web3 wallet to pay.");
        }
      }

      // The signer address is the authoritative identity for the "linked
      // wallet" check.
      const probeSigner = await getExternalSigner(rawProvider);
      const payerAddr = (await probeSigner.getAddress()).toLowerCase();

      const linkedAddr = String(
        currentUser?.metamask || currentUser?.metamaskId || currentUser?.externalWallet || ""
      ).toLowerCase();
      if (linkedAddr && linkedAddr !== payerAddr) {
        alert(
          `Connected wallet (${payerAddr.slice(0, 6)}…${payerAddr.slice(-4)}) is not the external wallet linked to your account. Connect ${linkedAddr.slice(0, 6)}…${linkedAddr.slice(-4)} to pay with this rail.`
        );
        await ext.connect();
        return;
      }

      setLoading(true);

      let receiver;
      try {
        const params = upi.startsWith("0x") ? { waddr: upi } : { upi };
        const receiverRes = await api.get("/auth/fetchdetail", { params });
        receiver = receiverRes.data;
      } catch (err) {
        if (err.response && err.response.status === 404) {
          setLoading(false);
          return alert("Receiver UPI not found or not registered.");
        }
        throw err;
      }

      if (!receiver || !receiver.receiverWalletAddress) {
        setLoading(false);
        return alert("Receiver UPI does not have a valid receiving wallet.");
      }

      const targetDestination = receiver.receiverWalletAddress;

      const botToPay =
        botAmountSnapshot > 0 ? Number(botAmountSnapshot) : Number(amount || 0);
      const tokenAmount = ethers.utils.parseUnits(botToPay.toFixed(18), 18);

      toastId = toast.loading("Awaiting signature from your external Web3 wallet...");

      const tx = await sendExternalTransfer(rawProvider, {
        to: targetDestination,
        valueWei: tokenAmount,
        gasLimit: 21000,
      });

      const txHash = tx.hash;

      toast.loading("Confirming transaction on blockchain...", { id: toastId });

      const reqId = searchParams.get("reqId");
      const fromAddr = payerAddr;
      await api.post("/pay/paymentWrite", {
        date: new Date().toISOString(),
        to: upi,
        amt: displayBotAmt,
        sender: currentUser?._id || currentUser?.id,
        keyword: keyword || "Payment",
        coin: option || "USDC",
        txHash: txHash,
        requestedAmount: reqCurrencyUpper ? amount : undefined,
        requestedCurrency: reqCurrencyUpper ? reqCurrencyUpper : undefined,
        exchangeRateSnapshot: reqCurrencyUpper ? rateSnapshot : undefined,
        botPriceSnapshot: reqCurrencyUpper ? botPriceSnapshotVal : undefined,
        botAmountSnapshot: displayBotAmt,
        senderWalletType: "external",
        destinationAddress: targetDestination,
        senderWalletAddress: fromAddr,
        reqId: reqId || undefined,
      });

      toast.dismiss(toastId);
      toast.success("External Wallet Payment Completed!");
      setSuccessData({
        txHash: txHash,
        amount: botToPay,
        receiver: upi,
        timestamp: new Date().toLocaleString(),
        rail: "External Web3",
        senderWalletType: "external",
      });

      if (searchParams.get("prefillFromRequest")) {
        setTimeout(() => { window.location.href = "/payments?tab=reqpay"; }, 2500);
      }
    } catch (err) {
      console.error("Payment error:", err);
      if (toastId) toast.error(`❌ Payment failed: ${err.reason || err.message}`, { id: toastId });
      else if (typeof err === "object" && err && err.message) alert(`Unexpected error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (walletRail === "external") {
      sendExternalPayment();
    } else {
      handleInternalPay();
    }
  };

  // ─── SUCCESS VIEW ─────────────────────────────────────────────────────────
  if (successData) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col font-sans">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <FiZap size={18} />
            </div>
            <div>
              <h3 className="text-white text-base font-bold tracking-tight">Payment Receipt</h3>
              <p className="text-zinc-400 text-xs font-semibold">Blockchain Settlement</p>
            </div>
          </div>
        </div>

        {/* Success body */}
        <div className="p-6 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 text-3xl shadow-[0_0_25px_rgba(16,185,129,0.3)]">
            <FiCheckCircle />
          </div>
          <div>
            <h4 className="text-emerald-400 text-base font-black uppercase tracking-wider">Payment Confirmed!</h4>
            <p className="text-zinc-400 text-xs mt-1">Verified on Blockchain</p>
          </div>
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 w-full">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Total Paid ({successData.rail})</p>
            <p className="text-3xl font-black text-white tracking-tight mt-1">{successData.amount.toFixed(4)} USDC</p>
            <p className="text-amber-400 text-xs font-bold mt-1">Receiver: {successData.receiver}</p>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 w-full text-left space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-zinc-500">Tx Hash:</span><span className="text-white font-mono truncate max-w-[180px]">{successData.txHash}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Rail:</span><span className="text-amber-400 font-bold">{successData.rail}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Timestamp:</span><span className="text-zinc-300">{successData.timestamp}</span></div>
          </div>
          {String(successData.txHash).startsWith("0x") && (
            <a
              href={`${explorerUrl}/tx/${successData.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg"
            >
              <FiExternalLink size={15} /> View on Basescan ↗
            </a>
          )}
          <button
            onClick={() => {
              const targetPath = successData?.senderWalletType === 'external' ? '/profile' : '/transfers';
              setSuccessData(null);
              window.location.href = targetPath;
            }}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs border border-zinc-700 transition-colors"
          >
            Done
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-500 font-medium">
          <div className="flex items-center gap-1.5"><FiShield className="text-amber-500" /><span>Web3 Vault Protocol</span></div>
          <span>Powered by GlobalPay</span>
        </div>
      </div>
    );
  }

  // ─── PAYMENT FORM VIEW ────────────────────────────────────────────────────
  return (
    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col font-sans">

      {/* Header */}
      <div className="p-5 border-b border-zinc-800/80 flex items-center gap-2.5 bg-zinc-900/50">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
          <FiZap size={18} />
        </div>
        <div>
          <h3 className="text-white text-base font-bold tracking-tight">
            {searchParams.get("prefillFromRequest") ? "Settle Invoice" : "Send Payment"}
          </h3>
          <p className="text-zinc-400 text-xs font-semibold">Blockchain Settlement</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">

        {/* Recipient Input */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest mb-2">
            {searchParams.get("prefillFromRequest") ? "Recipient" : "Recipient UPI / PayTag"}
          </p>
          <div className="flex items-center gap-2">
            <FiUser className="text-zinc-500 shrink-0" size={15} />
            <input
              type="text"
              placeholder="e.g. @merchant_gl"
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              readOnly={!!searchParams.get("prefillFromRequest")}
              style={{ backgroundColor: "transparent", color: "#ffffff" }}
              className={`w-full text-sm font-bold outline-none placeholder-zinc-600 ${
                searchParams.get("prefillFromRequest") ? "cursor-not-allowed opacity-80" : ""
              }`}
            />
          </div>
          {searchParams.get("prefillFromRequest") && (
            <p className="text-amber-500 text-[10px] font-black uppercase tracking-wider mt-2 flex items-center gap-1">
              🔒 Recipient locked by payment request
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-center">
          <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest mb-1.5">
            {searchParams.get("prefillFromRequest") ? "Requested Amount" : "Payment Amount"}
          </p>
          <div className="flex items-center justify-center gap-1.5">
            <input
              type="number"
              step="0.0001"
              placeholder="0.0000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              readOnly={!!reqCurrencyUpper || !!botAmountSnapshot}
              style={{ backgroundColor: "#09090b", color: "#ffffff" }}
              className={`w-full max-w-[200px] text-center text-2xl font-black border border-amber-500/40 rounded-xl px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 transition-all placeholder-zinc-600 ${
                reqCurrencyUpper || botAmountSnapshot ? "opacity-75 cursor-not-allowed border-zinc-700 bg-zinc-950" : ""
              }`}
            />
            <span className="text-amber-400 font-black text-sm">USDC</span>
          </div>
          {(reqCurrencyUpper || botAmountSnapshot > 0) && (
            <p className="text-amber-500 text-[10px] font-black uppercase tracking-wider mt-2 flex items-center justify-center gap-1">
              🔒 Amount locked by payment request
            </p>
          )}
        </div>

        {/* Wallet Rail Selector */}
        <div className="space-y-2">
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Select Payment Wallet</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWalletRail("internal")}
              className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                walletRail === "internal"
                  ? "bg-amber-500/10 border-amber-500 text-white shadow-md"
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-bold text-xs text-amber-400 flex items-center gap-1">
                  <FiShield size={13} /> Internal Vault
                </span>
                {walletRail === "internal" && <FiCheck className="text-amber-400" />}
              </div>
              <span className="text-[11px] font-semibold text-zinc-300">Bal: {internalBal.toFixed(4)} USDC</span>
              <span className="text-[9px] text-zinc-500 mt-1">No extension needed</span>
            </button>

            <button
              type="button"
              onClick={() => setWalletRail("external")}
              className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                walletRail === "external"
                  ? "bg-secondary/10 border-secondary text-white shadow-md"
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-bold text-xs text-secondary flex items-center gap-1">
                  <FiCreditCard size={13} /> External Web3
                </span>
                {walletRail === "external" && <FiCheck className="text-secondary" />}
              </div>
              <span className="text-[11px] font-semibold text-zinc-300">MetaMask / OKX</span>
              <span className="text-[9px] text-zinc-500 mt-1">On-chain signature</span>
            </button>
          </div>
        </div>

        {/* Details Row */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 font-semibold">Payment Memo:</span>
            <input
              type="text"
              placeholder="Memo / Order note"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ backgroundColor: "#09090b", color: "#ffffff" }}
              className="px-2 py-1 border border-zinc-800 rounded-lg text-right text-xs font-semibold placeholder-zinc-600 outline-none focus:border-amber-500 max-w-[170px]"
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 font-semibold">Network:</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Blockchain
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-zinc-800/80 pt-2">
            <span className="text-zinc-400 font-semibold">Estimated Gas:</span>
            <span className="text-zinc-400 font-bold">{estimatedGas}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => { setUpi(""); setAmount(""); setKeyword(""); }}
            disabled={loading}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs border border-zinc-700 transition-colors disabled:opacity-50"
          >
            Clear
          </button>

          {walletRail === "external" && !ext.isConnected ? (
            <button
              type="button"
              onClick={async () => {
                const ok = await ext.connect();
                if (!ok) toast.error("Wallet connection was cancelled or failed.");
              }}
              className="flex-1 py-3 bg-secondary hover:opacity-90 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg"
            >
              <FiCreditCard size={14} /> Connect External Wallet
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={
                loading ||
                !upi ||
                displayBotAmt <= 0 ||
                reqStatus === "Paid" ||
                reqStatus === "Expired"
              }
              className={`flex-1 py-3 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                reqStatus === "Paid"
                  ? "bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 cursor-not-allowed"
                  : reqStatus === "Expired"
                  ? "bg-red-900/40 text-red-400 border border-red-500/30 cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-400 text-zinc-950"
              }`}
            >
              {reqStatus === "Paid" ? (
                <><FiCheckCircle size={14} /> Already Paid</>
              ) : reqStatus === "Expired" ? (
                <><FiX size={14} /> Expired</>
              ) : loading ? (
                <span>Processing...</span>
              ) : (
                <><FiZap size={14} /> Pay {displayBotAmt > 0 ? `${displayBotAmt.toFixed(4)} USDC` : "USDC"}</>
              )}
            </button>
          )}
        </div>

        {/* External wallet hint */}
        {walletRail === "external" && ext.address && (
          <p className="text-center text-[10px] text-zinc-600 font-medium pt-1">
            Paying from external wallet: <span className="text-zinc-400 font-mono">{ext.address.slice(0, 6)}…{ext.address.slice(-4)}</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-500 font-medium">
        <div className="flex items-center gap-1.5"><FiShield className="text-amber-500" /><span>Web3 Vault Protocol</span></div>
        <span>Powered by GlobalPay</span>
      </div>

      {/* Internal Vault sign-approval overlay */}
      <ConfirmPaymentModal
        isOpen={Boolean(pendingConfirm)}
        to={pendingConfirm?.to || ""}
        amountETH={pendingConfirm?.amount || 0}
        memo={pendingConfirm?.memo || ""}
        loading={loading}
        onConfirm={() => performInternalSend(pendingConfirm)}
        onCancel={() => {
          setPendingConfirm(null);
          setLoading(false);
        }}
      />
    </div>
  );
};

export default Pay;
