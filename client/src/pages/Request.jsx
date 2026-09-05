// src/pages/Request.jsx
import React, { useEffect, useState } from "react";
import Reqpay from "../components/Reqpay";
import api from "../utils/api"; // correct path based on your project

// Try to find a "requests" array inside arbitrary nested objects/arrays.
// Returns the first array that looks like request items (objects having name/sender/amount keys).
const findRequestsArray = (obj, depth = 6, seen = new WeakSet()) => {
  if (!obj || depth <= 0) return null;
  if (typeof obj !== "object") return null;
  if (seen.has(obj)) return null;
  seen.add(obj);

  if (Array.isArray(obj)) {
    const arr = obj;
    // quick heuristic: check if items look like requests
    const matches = arr.filter((it) => {
      if (!it || typeof it !== "object") return false;
      return ("name" in it) || ("sender" in it) || ("amount" in it) || ("amt" in it);
    });
    if (matches.length > 0) return arr;
    // otherwise search inside array items
    for (const it of arr) {
      const found = findRequestsArray(it, depth - 1, seen);
      if (found) return found;
    }
    return null;
  }

  // obj is plain object: check common keys first
  const candidates = ["requests", "data", "docs", "items", "list"];
  for (const key of candidates) {
    if (obj[key]) {
      const maybe = findRequestsArray(obj[key], depth - 1, seen);
      if (maybe) return maybe;
    }
  }

  // fallback: search all properties
  for (const key of Object.keys(obj)) {
    try {
      const val = obj[key];
      if (val && typeof val === "object") {
        const found = findRequestsArray(val, depth - 1, seen);
        if (found) return found;
      }
    } catch (e) {
      // ignore circular or stringify issues
    }
  }

  return null;
};

const sanitizeItem = (item, idx) => {
  if (!item || typeof item !== "object") {
    return {
      _id: `req_${Date.now()}_${idx}`,
      name: "Unknown",
      sender: "Unknown",
      amount: 0,
      currency: "INR",
      requestedAmount: 0,
      requestedCurrency: "INR",
      exchangeRateSnapshot: 83.5,
      botPriceSnapshot: 9.72,
      botAmountSnapshot: 0.1067,
      status: "Pending",
    };
  }
  return {
    _id: item._id || item.id || `req_${Date.now()}_${idx}`,
    name: item.name || item.requesterName || item.username || "Unknown",
    sender: item.sender || item.from || item.ownerUpi || item.ownerMetamask || "Unknown",
    amount: item.amount || item.amt || item.value || 0,
    ownerUpi: item.ownerUpi,
    ownerMetamask: item.ownerMetamask,
    currency: item.currency || "INR",
    requestedAmount: item.requestedAmount !== undefined ? item.requestedAmount : (item.amount || 0),
    requestedCurrency: item.requestedCurrency || item.currency || "INR",
    exchangeRateSnapshot: item.exchangeRateSnapshot || 83.5,
    botPriceSnapshot: item.botPriceSnapshot || 9.72,
    botAmountSnapshot: (item.botAmountSnapshot !== undefined && item.botAmountSnapshot !== null) ? Number(item.botAmountSnapshot) : null,
    status: item.status || "Pending",
    receiverWalletAddress: item.receiverWalletAddress || item.ownerWalletAddress || null,
    receivingWalletType: item.receivingWalletType || item.ownerWalletType || null,
    createdAt: item.createdAt || item.created_at || item.requestedAt || new Date().toISOString(),
  };
};

const Request = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInbox = async () => {
    try {
      const res = await api.get("/money-transfer/requests?type=inbox");
      const arr = Array.isArray(res.data) ? res.data : (res.data?.requests || []);
      arr.sort((a, b) => new Date(b.createdAt || b.created_at || b.requestedAt || 0) - new Date(a.createdAt || a.created_at || a.requestedAt || 0));

      const normalized = arr.map((it, i) => {
        const sanitized = sanitizeItem(it, i);
        return {
          ...sanitized,
          isSentByMe: false,
          displaySender: sanitized.sender
        };
      });
      setData(normalized);
    } catch (err) {
      console.error("[Request] fetch error:", err);
      setError("Failed to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchInbox();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-zinc-500 text-sm">Loading request history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {data.length === 0 ? (
        <div className="py-16 flex items-center justify-center bg-zinc-900/10 border border-zinc-800/40 rounded-xl sm:rounded-2xl">
          <p className="text-zinc-500 italic text-sm">No pending invoices.</p>
        </div>
      ) : (
        data.map((elem) => (
          <Reqpay
            key={elem._id}
            name={elem.name}
            sender={elem.sender}
            amount={elem.amount}
            currency={elem.currency}
            requestedAmount={elem.requestedAmount}
            requestedCurrency={elem.requestedCurrency}
            exchangeRateSnapshot={elem.exchangeRateSnapshot}
            botPriceSnapshot={elem.botPriceSnapshot}
            botAmountSnapshot={elem.botAmountSnapshot}
            status={elem.status}
            isSentByMe={elem.isSentByMe}
            reqId={elem._id}
            receiverWalletAddress={elem.receiverWalletAddress}
            receivingWalletType={elem.receivingWalletType}
            createdAt={elem.createdAt}
            onSettle={fetchInbox}
          />
        ))
      )}
    </div>
  );
};

export default Request;
