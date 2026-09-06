import React, { useState } from 'react';
import { FiCheck, FiRefreshCw, FiCreditCard, FiInfo } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import StatusBadge from '../../components/dev/StatusBadge';
import ConfirmModal from '../../components/dev/ConfirmModal';
import UsageMeter from '../../components/dev/UsageMeter';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const fmtUsd = (n) => `$${Number(n || 0).toFixed(2)}`;
const PLAN_STYLES = {
  free: '',
  pro: 'border-blue-600 bg-blue-900/10 ring-1 ring-blue-600/50 scale-[1.02]',
  enterprise: 'border-purple-600/60 bg-purple-900/10 ring-1 ring-purple-600/40'
};

const PLAN_FEATURES = [
  { name: 'AI Agents', free: '1', pro: '100', enterprise: 'Unlimited' },
  { name: 'API Requests/mo', free: '100', pro: '1,000,000', enterprise: 'Unlimited' },
  { name: 'Transaction History', free: '7 days', pro: 'Forever', enterprise: 'Forever' },
  { name: 'Analytics Dashboard', free: '❌', pro: '✅', enterprise: '✅' },
  { name: 'Webhooks', free: '❌', pro: '✅', enterprise: '✅' },
  { name: 'API Playground', free: '❌', pro: '✅', enterprise: '✅' },
  { name: 'Support', free: 'Community', pro: 'Priority', enterprise: 'Dedicated' },
  { name: 'SLA', free: '❌', pro: '❌', enterprise: '✅' },
  { name: 'Team Members', free: '❌', pro: '❌', enterprise: '✅' },
];

const DevBilling = () => {
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: developerApi.billing });
  const [subscribing, setSubscribing] = useState(null);
  const [enterpriseConfirm, setEnterpriseConfirm] = useState(false);

  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [showWalletSelect, setShowWalletSelect] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);

  // Fetch user's wallets for payment (all types)
  const fetchWallets = async () => {
    try {
      // 1. Get AI Agent wallets from developer API
      const agentRes = await developerApi.agents({ perPage: 50 }).catch(() => ({}));
      
      const agents = agentRes?.agents || [];
      const agentWallets = agents
        .filter(a => a.walletId || a.wallet)
        .map(a => ({ 
          type: 'agent',
          walletId: a.walletId || 'agent-' + a.agentId, 
          address: a.wallet || a.walletId, 
          name: a.name || a.agentId,
          balance: a.balance || 0
        }));

      // 2. Get GlobalPay internal wallet from billing or profile
      const userWallets = [];
      
      // Try billing endpoint first (has user context)
      try {
        const billingRes = await developerApi.billing().catch(() => null);
        if (billingRes?.internalWalletAddress) {
          userWallets.push({
            type: 'internal',
            walletId: billingRes.walletId || 'internal-main',
            address: billingRes.internalWalletAddress,
            name: 'GlobalPay Wallet',
            balance: billingRes.bankDetails?.internalBalance || 0
          });
        }
      } catch {}
      
      // Fallback: try profile endpoint
      if (userWallets.length === 0) {
        try {
          const profileRes = await developerApi.request('/auth/fetchdetail').catch(() => null);
          if (profileRes) {
            // Try multiple field name patterns
            const internalAddr = profileRes.internalWalletAddress 
              || profileRes.internal_wallet_address 
              || profileRes.user?.internalWalletAddress
              || profileRes.user?.internal_wallet_address;
            if (internalAddr) {
              userWallets.push({
                type: 'internal',
                walletId: profileRes.walletId || profileRes.user?.walletId || 'internal-main',
                address: internalAddr,
                name: 'GlobalPay Wallet',
                balance: profileRes.bankDetails?.internalBalance || profileRes.bankDetails?.usdcBalance || 0
              });
            }
          }
        } catch {}
      }

      // 3. Combined list - prefer internal first, then agents
      const allWallets = [...userWallets, ...agentWallets];
      setWallets(allWallets);
      if (allWallets.length > 0) setSelectedWallet(allWallets[0].walletId);
    } catch (err) {
      console.warn('Could not fetch wallets:', err);
    }
  };

  const subscribe = async (plan) => {
    // For Pro plan, show wallet selection immediately, fetch wallets in background
    if (plan === 'pro') {
      setPendingPlan(plan);
      setShowWalletSelect(true);
      setPaymentError(null);
      // Fetch wallets in background (don't block UI)
      fetchWallets();
      return;
    }
    
    // For free — just switch to free
    if (plan === 'free') {
      setSubscribing(plan);
      try {
        const res = await developerApi.subscribe(plan);
        await refresh();
      } catch (err) {
        console.error('Failed to switch plan:', err);
      } finally {
        setSubscribing(null);
      }
      return;
    }
    
    // Enterprise — show contact modal
    setEnterpriseConfirm(true);
  };

  const [selectedOption, setSelectedOption] = useState('subscribe'); // 'trial' or 'subscribe'
  const [selectedWalletType, setSelectedWalletType] = useState('agent'); // 'agent', 'external'
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [connectedBalance, setConnectedBalance] = useState('0');
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [paymentError, setPaymentError] = useState(null); // {success, txHash, amount, plan}

  const confirmProPayment = async () => {
    setPaymentError(null);
    
    // External wallet (MetaMask) payment
    if (selectedWalletType === 'external' && connectedAddress) {
        setSubscribing('pro');
        try {
          // Send payment via MetaMask
          const txHash = await sendMetaMaskPayment(4.9);
          // Activate pro plan with txHash for verification
          const res = await developerApi.paySubscriptionWithTxHash('metamask-' + connectedAddress, txHash);
          setShowWalletSelect(false);
          setPaymentReceipt({ success: true, txHash: res.txHash, amount: '4.9 BOT', plan: 'Pro' });
          await refresh();
        } catch (err) {
          setPaymentError(err.message || 'Payment failed');
          // Keep modal open to show error inside it
        } finally {
          setSubscribing(null);
          setPendingPlan(null);
        }
        return;
      }
      // Internal/Agent wallet payment
      if (!selectedWallet) {
        setPaymentError('Please select a wallet to pay from');
        return;
      }
      setSubscribing('pro');
      try {
        const res = await developerApi.paySubscription(selectedWallet);
        setShowWalletSelect(false);
        setPaymentReceipt({ success: true, txHash: res.txHash || null, amount: '4.9 BOT', plan: 'Pro' });
        await refresh();
      } catch (err) {
        setPaymentError(err.message || 'Payment failed');
        // Keep modal open to show error inside it
      } finally {
        setSubscribing(null);
      }
  };

  // Send payment via MetaMask
  const sendMetaMaskPayment = async (amountBOT) => {
    const TREASURY_ADDRESS = '0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317';
    const amountWei = '0x' + (BigInt(Math.floor(amountBOT * 1e18)).toString(16));
    
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: connectedAddress,
        to: TREASURY_ADDRESS,
        value: amountWei,
        gas: '0x5208' // 21000 gas
      }]
    });
    return txHash;
  };

  if (loading && !data) {
    return (
      <div>
        <Skeleton className="h-8 w-56 rounded mb-6" />
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Billing</h1>
        <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
      </div>
    );
  }

  const current = data?.current || {};
  const currentPlan = current.plan || 'free';
  const usage = current.usage || {};

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-zinc-500 mt-1">Plans, usage meters and invoices. Subscription management is handled through the billing API.</p>
        </div>
        <button
          type="button"
          onClick={() => refresh({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
        >
          <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {/* Plans */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {(data?.plans || []).map((p) => {
          const isCurrent = currentPlan === p.name;
          const price = p.priceCents === 0 ? (p.period === 'custom' ? 'Custom' : '$0') : fmtUsd(p.priceCents / 100);
          const isPopular = p.popular;
          const hasTrial = p.trialDays && !isCurrent;
          return (
            <div key={p.name} className={`rounded-2xl p-6 border flex flex-col relative ${PLAN_STYLES[p.name] || 'border-zinc-800 bg-zinc-900/60'}`}>
              {/* Popular Badge */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                  ★ Most Popular
                </div>
              )}
              {/* Trial Badge removed */}
              <h3 className="font-bold text-lg capitalize">{p.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-black">{price}</span>
                <span className="text-zinc-500 text-sm">{p.period === 'custom' ? '' : ' / month'}</span>
                {p.annualPriceCents && (
                  <p className="text-xs text-emerald-400 mt-1">${(p.annualPriceCents / 100).toFixed(0)}/mo billed annually (save $120/yr)</p>
                )}
              </div>
              <ul className="space-y-2 mb-6 flex-1 text-sm text-zinc-300">
                <li className="flex items-center gap-2"><FiCheck className="text-emerald-400 shrink-0" size={14} /> {p.agentLimit ? `${p.agentLimit} AI Agents` : 'Unlimited AI Agents'}</li>
                <li className="flex items-center gap-2"><FiCheck className="text-emerald-400 shrink-0" size={14} /> {p.requestLimit ? `${p.requestLimit.toLocaleString()} API Requests` : 'Unlimited Requests'}</li>
                <li className="flex items-center gap-2"><FiCheck className="text-emerald-400 shrink-0" size={14} /> {p.historyDays ? `${p.historyDays}-day History` : 'Forever History'}</li>
                <li className="flex items-center gap-2"><FiCheck className="text-emerald-400 shrink-0" size={14} /> {p.support} Support</li>
                {(p.highlights || []).slice(4).map((h) => (
                  <li key={h} className="flex items-center gap-2"><FiCheck className="text-emerald-400 shrink-0" size={14} /> {h}</li>
                ))}
              </ul>
              <button
                type="button"
                aria-pressed={isCurrent}
                onClick={() => (p.name === 'enterprise' && !isCurrent ? setEnterpriseConfirm(true) : subscribe(p.name))}
                disabled={isCurrent || subscribing === p.name}
                className={`w-full font-semibold py-2.5 rounded-lg ${
                  isCurrent
                    ? 'bg-zinc-800 text-zinc-500 cursor-default'
                    : p.name === 'pro'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {isCurrent ? 'Current Plan' : subscribing === p.name ? 'Processing…' : p.name === 'pro' ? 'Pay 4.9 BOT ($49/mo)' : p.name === 'enterprise' ? 'Choose Enterprise' : `Switch to ${p.name[0].toUpperCase() + p.name.slice(1)}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <Card title="Compare Plans" subtitle="See what's included in each plan" className="mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Feature</th>
                <th className="text-center py-3 px-4 text-zinc-400 font-medium">Free</th>
                <th className="text-center py-3 px-4 text-blue-400 font-medium">Pro ★</th>
                <th className="text-center py-3 px-4 text-purple-400 font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((f, i) => (
                <tr key={f.name} className={i % 2 === 0 ? 'bg-zinc-900/30' : ''}>
                  <td className="py-2.5 px-4 text-zinc-300">{f.name}</td>
                  <td className="py-2.5 px-4 text-center text-zinc-500">{f.free}</td>
                  <td className="py-2.5 px-4 text-center text-white">{f.pro}</td>
                  <td className="py-2.5 px-4 text-center text-white">{f.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Current Plan" subtitle={`Subscription status: ${current.status || 'trialing'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-2xl font-black text-gradient capitalize">{currentPlan}</p>
              <p className="text-sm text-zinc-500 mt-1">{current.priceCents ? fmtUsd(current.priceCents / 100) + ' / month' : 'Free tier'}</p>
            </div>
            <StatusBadge status={current.status || 'trialing'} />
          </div>

          <div className="space-y-4">
            <UsageMeter 
              label="AI Agents" 
              current={usage.agents || 0} 
              limit={usage.agentLimit}
              onUpgrade={() => subscribe('pro')}
            />
            <UsageMeter 
              label="API Requests" 
              current={usage.requests || 0} 
              limit={usage.requestLimit}
              onUpgrade={() => subscribe('pro')}
            />
          </div>
          {currentPlan === 'free' && (
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
              <p className="text-xs text-blue-400">
                <FiInfo size={12} className="inline mr-1" />
                Upgrade to Pro to unlock 100 agents, 1M API requests, and premium features.
              </p>
            </div>
          )}

          {current.cancelAt && (
            <p className="text-xs text-amber-400 mt-4">Subscription cancels on {new Date(current.cancelAt).toLocaleDateString()}.</p>
          )}
        </Card>

        <Card title="Revenue Statistics">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-950/60 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-gradient">{fmtUsd(data?.revenueStats?.mrr)}</p>
              <p className="text-[10px] uppercase text-zinc-500 mt-1">Monthly Revenue</p>
            </div>
            <div className="bg-zinc-950/60 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-gradient">{fmtUsd(data?.revenueStats?.lifetime)}</p>
              <p className="text-[10px] uppercase text-zinc-500 mt-1">Lifetime Revenue</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-4 flex items-center gap-1.5">
            <FiCreditCard size={13} /> Revenue reflects confirmed payments across your organization.
          </p>
        </Card>
      </div>

      <Card title="Invoices" subtitle="Payment history and receipts" className="mt-6">
        {(data?.invoices || []).length === 0 ? (
          <p className="text-zinc-400 text-sm py-6 text-center">No invoices yet. Invoices appear after the first payment.</p>
        ) : (
          <div className="space-y-2">
            {(data?.invoices || []).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3 text-sm">
                <div>
                  <p className="font-medium font-mono text-xs">{inv.id}</p>
                  <p className="text-xs text-zinc-400">{new Date(inv.createdAt).toLocaleDateString()} · {inv.plan}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtUsd(inv.amountCents / 100)}</p>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Payment Modal */}
      {showWalletSelect && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-3xl border border-zinc-700/50 p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold text-white">Upgrade to Pro</h3>
              <p className="text-zinc-400 text-sm mt-1">Unlock all premium features</p>
            </div>
            
            {/* Price Card */}
            <div className="bg-zinc-900/50 rounded-2xl p-5 mb-6 border border-zinc-700/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400">Monthly Plan</span>
                <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full">PRO</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">4.9</span>
                <span className="text-lg font-semibold text-zinc-400">BOT</span>
              </div>
              <p className="text-zinc-500 text-sm mt-1">≈ $49 USD/month</p>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <p className="text-zinc-400 text-xs font-medium mb-3 uppercase tracking-wider">Pay with</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedWalletType('agent')}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    selectedWalletType === 'agent'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  🤖 Agent Wallet
                </button>
                <button
                  onClick={() => setSelectedWalletType('external')}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    selectedWalletType === 'external'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  🦊 MetaMask
                </button>
              </div>
            </div>

            {/* Wallet Selection */}
            {selectedWalletType === 'agent' && (
              <div className="mb-4 max-h-48 overflow-y-auto space-y-2 pr-1">
                {wallets.filter(w => w.type === 'agent').map((w) => (
                  <div
                    key={w.walletId}
                    onClick={() => setSelectedWallet(w.walletId)}
                    className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${
                      selectedWallet === w.walletId
                        ? 'bg-blue-600/10 border border-blue-500/50'
                        : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-600/20 rounded-full flex items-center justify-center">
                        <span className="text-emerald-400">🤖</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{w.name}</p>
                        <p className="text-zinc-500 text-xs font-mono">{w.address?.slice(0, 6)}...{w.address?.slice(-4)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">{Number(w.balance || 0).toFixed(4)}</p>
                      <p className="text-zinc-500 text-xs">BOT</p>
                    </div>
                  </div>
                ))}
                {wallets.filter(w => w.type === 'agent').length === 0 && (
                  <div className="text-center py-6 text-zinc-500 text-sm">
                    No agent wallets found. Create an agent first.
                  </div>
                )}
              </div>
            )}

            {selectedWalletType === 'external' && (
              <div className="mb-6">
                {connectedAddress ? (
                  <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-600/20 rounded-full flex items-center justify-center">
                        <span className="text-emerald-400">✓</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-emerald-400 font-medium">Connected</p>
                        <p className="text-white text-sm font-mono">{connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}</p>
                      </div>
                      <span className="text-emerald-400 font-semibold">{connectedBalance} BOT</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      if (typeof window.ethereum !== 'undefined') {
                        try {
                          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                          if (accounts[0]) {
                            setConnectedAddress(accounts[0]);
                            const balance = await window.ethereum.request({ method: 'eth_getBalance', params: [accounts[0], 'latest'] });
                            setConnectedBalance((parseInt(balance, 16) / 1e18).toFixed(4));
                          }
                        } catch (err) {
                          setPaymentError('Failed to connect MetaMask. Please approve the connection.');
                        }
                      } else {
                        setPaymentError('MetaMask not detected. Please install MetaMask extension.');
                      }
                    }}
                    className="w-full bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    🦊 Connect MetaMask
                  </button>
                )}
              </div>
            )}

            {/* Error Message */}
            {paymentError && (
              <div className="mb-4 bg-red-900/30 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">⚠️</span>
                  <p className="text-red-300 text-sm">{paymentError}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowWalletSelect(false); setPendingPlan(null); }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3.5 rounded-xl font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmProPayment}
                disabled={!selectedWallet && selectedWalletType === 'agent' || (!connectedAddress && selectedWalletType === 'external') || subscribing === 'pro'}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-3.5 rounded-xl font-semibold shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {subscribing === 'pro' ? 'Processing...' : 'Pay 4.9 BOT'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Enterprise plan confirmation */}
      <ConfirmModal
        open={enterpriseConfirm}
        onClose={() => setEnterpriseConfirm(false)}
        onConfirm={() => {
          setEnterpriseConfirm(false);
        }}
        title="Choose Enterprise"
        description="Enterprise plan is configured via your account manager."
        confirmLabel="Choose Enterprise"
        danger={false}
        confirmClassName="bg-blue-600 hover:bg-blue-500"
      />

      {/* Payment Receipt Modal */}
      {paymentReceipt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 p-6 max-w-sm w-full text-center">
            {paymentReceipt.success ? (
              <>
                <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">✅</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Payment Successful!</h3>
                <p className="text-zinc-400 text-sm mb-4">Your Pro plan is now active</p>
                
                <div className="bg-zinc-800 rounded-lg p-4 mb-4 text-left">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-400">Amount</span>
                    <span className="text-white font-semibold">{paymentReceipt.amount}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-400">Plan</span>
                    <span className="text-white font-semibold">{paymentReceipt.plan}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-400">Status</span>
                    <span className="text-emerald-400 font-semibold">Confirmed</span>
                  </div>
                  {paymentReceipt.txHash && (
                    <div className="mt-3 pt-3 border-t border-zinc-700">
                      <p className="text-zinc-400 text-xs mb-1">Transaction Hash</p>
                      <a 
                        href={`https://testnet.arcscan.app/tx/${paymentReceipt.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-mono break-all"
                      >
                        {paymentReceipt.txHash.slice(0, 20)}...{paymentReceipt.txHash.slice(-10)}
                        <span className="ml-1">↗</span>
                      </a>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => setPaymentReceipt(null)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">❌</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Payment Failed</h3>
                <p className="text-zinc-400 text-sm mb-4">{paymentReceipt.error}</p>
                
                <button
                  onClick={() => setPaymentReceipt(null)}
                  className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-3 rounded-lg font-medium"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default DevBilling;
