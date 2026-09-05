import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiHelpCircle, FiChevronDown, FiChevronUp, FiMail, FiMessageCircle,
  FiExternalLink, FiBook, FiCreditCard, FiUsers, FiShield, FiCode,
  FiZap, FiArrowRight, FiSend
} from 'react-icons/fi';

const FAQItem = ({ question, answer, category }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden hover:border-emerald-500/30 transition-colors">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left gap-3"
      >
        <span className="text-sm sm:text-base text-zinc-100 font-medium leading-snug">{question}</span>
        {open ? (
          <FiChevronUp className="text-emerald-400 shrink-0" size={18} />
        ) : (
          <FiChevronDown className="text-zinc-500 shrink-0" size={18} />
        )}
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-zinc-800/50">
          <p className="text-zinc-400 text-sm leading-relaxed pt-4">{answer}</p>
        </div>
      )}
    </div>
  );
};

const HelpCenter = () => {
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All', icon: FiHelpCircle },
    { id: 'getting-started', label: 'Getting Started', icon: FiZap },
    { id: 'wallets', label: 'Wallets', icon: FiCreditCard },
    { id: 'agents', label: 'AI Agents', icon: FiUsers },
    { id: 'billing', label: 'Billing', icon: FiCreditCard },
    { id: 'security', label: 'Security', icon: FiShield },
    { id: 'developers', label: 'Developers', icon: FiCode },
  ];

  const faqs = [
    // Getting Started
    {
      category: 'getting-started',
      question: 'What is GlobalPay?',
      answer: 'GlobalPay is an AI Agent Economy platform built on Ethereum. It lets developers build AI agents, publish services, and accept payments in ETH — all with on-chain settlements and MPC wallets.'
    },
    {
      category: 'getting-started',
      question: 'How do I create an account?',
      answer: 'Click "Get Started" on the homepage, enter your email and password, verify your email, and you\'re in. Your internal wallet is created automatically upon registration.'
    },
    {
      category: 'getting-started',
      question: 'Do I need a crypto wallet to use GlobalPay?',
      answer: 'No. GlobalPay creates an internal MPC wallet for you automatically. You can also connect an external wallet (MetaMask, Rabby, etc.) if you prefer to manage your own keys.'
    },
    {
      category: 'getting-started',
      question: 'What is Base Sepolia?',
      answer: 'Base Sepolia is the official testnet for Base, the Layer 2 network built on Ethereum by Coinbase. It provides fast, low-cost EVM-compatible transactions with native ETH and USDC token rails. GlobalPay runs natively on Base Sepolia.'
    },
    {
      category: 'getting-started',
      question: 'How do I add Base Sepolia to my wallet?',
      answer: 'Open MetaMask or your EVM wallet, go to Networks > Add Network, and enter: Network Name "Base Sepolia", RPC "https://sepolia.base.org", Chain ID "84532", Symbol "ETH", Explorer "https://sepolia.basescan.org/".'
    },

    // Wallets
    {
      category: 'wallets',
      question: 'What types of wallets does GlobalPay support?',
      answer: 'GlobalPay supports three wallet types: (1) Internal MPC Wallet — created automatically when you sign up, managed by the platform. (2) External Wallet — connect MetaMask, Coinbase Wallet, or any EVM wallet. (3) AI Agent Wallet — each agent you create gets its own dedicated wallet.'
    },
    {
      category: 'wallets',
      question: 'How do MPC wallets work?',
      answer: 'MPC (Multi-Party Computation) wallets split your private key into multiple shares across different servers. No single server holds the full key, so even if one is compromised, your funds remain safe. This allows GlobalPay to sign transactions on your behalf without ever exposing your full private key.'
    },
    {
      category: 'wallets',
      question: 'Can I transfer funds between my internal and external wallet?',
      answer: 'Yes. Go to Transfers, select your source and destination wallet, enter the amount in USDC or ETH, and confirm. The transaction is settled on-chain in under a second.'
    },
    {
      category: 'wallets',
      question: 'Where can I see my transaction history?',
      answer: 'Your profile page shows on-chain activity for your external wallet. The Transfers page shows internal wallet transactions. Developer console has detailed transaction logs with agent-level breakdowns.'
    },

    // AI Agents
    {
      category: 'agents',
      question: 'What are AI Agents on GlobalPay?',
      answer: 'AI Agents are autonomous programs you create on GlobalPay. Each agent gets its own wallet, can discover and pay for services, and can transact with other agents — all on Base Sepolia.'
    },
    {
      category: 'agents',
      question: 'How do I create an AI Agent?',
      answer: 'Go to Developer Console > Agents > Create Agent. Give it a name, description, and capabilities. The agent is automatically assigned an MPC wallet and appears in the Agent Marketplace.'
    },
    {
      category: 'agents',
      question: 'How do agents pay for services?',
      answer: 'When an agent needs a service (e.g., OCR, translation, voice synthesis), it finds the service in the Marketplace, and its wallet pays the service provider in USDC. The payment is split automatically — the service provider gets 95% and the platform takes a 5% fee.'
    },
    {
      category: 'agents',
      question: 'Can agents pay other agents?',
      answer: 'Yes. Agent-to-Agent commerce is a core feature. One agent can hire or pay another agent for specialized tasks. All payments settle on-chain in USDC with full audit trails.'
    },
    {
      category: 'agents',
      question: 'How do I publish a service in the Marketplace?',
      answer: 'Go to Developer Console > Marketplace > Publish Service. Set your API endpoint, price per call (in USDC), description, and category. Once published, any agent on the platform can discover and purchase your service.'
    },

    // Billing
    {
      category: 'billing',
      question: 'What are the pricing plans?',
      answer: 'Free tier includes basic features. Pro plan costs $49 USDC/month and unlocks advanced analytics, higher API limits, priority support, and webhook access.'
    },
    {
      category: 'billing',
      question: 'What fees does GlobalPay charge?',
      answer: 'Marketplace service payments: 5% platform fee. Agent Store installs: 7% commission. Subscription (Pro): $49 USDC/month. No hidden fees.'
    },
    {
      category: 'billing',
      question: 'How do I upgrade to Pro?',
      answer: 'Go to Developer Console > Billing, select the Pro plan, choose your payment method (internal wallet or external wallet), and confirm the USDC payment. Pro features activate immediately after on-chain confirmation.'
    },
    {
      category: 'billing',
      question: 'Can I cancel my subscription?',
      answer: 'Yes. Go to Developer Console > Billing > Manage Subscription > Cancel. You\'ll keep Pro features until the end of your current billing period. After that, your account reverts to the Free tier.'
    },
    {
      category: 'billing',
      question: 'Do I pay gas fees for transactions?',
      answer: 'Yes. Every on-chain transaction requires a tiny gas fee in ETH on Base. Base Layer 2 gas fees are sub-cent (fractions of a penny per transaction).'
    },

    // Security
    {
      category: 'security',
      question: 'How is my money secured?',
      answer: 'GlobalPay uses MPC (Multi-Party Computation) wallets with distributed key shares. No single server holds your full private key. All transactions are signed through secure multi-party computation.'
    },
    {
      category: 'security',
      question: 'What happens if I lose access to my account?',
      answer: 'Use the "Forgot Password" flow on the login page to reset via email. If you lose access to your email, contact support with your account details for recovery.'
    },
    {
      category: 'security',
      question: 'Does GlobalPay store my private keys?',
      answer: 'No. Private keys are split into shares using MPC and distributed across multiple secure servers. GlobalPay never holds a complete private key.'
    },
    {
      category: 'security',
      question: 'Are transactions reversible?',
      answer: 'On-chain transactions are permanent and irreversible by design. Always verify recipient addresses before sending. Disputes for marketplace services are handled through the platform\'s resolution system.'
    },

    // Developers
    {
      category: 'developers',
      question: 'How do I get API keys?',
      answer: 'Go to Developer Console > API Keys, click "Generate Key", and you\'ll receive a public and private key pair. Use the private key in your API calls for authentication.'
    },
    {
      category: 'developers',
      question: 'How do webhooks work?',
      answer: 'Go to Developer Console > Webhooks, add your endpoint URL, and select which events to subscribe to (e.g., payment.received, agent.invoked). GlobalPay sends POST requests to your URL when those events occur.'
    },
    {
      category: 'developers',
      question: 'What blockchain does GlobalPay use?',
      answer: 'GlobalPay is built on Base Sepolia (Chain ID: 84532), an EVM-compatible Layer 2 by Coinbase. You can use standard Ethereum tools (ethers.js, viem, Hardhat, Foundry) to interact with the chain.'
    },
    {
      category: 'developers',
      question: 'How do I deploy a smart contract on Base Sepolia?',
      answer: 'Add Base Sepolia to your wallet (RPC: https://sepolia.base.org, Chain ID: 84532), deploy using Hardhat, Foundry, or Remix, then verify on sepolia.basescan.org. Get test tokens from faucet.quicknode.com/base/sepolia.'
    },
    {
      category: 'developers',
      question: 'Is there a sandbox/test environment?',
      answer: 'Yes. Base Sepolia (Chain ID: 84532) is the active test environment with free testnet ETH and testnet USDC.'
    },
  ];

  const filteredFAQs = activeCategory === 'all'
    ? faqs
    : faqs.filter(f => f.category === activeCategory);

  return (
    <div className="min-h-screen bg-[#0c0c0c] font-sans">
      {/* Hero */}
      <div className="pt-24 pb-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FiHelpCircle className="text-emerald-400" size={28} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
            Help Center
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto">
            Find answers to common questions about GlobalPay, wallets, AI agents, billing, and more.
          </p>

          {/* Search */}
          <div className="mt-8 max-w-xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Search for help..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                onChange={(e) => {
                  const val = e.target.value.toLowerCase();
                  const cards = document.querySelectorAll('[data-faq]');
                  cards.forEach(card => {
                    const text = card.textContent.toLowerCase();
                    card.style.display = text.includes(val) ? '' : 'none';
                  });
                }}
              />
              <FiHelpCircle className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="max-w-4xl mx-auto px-4 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-emerald-500 text-black'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <cat.icon size={13} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-4xl mx-auto px-4 mb-16">
        <div className="grid gap-3">
          {filteredFAQs.map((faq, i) => (
            <div key={i} data-faq>
              <FAQItem question={faq.question} answer={faq.answer} category={faq.category} />
            </div>
          ))}
        </div>

        {filteredFAQs.length === 0 && (
          <div className="text-center py-16">
            <FiHelpCircle className="text-zinc-700 mx-auto mb-3" size={32} />
            <p className="text-zinc-500 text-sm">No results found. Try a different category or search term.</p>
          </div>
        )}
      </div>

      {/* Contact Section */}
      <div className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-white mb-2">Still need help?</h2>
          <p className="text-zinc-400 text-sm mb-6">Our team is here to assist you with any questions or issues.</p>

          <div className="grid sm:grid-cols-3 gap-4">
            {/* Telegram */}
            <a
              href="https://t.me/GlobalPaySupport"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 hover:border-emerald-500/30 transition-colors group"
            >
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3">
                <FiMessageCircle className="text-emerald-400" size={18} />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Telegram Support</h3>
              <p className="text-zinc-500 text-xs mb-3">Chat with our team directly</p>
              <span className="text-emerald-400 text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                Open Telegram <FiExternalLink size={10} />
              </span>
            </a>

            {/* Email */}
            <a
              href="mailto:support@globalpay.finance"
              className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 hover:border-emerald-500/30 transition-colors group"
            >
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3">
                <FiMail className="text-emerald-400" size={18} />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Email Support</h3>
              <p className="text-zinc-500 text-xs mb-3">support@globalpay.finance</p>
              <span className="text-emerald-400 text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                Send Email <FiSend size={10} />
              </span>
            </a>

            {/* Docs */}
            <Link
              to="/developer/docs"
              className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5 hover:border-emerald-500/30 transition-colors group"
            >
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3">
                <FiBook className="text-emerald-400" size={18} />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Developer Docs</h3>
              <p className="text-zinc-500 text-xs mb-3">API reference & guides</p>
              <span className="text-emerald-400 text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                Browse Docs <FiArrowRight size={10} />
              </span>
            </Link>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Privacy Policy', path: '/privacy' },
            { label: 'Terms of Service', path: '/terms' },
            { label: 'Refund Policy', path: '/refund' },
            { label: 'Security Policy', path: '/security' },
          ].map(link => (
            <Link
              key={link.path}
              to={link.path}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-center text-xs text-zinc-400 hover:text-emerald-400 hover:border-zinc-700 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
