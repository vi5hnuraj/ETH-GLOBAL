import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const PrivacyPolicy = () => (
  <LegalLayout title="Privacy Policy" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. Introduction</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI Agent Economy platform built on Ethereum.
    </p>

    <h2 className="text-2xl font-bold text-white">2. Information We Collect</h2>
    <h3 className="text-lg font-semibold text-zinc-200">Personal Information</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Email address</li>
      <li>Username and display name</li>
      <li>Wallet addresses (internal MPC wallets and external connected wallets)</li>
      <li>Organization and team information</li>
    </ul>

    <h3 className="text-lg font-semibold text-zinc-200">Usage Information</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>API usage patterns and analytics</li>
      <li>Agent configurations and activity logs</li>
      <li>Transaction history on Ethereum</li>
      <li>Device and browser information</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">3. How We Use Your Information</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>To provide and maintain the GlobalPay platform</li>
      <li>To process transactions and settlements on Ethereum</li>
      <li>To manage your developer console and API access</li>
      <li>To send platform updates and security alerts</li>
      <li>To detect and prevent fraud or unauthorized access</li>
      <li>To comply with legal obligations</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">4. On-Chain Data</h2>
    <p className="text-zinc-400 leading-relaxed">
      All transactions on Ethereum are public and immutable. Wallet addresses, transaction amounts, and settlement records are visible on the Ethereum block explorer. By using GlobalPay, you acknowledge that on-chain activity is publicly accessible.
    </p>

    <h2 className="text-2xl font-bold text-white">5. Data Sharing</h2>
    <p className="text-zinc-400 leading-relaxed">
      We do not sell your personal information. We may share data with:
    </p>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Ethereum network (on-chain transactions only)</li>
      <li>Service providers who assist platform operations (hosting, analytics)</li>
      <li>Law enforcement when required by law</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">6. Data Security</h2>
    <p className="text-zinc-400 leading-relaxed">
      We use MPC (Multi-Party Computation) wallet technology, encrypted data storage, and secure API authentication to protect your information. However, no method of electronic transmission is 100% secure.
    </p>

    <h2 className="text-2xl font-bold text-white">7. Your Rights</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Access your personal data</li>
      <li>Request correction of inaccurate data</li>
      <li>Request deletion of your account and data</li>
      <li>Export your transaction history</li>
      <li>Opt out of non-essential communications</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">8. Contact Us</h2>
    <p className="text-zinc-400 leading-relaxed">
      If you have questions about this Privacy Policy, contact us on Telegram: <a href="https://t.me/dudei0" className="text-emerald-400 hover:underline">@dudei0</a>
    </p>
  </LegalLayout>
);

export default PrivacyPolicy;
