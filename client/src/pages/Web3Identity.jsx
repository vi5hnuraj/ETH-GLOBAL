import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { FiArrowRight, FiShield, FiHexagon, FiCheck, FiUploadCloud, FiCamera, FiUser } from 'react-icons/fi';
import { ConnectWallet, useAddress } from '../utils/mpcWallet';

const Web3Identity = () => {
  const navigate = useNavigate();
  const walletAddress = useAddress();
  const [selectedProvider, setSelectedProvider] = useState(null); // 'web3' | 'traditional'
  const [flowState, setFlowState] = useState('selection'); // selection, web3_providers, web3_connect, web3_loading, trad_1, trad_2, trad_3, trad_4, trad_5_connect, trad_processing
  const [web3SubProvider, setWeb3SubProvider] = useState(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  const [userData, setUserData] = useState(null);
  const [fetchingUser, setFetchingUser] = useState(true);

  // Trad KYC State
  const [tradForm, setTradForm] = useState({ name: '', dob: '', country: 'IN', address: '' });
  const [docType, setDocType] = useState(null);
  const [docsUploaded, setDocsUploaded] = useState({ front: false, back: false });
  const [selfieDone, setSelfieDone] = useState(false);

  const mainProviders = [
    {
      id: 'web3',
      name: 'Web3 Identity',
      badge: 'Recommended',
      description: 'Gitcoin, World ID, Polygon ID & more — no documents needed.',
      icon: <FiHexagon size={24} className="text-white" />,
      theme: 'purple'
    },
    {
      id: 'traditional',
      name: 'Traditional KYC',
      description: 'Sumsub — Standard ID document upload & selfie verification.',
      icon: <FiShield size={24} className="text-white" />,
      theme: 'blue'
    }
  ];

  const web3Options = [
    { id: 'gitcoin', name: 'Gitcoin Passport', color: 'text-green-400', steps: ['Fetching on-chain stamps...', 'Calculating Humanity Score (34.5)...', 'Verified'] },
    { id: 'worldid', name: 'World ID', color: 'text-blue-400', steps: ['Connecting to Worldcoin Orb...', 'Verifying iris ZK proof...', 'Verified'] },
    { id: 'polygon', name: 'Polygon ID', color: 'text-secondary', steps: ['Requesting Verifiable Credential...', 'Generating ZK Proof on-chain...', 'Verified'] },
    { id: 'civic', name: 'Civic Pass', color: 'text-emerald-400', steps: ['Connecting to Civic Gateway...', 'Issuing identity pass on-chain...', 'Verified'] },
    { id: 'self', name: 'Self Protocol', color: 'text-orange-400', steps: ['Reading passport NFC chip...', 'Anonymous ZK Attestation...', 'Verified'] }
  ];

  const tradProcessingSteps = [
    'Analyzing document security features...',
    'Running biometric face match...',
    'Checking global AML watchlists...',
    'KYC Approved!'
  ];

  const handleInitialVerify = () => {
    if (selectedProvider === 'web3') setFlowState('web3_providers');
    if (selectedProvider === 'traditional') setFlowState('trad_1');
  };

  // Fetch user details
  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setFetchingUser(false);
        return;
      }
      try {
        const res = await api.get('/auth/fetchdetail', { headers: { Authorization: `Bearer ${token}` } });
        setUserData(res.data);
      } catch (err) {
        console.error(err);
      }
      setFetchingUser(false);
    };
    fetchUser();
  }, []);

  // Run mock loading sequences
  useEffect(() => {
    // If wallet is connected during web3_connect, automatically advance to web3_loading
    if (flowState === 'web3_connect' && walletAddress) {
      setFlowState('web3_loading');
    }

    // If wallet is connected during trad_5_connect, automatically advance to trad_processing
    if (flowState === 'trad_5_connect' && walletAddress) {
      setFlowState('trad_processing');
    }

    if (flowState === 'web3_loading' && web3SubProvider) {
      const option = web3Options.find(o => o.id === web3SubProvider);
      if (loadingMsgIdx < option.steps.length - 1) {
        const timer = setTimeout(() => setLoadingMsgIdx(prev => prev + 1), 2000);
        return () => clearTimeout(timer);
      } else {
        setTimeout(() => completeKYC(option.name), 1000);
      }
    }

    if (flowState === 'trad_processing') {
      if (loadingMsgIdx < tradProcessingSteps.length - 1) {
        const timer = setTimeout(() => setLoadingMsgIdx(prev => prev + 1), 2000);
        return () => clearTimeout(timer);
      } else {
        setTimeout(() => completeKYC('Sumsub'), 1000);
      }
    }
  }, [flowState, loadingMsgIdx, web3SubProvider, walletAddress]);
  const completeKYC = async (providerName) => {
    const token = localStorage.getItem('token');
    try {
      if (token) {
        await api.post('/auth/verify-web3-kyc', { kycProvider: providerName, walletAddress }, { headers: { Authorization: `Bearer ${token}` } });
      }
      navigate('/overview');
    } catch (err) {
      console.error(err);
      alert("Web3 KYC Failed: " + (err.response?.data?.message || err.message));
      navigate('/overview'); 
    }
  };

  // ---------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------

  const renderSelection = () => (
    <>
      <div className="text-center mb-10 animate-fadeIn">
        <h1 className="text-3xl font-bold mb-3 tracking-tight text-zinc-100">Identity Verification</h1>
        <p className="text-zinc-400 text-sm font-medium">Choose how you want to verify your identity to unlock global routing.</p>
      </div>
      <div className="flex flex-col gap-5 mb-10 animate-fadeIn">
        {mainProviders.map((provider) => {
          const isSelected = selectedProvider === provider.id;
          const isPurple = provider.theme === 'purple';
          return (
            <button key={provider.id} onClick={() => setSelectedProvider(provider.id)}
              className={`relative w-full p-6 rounded-2xl transition-all duration-300 text-left flex items-center gap-6 group border ${isSelected ? (isPurple ? 'border-secondary bg-secondary/10' : 'border-blue-500 bg-blue-500/10') : 'border-zinc-800 bg-[#121026] hover:border-zinc-600'
                }`}>
              <div className={`w-14 h-14 shrink-0 rounded-xl flex items-center justify-center ${isPurple ? 'bg-gradient-to-br from-secondary to-secondary' : 'bg-gradient-to-br from-blue-500 to-cyan-600'}`}>
                {provider.icon}
              </div>
              <div className="flex-grow pr-4">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-bold text-zinc-100 tracking-tight">{provider.name}</h3>
                  {provider.badge && <span className="px-2.5 py-0.5 bg-secondary text-white text-[10px] font-bold uppercase tracking-widest rounded-full">{provider.badge}</span>}
                </div>
                <p className="text-sm text-zinc-400 font-medium leading-relaxed">{provider.description}</p>
              </div>
              <div className="shrink-0 text-zinc-500">
                {isSelected ? <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isPurple ? 'bg-secondary' : 'bg-blue-500'}`}><FiCheck className="text-white" size={14} /></div> : <FiArrowRight size={20} className="group-hover:text-zinc-300 transition-colors" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col items-center">
        <button onClick={handleInitialVerify} disabled={!selectedProvider} className={`w-full py-4 rounded-xl text-base font-bold transition-all duration-300 ${!selectedProvider ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700' : 'bg-white text-black hover:bg-zinc-200 shadow-xl transform hover:-translate-y-0.5'}`}>
          Continue
        </button>
        <button onClick={() => navigate('/overview')} className="mt-6 text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors">
          Skip for now, keep me on the local tier
        </button>
      </div>
    </>
  );

  const renderWeb3Providers = () => (
    <div className="animate-fadeIn">
      <button onClick={() => setFlowState('selection')} className="text-zinc-500 hover:text-white mb-6 flex items-center gap-2 text-sm font-bold transition-colors">
        <FiArrowRight className="rotate-180" /> Back
      </button>
      <h2 className="text-2xl font-bold mb-6 tracking-tight">Select Web3 Provider</h2>
      <div className="grid gap-4">
        {web3Options.map(opt => (
          <button key={opt.id} onClick={() => { setWeb3SubProvider(opt.id); setFlowState('web3_connect'); }} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 transition-colors flex items-center justify-between group">
            <span className="font-bold">{opt.name}</span>
            <FiArrowRight className={`${opt.color} group-hover:translate-x-1 transition-transform`} />
          </button>
        ))}
      </div>
    </div>
  );

  const renderWeb3Connect = () => (
    <div className="flex flex-col items-center justify-center py-10 animate-fadeIn text-center">
      <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
        <FiShield size={40} className="text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-white mb-4">Connect Wallet to Verify</h2>
      <p className="text-zinc-400 text-sm tracking-wide mb-8">
        You are about to verify your identity using {web3Options.find(o => o.id === web3SubProvider)?.name}. Please connect the wallet you want to link to your global routing profile.
      </p>
      <ConnectWallet theme="dark" className="!w-full !rounded-xl !py-4" />
    </div>
  );

  const renderWeb3Loading = () => {
    const option = web3Options.find(o => o.id === web3SubProvider);
    const msg = option.steps[loadingMsgIdx];
    const isDone = loadingMsgIdx === option.steps.length - 1;
    return (
      <div className="flex flex-col items-center justify-center py-10 animate-fadeIn">
        {!isDone ? (
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-secondary rounded-full animate-spin mb-6"></div>
        ) : (
          <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
            <FiCheck size={30} />
          </div>
        )}
        <h2 className={`text-xl font-bold ${option.color} mb-2`}>{option.name}</h2>
        <p className="text-zinc-400 text-sm tracking-wide">{msg}</p>
      </div>
    );
  };

  // Traditional KYC Steps
  const renderTrad1 = () => (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-bold mb-6 text-center">Step 1: Personal Info</h2>
      <div className="space-y-4 mb-8">
        <input type="text" placeholder="Full Legal Name" className="w-full p-4 bg-zinc-900 border border-zinc-700 rounded-xl focus:border-blue-500 outline-none" onChange={e => setTradForm({ ...tradForm, name: e.target.value })} />
        <input type="date" className="w-full p-4 bg-zinc-900 border border-zinc-700 rounded-xl focus:border-blue-500 outline-none text-zinc-400" onChange={e => setTradForm({ ...tradForm, dob: e.target.value })} />
        <select className="w-full p-4 bg-zinc-900 border border-zinc-700 rounded-xl focus:border-blue-500 outline-none text-zinc-300" onChange={e => setTradForm({ ...tradForm, country: e.target.value })}>
          <option value="IN">India 🇮🇳</option><option value="BR">Brazil 🇧🇷</option><option value="MX">Mexico 🇲🇽</option>
        </select>
        <input type="text" placeholder="Full Address" className="w-full p-4 bg-zinc-900 border border-zinc-700 rounded-xl focus:border-blue-500 outline-none" onChange={e => setTradForm({ ...tradForm, address: e.target.value })} />
      </div>
      <button onClick={() => setFlowState('trad_2')} disabled={!tradForm.name} className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">Next: Document</button>
    </div>
  );

  const renderTrad2 = () => (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-bold mb-6 text-center">Step 2: Document Type</h2>
      <div className="grid grid-cols-1 gap-4 mb-8">
        {['Passport', 'National ID', "Driver's License"].map(type => (
          <button key={type} onClick={() => { setDocType(type); setFlowState('trad_3'); }} className="p-5 border border-zinc-700 hover:border-blue-500 bg-zinc-800/50 rounded-xl text-left font-semibold">
            {type}
          </button>
        ))}
      </div>
      <button onClick={() => setFlowState('trad_1')} className="text-zinc-400 text-sm underline w-full text-center">Back</button>
    </div>
  );

  const renderTrad3 = () => (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-bold mb-2 text-center">Step 3: Upload {docType}</h2>
      <p className="text-center text-zinc-400 text-sm mb-6">Click to mock upload documents</p>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div onClick={() => setDocsUploaded({ ...docsUploaded, front: true })} className={`h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${docsUploaded.front ? 'border-green-500 bg-green-500/10 text-green-500' : 'border-zinc-700 hover:border-blue-500 text-zinc-500'}`}>
          {docsUploaded.front ? <FiCheck size={30} /> : <FiUploadCloud size={30} />}
          <span className="text-xs mt-2 font-bold uppercase tracking-widest">{docsUploaded.front ? 'Front Done' : 'Upload Front'}</span>
        </div>
        <div onClick={() => setDocsUploaded({ ...docsUploaded, back: true })} className={`h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${docsUploaded.back ? 'border-green-500 bg-green-500/10 text-green-500' : 'border-zinc-700 hover:border-blue-500 text-zinc-500'}`}>
          {docsUploaded.back ? <FiCheck size={30} /> : <FiUploadCloud size={30} />}
          <span className="text-xs mt-2 font-bold uppercase tracking-widest">{docsUploaded.back ? 'Back Done' : 'Upload Back'}</span>
        </div>
      </div>
      <button onClick={() => setFlowState('trad_4')} disabled={!docsUploaded.front || !docsUploaded.back} className={`w-full py-4 rounded-xl font-bold ${docsUploaded.front && docsUploaded.back ? 'bg-blue-600 hover:bg-blue-500' : 'bg-zinc-800 text-zinc-500'}`}>Next: Selfie</button>
    </div>
  );

  const renderTrad4 = () => {
    const [scanning, setScanning] = useState(false);
    return (
      <div className="animate-fadeIn flex flex-col items-center">
        <h2 className="text-xl font-bold mb-6 text-center">Step 4: Liveness Check</h2>
        <div className={`w-48 h-64 border-4 rounded-[40px] mb-8 flex items-center justify-center relative overflow-hidden transition-colors ${selfieDone ? 'border-green-500' : scanning ? 'border-blue-500' : 'border-zinc-700'}`}>
          {scanning && !selfieDone && <div className="absolute top-0 w-full h-1 bg-blue-500 animate-bounce" style={{ boxShadow: '0 0 20px #3b82f6' }}></div>}
          {selfieDone ? <FiCheck size={40} className="text-green-500" /> : <FiUser size={60} className={scanning ? 'text-blue-500' : 'text-zinc-700'} />}
        </div>
        {!selfieDone ? (
          <button onClick={() => {
            setScanning(true);
            setTimeout(() => setSelfieDone(true), 3000);
          }} disabled={scanning} className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold flex items-center justify-center gap-2">
            {scanning ? 'Scanning Face...' : <><FiCamera /> Take Selfie</>}
          </button>
        ) : (
          <button onClick={() => { setLoadingMsgIdx(0); setFlowState('trad_5_connect'); }} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold">Next: Link Web3 Wallet</button>
        )}
      </div>
    );
  };

  const renderTradConnect = () => (
    <div className="flex flex-col items-center justify-center py-10 animate-fadeIn text-center">
      <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
        <FiShield size={40} className="text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-white mb-4">Final Step: Link Web3 Wallet</h2>
      <p className="text-zinc-400 text-sm tracking-wide mb-8">
        Your traditional identity documents are ready to be verified. Please connect your Web3 wallet to permanently bind it to your global routing profile.
      </p>
      <ConnectWallet theme="dark" className="!w-full !rounded-xl !py-4" />
    </div>
  );

  const renderTradProcessing = () => {
    const msg = tradProcessingSteps[loadingMsgIdx];
    const isDone = loadingMsgIdx === tradProcessingSteps.length - 1;
    return (
      <div className="flex flex-col items-center justify-center py-10 animate-fadeIn">
        {!isDone ? (
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin mb-6"></div>
        ) : (
          <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
            <FiCheck size={30} />
          </div>
        )}
        <h2 className="text-xl font-bold text-white mb-2">Processing KYC</h2>
        <p className="text-zinc-400 text-sm tracking-wide text-center">{msg}</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-black text-white p-5 pt-10 border-t border-zinc-800 font-sans flex items-center justify-center">
      {fetchingUser ? (
        <div className="text-zinc-400">Loading your identity profile...</div>
      ) : userData?.kyc && userData?.metamaskId ? (
        <div className="max-w-md w-full bg-[#0a0a0e] rounded-3xl p-8 border border-zinc-800/50 shadow-2xl relative overflow-hidden text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiCheck size={40} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Identity Verified</h2>
          <p className="text-zinc-400 mb-4 text-sm">
            Your global routing is unlocked. You have already completed KYC using <span className="text-white font-medium">{userData.kycProvider || 'Traditional KYC'}</span>.
          </p>
          <div className="bg-black/50 rounded-xl p-4 mb-6 border border-zinc-800 flex flex-col items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-widest mb-1 font-bold">Bound Wallet Address</span>
            <span className="text-sm text-green-400 font-mono break-all">{userData.metamaskId || 'N/A'}</span>
          </div>
          <button
            onClick={() => navigate('/overview')}
            className="w-full py-4 rounded-xl font-bold text-sm bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      ) : (
        <div className="max-w-2xl w-full bg-[#0a0a0e] rounded-3xl p-8 border border-zinc-800/50 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-secondary" />

          {flowState === 'selection' && renderSelection()}
          {flowState === 'web3_providers' && renderWeb3Providers()}
          {flowState === 'web3_connect' && renderWeb3Connect()}
          {flowState === 'web3_loading' && renderWeb3Loading()}
          {flowState === 'trad_1' && renderTrad1()}
          {flowState === 'trad_2' && renderTrad2()}
          {flowState === 'trad_3' && renderTrad3()}
          {flowState === 'trad_4' && renderTrad4()}
          {flowState === 'trad_5_connect' && renderTradConnect()}
          {flowState === 'trad_processing' && renderTradProcessing()}
        </div>
      )}
    </div>
  );
};

export default Web3Identity;
