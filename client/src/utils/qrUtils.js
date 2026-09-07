/**
 * GlobalPay QR Code Utility
 * Production-ready JSON QR payload builder, decoder, and validator for Arc Mainnet.
 */

export const ARC_CHAIN_NETWORK = "ARC_CHAIN";
export const QR_VERSION = 1;

/**
 * Generate a standardized merchant QR code payload
 */
export const createQRPayload = ({ wallet = "", payTag = "", amount = 0, memo = "", paymentId = "", usdAmount = 0, usdcPriceSnapshot = null }) => {
  return JSON.stringify({
    version: QR_VERSION,
    network: ARC_CHAIN_NETWORK,
    wallet: wallet.trim(),
    payTag: payTag.startsWith('@') ? payTag.trim() : (payTag ? `@${payTag.trim()}` : ""),
    amount: Number(amount) > 0 ? Number(amount) : 0,
    usdAmount: Number(usdAmount) > 0 ? Number(usdAmount) : 0,
    usdcPriceSnapshot: Number(usdcPriceSnapshot) > 0 ? Number(usdcPriceSnapshot) : null,
    memo: memo.trim(),
    paymentId: paymentId || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Math.floor(Date.now() / 1000)
  });
};

/**
 * Decode and validate a raw QR code string.
 * Supports:
 * 1. Standard GlobalPay JSON payload
 * 2. Plain PayTag (e.g. @merchant or merchant)
 * 3. Plain EVM Wallet address (0x...)
 * 4. URI scheme (arc:0x...?amount=10&memo=...)
 * 5. URL with query parameters (http://localhost:5173/payments?upi=@merchant&amount=10)
 */
export const parseAndValidateQR = (rawString) => {
  if (!rawString || typeof rawString !== 'string') {
    return { isValid: false, error: "Empty or invalid QR code string." };
  }

  const str = rawString.trim();

  // 1. Try parsing JSON format
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const data = JSON.parse(str);
      const recipient = data.payTag || data.wallet || data.upi || data.to || data.sender || data.receiver || data.address || data.globalPayTag || data.upiId || "";
      const amt = data.amount || data.amt || data.value || data.requestedAmount || data.usdcAmount || 0;
      const memo = data.memo || data.keyword || data.note || "";
      const paymentId = data.paymentId || data.reqId || data._id || data.id || "";

      if (recipient || amt > 0 || paymentId) {
        const cleanRecipient = String(recipient).trim();
        return {
          isValid: true,
          data: {
            version: data.version || 1,
            network: "Arc Mainnet",
            wallet: cleanRecipient.startsWith('0x') ? cleanRecipient : (data.wallet || ""),
            payTag: cleanRecipient.startsWith('@') ? cleanRecipient : (cleanRecipient ? `@${cleanRecipient}` : ""),
            receiver: cleanRecipient || "@merchant",
            amount: Number(amt) > 0 ? Number(amt) : "",
            usdAmount: Number(data.usdAmount) > 0 ? Number(data.usdAmount) : "",
            usdcPriceSnapshot: Number(data.usdcPriceSnapshot) > 0 ? Number(data.usdcPriceSnapshot) : null,
            memo: memo,
            paymentId: paymentId,
            timestamp: data.timestamp || Math.floor(Date.now() / 1000)
          }
        };
      }
    } catch (e) {
      // Fall through to plain text parsing
    }
  }

  // 2. Try URL parsing
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const url = new URL(str);
      const recipient = url.searchParams.get("upi") || url.searchParams.get("payTag") || url.searchParams.get("to") || url.searchParams.get("receiver") || url.searchParams.get("wallet") || "";
      const amt = url.searchParams.get("amount") || url.searchParams.get("amt") || url.searchParams.get("value") || "";
      const memo = url.searchParams.get("memo") || url.searchParams.get("keyword") || "";
      const paymentId = url.searchParams.get("reqId") || url.searchParams.get("paymentId") || url.searchParams.get("id") || "";

      if (recipient || amt) {
        return {
          isValid: true,
          data: {
            version: 1,
            network: "Arc Mainnet",
            wallet: recipient.startsWith('0x') ? recipient : "",
            payTag: recipient.startsWith('@') ? recipient : (recipient ? `@${recipient}` : ""),
            receiver: recipient || "@merchant",
            amount: Number(amt) > 0 ? Number(amt) : "",
            memo: memo,
            paymentId: paymentId,
            timestamp: Math.floor(Date.now() / 1000)
          }
        };
      }
    } catch (e) {}
  }

  // 3. Try EVM Wallet Address (0x...)
  const matchAddress = str.match(/0x[a-fA-F0-9]{40}/);
  if (matchAddress) {
    return {
      isValid: true,
      data: {
        version: 1,
        network: "Arc Mainnet",
        wallet: matchAddress[0],
        payTag: "",
        receiver: matchAddress[0],
        amount: "",
        memo: "",
        paymentId: "",
        timestamp: Math.floor(Date.now() / 1000)
      }
    };
  }

  // 4. Try PayTag / Any non-empty text string fallback
  if (str.length > 0) {
    const cleanStr = str.replace(/["'{}]/g, '').trim();
    const tag = cleanStr.startsWith('@') ? cleanStr : (cleanStr.includes('@') ? cleanStr : `@${cleanStr}`);
    return {
      isValid: true,
      data: {
        version: 1,
        network: "Arc Mainnet",
        wallet: "",
        payTag: tag,
        receiver: tag,
        amount: "",
        memo: "",
        paymentId: "",
        timestamp: Math.floor(Date.now() / 1000)
      }
    };
  }

  return {
    isValid: false,
    error: "No valid QR payload found."
  };
};
