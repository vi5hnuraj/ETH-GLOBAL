import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { FiCamera, FiEye, FiZap, FiCopy } from 'react-icons/fi';
import { createQRPayload } from '../../utils/qrUtils';
import QRScannerModal from '../QRScannerModal';
import QRPaymentModal from '../QRPaymentModal';
import { fetchLiveBotPrice } from '../../utils/api';

const ScannerComponent = ({ userData }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customUsdAmount, setCustomUsdAmount] = useState('');
  const [botPrice, setBotPrice] = useState(null);
  const [customMemo, setCustomMemo] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedQRData, setScannedQRData] = useState(null);

  useEffect(() => {
    let mounted = true;
    const refreshPrice = async () => {
      const price = await fetchLiveBotPrice();
      if (mounted && price) setBotPrice(price);
    };
    refreshPrice();
    const timer = setInterval(refreshPrice, 15000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  const isExternalPrimary = String(userData?.primaryReceivingWallet || '').toLowerCase() === 'external';
  const extAddress = userData?.metamaskId || userData?.externalWallet || userData?.metamask;

  const wallet = (isExternalPrimary && extAddress && extAddress.startsWith('0x'))
    ? extAddress
    : (userData?.internalWalletAddress || userData?.metamaskId || userData?._id || '');

  const payTag = userData?.globalPayTag || userData?.upiId || (userData?.username ? `@${userData.username}` : (userData?.email ? userData.email : '@merchant'));

  // Standardized merchant QR Code JSON payload
  const qrPayload = createQRPayload({
    wallet,
    payTag,
    amount: Number(customAmount) > 0 ? Number(customAmount) : 0,
    usdAmount: Number(customUsdAmount) > 0 ? Number(customUsdAmount) : 0,
    botPriceSnapshot: botPrice,
    memo: customMemo,
  });

  const handleBotAmountChange = (value) => {
    setCustomAmount(value);
    if (botPrice && Number(value) >= 0) {
      setCustomUsdAmount(value === '' ? '' : (Number(value) * botPrice).toFixed(2));
    }
  };

  const handleUsdAmountChange = (value) => {
    setCustomUsdAmount(value);
    if (botPrice && Number(value) >= 0) {
      setCustomAmount(value === '' ? '' : (Number(value) / botPrice).toFixed(8));
    }
  };

  const handleScanSuccess = (decodedData) => {
    setScannedQRData(decodedData);
  };

  return (
    <div className="bg-zinc-900 font-sans p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col justify-between h-auto min-h-[340px] w-full overflow-hidden">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 w-full mb-3 border-b border-zinc-800/60 pb-2.5">
        <h2 className="text-[11px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5 shrink-0">
          <FiZap className="text-amber-400" /> Web3 QR Code
        </h2>
        <button
          onClick={() => setIsScannerOpen(true)}
          className="text-[10px] font-black bg-amber-500 hover:bg-amber-400 text-zinc-950 px-2.5 py-1 rounded-lg transition-all shadow-md flex items-center gap-1 shrink-0"
        >
          <FiCamera size={12} /> Scan QR 📷
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col items-center justify-center w-full flex-1 my-2">
        {isRevealed ? (
          <div className="flex flex-col items-center w-full space-y-3">
            <div className="flex flex-col items-center bg-white p-3.5 rounded-2xl shadow-2xl border border-zinc-200">
              {payTag || wallet ? (
                <QRCodeSVG value={qrPayload} size={130} level="H" includeMargin={true} />
              ) : (
                <div className="w-[130px] h-[130px] bg-gray-100 flex items-center justify-center text-xs text-zinc-500 font-bold">No PayTag Available</div>
              )}
            </div>

            {/* PayTag Pill Display */}
            <div className="bg-zinc-950 border border-zinc-800 px-3.5 py-1 rounded-full text-amber-400 font-black text-xs tracking-tight truncate max-w-[220px]">
              {payTag || wallet || "No PayTag"}
            </div>

            {/* Optional Amount / Memo Controls for Merchant */}
            <div className="w-full grid grid-cols-2 gap-2 max-w-[280px]">
              <input
                type="number"
                step="any"
                placeholder="USDC Amount"
                value={customAmount}
                onChange={(e) => handleBotAmountChange(e.target.value)}
                style={{ backgroundColor: '#09090b', color: '#ffffff' }}
                className="px-2.5 py-1.5 border border-zinc-800 rounded-xl font-bold text-xs placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all text-center"
              />
              <input
                type="number"
                step="any"
                placeholder="USD Amount"
                value={customUsdAmount}
                onChange={(e) => handleUsdAmountChange(e.target.value)}
                style={{ backgroundColor: '#09090b', color: '#ffffff' }}
                className="px-2.5 py-1.5 border border-zinc-800 rounded-xl font-bold text-xs placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all text-center"
              />
              <input
                type="text"
                placeholder="Memo / Note"
                value={customMemo}
                onChange={(e) => setCustomMemo(e.target.value)}
                style={{ backgroundColor: '#09090b', color: '#ffffff' }}
                className="col-span-2 px-2.5 py-1.5 border border-zinc-800 rounded-xl font-bold text-xs placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all text-center"
              />
            </div>
            <p className="text-[10px] text-zinc-500 font-semibold">
              Rate: 1 USDC = $1.00 USD (Arc Testnet)
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-4 text-center">
            <div className="w-[110px] h-[110px] border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center bg-zinc-950/60 mb-3 opacity-70">
              <span className="text-amber-500 text-3xl font-black">QR</span>
            </div>
            <button
              onClick={() => setIsRevealed(true)}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-2.5 px-6 rounded-xl shadow-lg transition-all text-xs flex items-center gap-2"
            >
              <FiEye size={15} /> Reveal Merchant QR Code
            </button>
          </div>
        )}
      </div>

      {/* Camera Live Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Payment Execution Confirmation Modal */}
      <QRPaymentModal
        isOpen={Boolean(scannedQRData)}
        onClose={() => setScannedQRData(null)}
        qrData={scannedQRData}
        user={userData}
      />

    </div>
  );
};

export default ScannerComponent;
