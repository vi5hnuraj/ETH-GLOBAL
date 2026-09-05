import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { axis, hdfc, icici, pnb, sbi } from '../assets';
import { FiFileText, FiLock, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

const regionBanks = {
  India: [
    { name: 'State Bank of India', description: 'State Bank of India is the largest public sector bank in India.', logo: sbi },
    { name: 'Punjab National Bank', description: 'Punjab National Bank is a leading public sector bank in India.', logo: pnb },
    { name: 'HDFC Bank', description: 'HDFC Bank is a major private sector bank in India.', logo: hdfc },
    { name: 'ICICI Bank', description: 'ICICI Bank is a prominent private sector bank in India.', logo: icici },
    { name: 'Axis Bank', description: 'Axis Bank is a well-known private sector bank in India.', logo: axis },
  ],
  Brazil: [
    { name: 'Nubank', description: 'Nubank is the largest fintech bank in Latin America.', logo: 'https://ui-avatars.com/api/?name=Nubank&background=820ad1&color=fff' },
    { name: 'Itaú Unibanco', description: 'Itaú is the largest private sector bank in Brazil.', logo: 'https://ui-avatars.com/api/?name=Itau+Unibanco&background=ec7000&color=fff' },
    { name: 'Banco do Brasil', description: 'Banco do Brasil is the oldest active bank in Brazil.', logo: 'https://ui-avatars.com/api/?name=Banco+do+Brasil&background=f9d300&color=003a8c' },
    { name: 'Bradesco', description: 'Bradesco is one of the biggest banking and financial companies in Brazil.', logo: 'https://ui-avatars.com/api/?name=Bradesco&background=cc092f&color=fff' }
  ],
  Mexico: [
    { name: 'BBVA México', description: 'BBVA is the largest financial institution in Mexico.', logo: 'https://ui-avatars.com/api/?name=BBVA+Mexico&background=004481&color=fff' },
    { name: 'Banorte', description: 'Banorte is one of the largest and oldest banks in Mexico.', logo: 'https://ui-avatars.com/api/?name=Banorte&background=eb0029&color=fff' },
    { name: 'Santander México', description: 'Santander is a leading bank in the Mexican financial sector.', logo: 'https://ui-avatars.com/api/?name=Santander+Mexico&background=ec0000&color=fff' },
    { name: 'Citibanamex', description: 'Citibanamex is one of the major banks in Mexico.', logo: 'https://ui-avatars.com/api/?name=Citibanamex&background=003b70&color=fff' }
  ]
};

const Bank = () => {
  const navigate = useNavigate();
  const [selectedBank, setSelectedBank] = useState(null);
  const [togglebox, setTogglebox] = useState(false);
  const [upiId, setUPI] = useState('');
  const [metamaskId, setMetamaskId] = useState('');
  const [region, setRegion] = useState('India');
  const [paymentIdType, setPaymentIdType] = useState('UPI');
  const [formData, setFormData] = useState({
    accountNumber: '',
    ifscCode: '',
    accountHolder: '',
    accountAddress: 'Not Required',
    accountType: '',
    amount: 0,
    customPayTag: '',
  });
  const [userEmail, setUserEmail] = useState('');
  const [liveRates, setLiveRates] = useState({ INR: 83, BRL: 5.1, MXN: 17.5 }); // fallback
  const [ratesLoading, setRatesLoading] = useState(true);
  const [userBankData, setUserBankData] = useState(null);
  const [fetchingUser, setFetchingUser] = useState(true);

  // Live exchange rates — no API key needed
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR,BRL,MXN');
        const data = await res.json();
        if (data.rates) setLiveRates(data.rates);
      } catch (err) {
        console.warn('Using fallback rates:', err.message);
      } finally {
        setRatesLoading(false);
      }
    };
    fetchRates();
  }, []);

  const getCurrencyCode = () => {
    if (region === 'Brazil') return 'BRL';
    if (region === 'Mexico') return 'MXN';
    return 'INR';
  };

  const getUSDCPreview = () => {
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return null;
    const code = getCurrencyCode();
    const rate = liveRates[code] || 83;
    return (amt / rate).toFixed(4);
  };

  // Prefill user info from cookies/backend
  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setFetchingUser(false);
        return;
      }

      try {
        const res = await api.get('/auth/fetchdetail', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const user = res.data.data?.user || res.data;
        setUserEmail(user.email);
        setUPI(user.upi || '');
        setMetamaskId(user.metamask || '');

        if (user.bankDetails && (user.bankDetails.bankName || user.bankDetails.ifsc || user.bankDetails.ifscCode)) {
          setUserBankData(user.bankDetails);
        }
      } catch (err) {
        console.error("Fetch user error:", err.response?.data || err.message);
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('userRole');
          window.location.href = '/login';
        }
      } finally {
        setFetchingUser(false);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    setSelectedBank(null); // Clear selected bank when region changes
    if (region === 'India') setPaymentIdType('UPI');
    if (region === 'Brazil') setPaymentIdType('Pix');
    if (region === 'Mexico') setPaymentIdType('SPEI');
  }, [region]);

  const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleBankSelection = (bank) => setSelectedBank(bank);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return alert('Please login first');
    if (!selectedBank) return alert('Select a bank first');

    const toastId = toast.loading(`Generating ${paymentIdType}...`);

    // Calculate USDC using live rate
    const code = getCurrencyCode();
    const rate = liveRates[code] || 83;
    const usdcBalance = parseFloat((Number(formData.amount) / rate).toFixed(4));

    try {
      const { data } = await api.post(
        '/bank/add',
        { ...formData, bankName: selectedBank.name, region, usdcBalance },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { upiId: generatedUpiId } = data;
      setUPI(generatedUpiId);
      toast.success(`Bank details added! Local ID: ${generatedUpiId}`, { id: toastId });
      setTogglebox(true);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Error adding bank details', { id: toastId });
    }
  };

  const linkHandler = async () => {
    setTogglebox(false);
    navigate('/web3-kyc');
  };


  if (fetchingUser) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-400">Loading Bank Profile...</div>;
  }

  if (userBankData) {
    return (
      <div className="min-h-screen w-full bg-black text-white p-4 sm:p-5 pt-6 sm:pt-10 border-t border-zinc-800 font-sans flex items-center justify-center">
        <div className="mt-4 sm:mt-8 w-full max-w-3xl bg-[#0a0a0e] rounded-2xl border border-zinc-800 p-5 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />

          <div className="flex items-center gap-3 mb-8 border-b border-zinc-800 pb-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 text-xl" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Bank KYC Details</h2>
              <p className="text-zinc-400 text-sm">Your registered domestic bank information.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/50 border border-zinc-800 p-5 rounded-xl">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Bank Name</p>
              <p className="text-lg font-medium text-white">{userBankData.bankName || 'Not Provided'}</p>
            </div>
            <div className="bg-black/50 border border-zinc-800 p-5 rounded-xl">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Account Number</p>
              <div className="flex items-center gap-2">
                <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <p className="text-lg font-mono text-white">
                  {userBankData.accountNumber
                    ? `••••${userBankData.accountNumber.slice(-4)}`
                    : 'Not Provided'}
                </p>
              </div>
            </div>
            <div className="bg-black/50 border border-zinc-800 p-5 rounded-xl">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Routing / IFSC Code</p>
              <p className="text-lg font-mono text-white">{userBankData.ifsc || userBankData.ifscCode || 'Not Provided'}</p>
            </div>
            <div className="bg-black/50 border border-zinc-800 p-5 rounded-xl">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">KYC Status</p>
              <div className="flex items-center gap-2">
                <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <p className="text-lg font-medium text-emerald-500">Verified & Linked</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button onClick={() => navigate('/overview')} className="w-full bg-zinc-800 hover:bg-zinc-700 py-4 rounded-xl font-bold transition-all">Return to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="min-h-screen text-white flex items-center justify-center p-4 sm:p-10">
        <div className="w-full max-w-4xl bg-zinc-800 border-zinc-700 border-[1px] rounded-lg shadow-lg p-4 sm:p-6 flex flex-col md:flex-row relative">
          {/* Left: Region & Bank selection */}
          <div className="w-full md:w-1/2 p-4 sm:p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-4 text-amber-400">Select Region</h2>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-white"
              >
                <option value="India">India 🇮🇳 (UPI)</option>
                <option value="Brazil">Brazil 🇧🇷 (Pix)</option>
                <option value="Mexico">Mexico 🇲🇽 (SPEI)</option>
              </select>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-4 text-amber-400">Select Bank</h2>
              <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                {regionBanks[region]?.map((bank) => (
                  <button
                    key={bank.name}
                    onClick={() => handleBankSelection(bank)}
                    className={`w-full py-3 px-4 rounded-lg transition-colors ${selectedBank?.name === bank.name
                        ? 'bg-amber-600'
                        : 'bg-zinc-700 border-zinc-800 border-[1px] hover:bg-zinc-600'
                      }`}
                  >
                    <div className="flex items-center">
                      <img
                        src={bank.logo}
                        alt={bank.name}
                        className="h-8 w-8 mr-4 rounded-full bg-white object-contain p-1"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Bank_icon_black.svg/512px-Bank_icon_black.svg.png';
                        }}
                      />
                      <span>{bank.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Bank form */}
          <div className="w-full md:w-1/2 p-4 sm:p-6">
            {selectedBank ? (
              <>
                <h2 className="text-2xl font-bold mb-4 text-amber-400">{selectedBank.name}</h2>
                <p className="mb-4 text-zinc-400">{selectedBank.description}</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="accountNumber" className="block mb-2 text-sm text-zinc-300">Account Number</label>
                    <input
                      type="text"
                      name="accountNumber"
                      id="accountNumber"
                      value={formData.accountNumber}
                      onChange={handleInputChange}
                      placeholder="e.g. 0123456789"
                      className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="ifscCode" className="block mb-2 text-sm text-zinc-300">
                      {region === 'India' && 'IFSC Code'}
                      {region === 'Brazil' && 'Agência / Branch Number'}
                      {region === 'Mexico' && 'CLABE (18-digit)'}
                    </label>
                    <input
                      type="text"
                      name="ifscCode"
                      id="ifscCode"
                      value={formData.ifscCode}
                      onChange={handleInputChange}
                      placeholder={region === 'India' ? 'e.g. SBIN0000001' : region === 'Brazil' ? 'e.g. 1234-5' : 'e.g. 012345678901234567'}
                      className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="accountHolder" className="block mb-2 text-sm text-zinc-300">Account Holder</label>
                    <input
                      type="text"
                      name="accountHolder"
                      id="accountHolder"
                      value={formData.accountHolder}
                      onChange={handleInputChange}
                      placeholder="e.g. Satoshi Nakamoto"
                      className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="accountType" className="block mb-2 text-sm text-zinc-300">Account Type</label>
                    <select
                      name="accountType"
                      id="accountType"
                      value={formData.accountType}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    >
                      <option value="">Select Account Type</option>
                      <option value="Savings">Savings</option>
                      <option value="Current">Current</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="customPayTag" className="block mb-2 text-sm text-zinc-300">Claim your Pay Tag (Optional)</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 font-bold">@</div>
                      <input
                        type="text"
                        name="customPayTag"
                        id="customPayTag"
                        value={formData.customPayTag}
                        onChange={handleInputChange}
                        placeholder="e.g. satoshi"
                        className="w-full pl-8 pr-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-white placeholder-zinc-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label htmlFor="amount" className="block mb-2 text-sm text-zinc-300">
                        Amount ({region === 'Brazil' ? 'R$' : region === 'Mexico' ? 'MX$' : '₹'})
                      </label>
                      <input
                        type="number"
                        name="amount"
                        id="amount"
                        value={formData.amount}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 rounded-lg bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block mb-2 text-sm text-zinc-300">
                        Amount (USDC)
                      </label>
                      <div className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-amber-400 flex items-center h-[42px]">
                        {ratesLoading ? (
                          <span className="text-sm text-zinc-500">Loading...</span>
                        ) : (
                          <span className="text-sm font-bold">${getUSDCPreview() || '0.00'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Live Rate Info */}
                  <div className="mt-1 flex items-center justify-start px-1">
                    <span className="text-[10px] text-zinc-500">
                      {ratesLoading ? '' : `Live rate: 1 USD = ${liveRates[getCurrencyCode()]} ${getCurrencyCode()}`}
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 px-4 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-500 transition-colors mt-4 shadow-lg"
                  >
                    Generate {paymentIdType} & Next
                  </button>
                </form>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-center text-zinc-500">Please select a bank to proceed.</p>
              </div>
            )}
          </div>

          {/* Success Popup */}
          {togglebox && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 rounded-lg">
              <div className="flex flex-col border border-zinc-700 bg-zinc-900 rounded-xl p-8 w-[90%] max-w-md shadow-2xl items-center text-center">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
                  <FiCheckCircle size={40} className="text-green-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Fiat Setup Complete!</h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Your domestic banking profile has been successfully linked and verified.
                </p>
                <div className="bg-black/50 border border-zinc-800 rounded-xl p-4 w-full mb-8">
                  <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold block mb-1">Generated Local ID</span>
                  <span className="text-lg font-mono text-amber-400">{upiId}</span>
                </div>
                <button
                  onClick={linkHandler}
                  className="w-full px-4 py-4 bg-amber-600 font-bold rounded-lg hover:bg-amber-500 transition-colors shadow-lg text-white"
                >
                  Proceed to Web3 Identity (KYC)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Bank;
