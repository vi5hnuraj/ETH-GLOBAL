import React, { useState } from 'react';
import { FiSend, FiDownload, FiCopy, FiCheck, FiCamera } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import QRScannerModal from '../QRScannerModal';
import QRPaymentModal from '../QRPaymentModal';

const BridgePanel = ({ userData }) => {
  const [copied, setCopied] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedQRData, setScannedQRData] = useState(null);
  const navigate = useNavigate();

  const internalAddr = userData?.internalWalletAddress || '';
  const globalPayTag = userData?.globalPayTag || '';

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`Copied ${label}!`, { duration: 1200 });
    setTimeout(() => setCopied(''), 1500);
  };

  const handleScanSuccess = (decodedData) => {
    setScannedQRData(decodedData);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between shadow-lg mb-6 gap-4 font-sans">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-sm text-zinc-400 font-bold tracking-widest uppercase">Quick Actions</p>
          <p className="text-xs text-zinc-500 mt-1">Blockchain Payment Ecosystem</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate('/payments')}
          className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all shadow-md text-xs"
        >
          <FiSend size={14} /> Send ETH
        </button>

        <button
          onClick={() => navigate('/payments')}
          className="bg-secondary hover:bg-secondary text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all shadow-md text-xs"
        >
          <FiDownload size={14} /> Receive ETH
        </button>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all shadow-md text-xs"
        >
          <FiCamera size={14} /> Scan QR 📷
        </button>

        <button
          onClick={() => copyToClipboard(internalAddr, 'Wallet Address')}
          disabled={!internalAddr}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all text-xs border border-zinc-700 disabled:opacity-50"
        >
          {copied === 'Wallet Address' ? <FiCheck size={14} className="text-emerald-400" /> : <FiCopy size={14} />}
          Copy Wallet
        </button>

        <button
          onClick={() => copyToClipboard(globalPayTag, 'GlobalPay Tag')}
          disabled={!globalPayTag}
          className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all text-xs border border-zinc-700 disabled:opacity-50"
        >
          {copied === 'GlobalPay Tag' ? <FiCheck size={14} className="text-emerald-400" /> : <FiCopy size={14} />}
          Copy Tag
        </button>
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

export default BridgePanel;
