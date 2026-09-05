import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const CookiePolicy = () => (
  <LegalLayout title="Cookie Policy" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. What Are Cookies</h2>
    <p className="text-zinc-400 leading-relaxed">
      Cookies are small text files stored on your device when you visit GlobalPay. They help us improve your experience and platform functionality.
    </p>

    <h2 className="text-2xl font-bold text-white">2. Cookies We Use</h2>
    <h3 className="text-lg font-semibold text-zinc-200">Essential Cookies</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li><strong>Authentication:</strong> Keeps you logged in (JWT token in localStorage)</li>
      <li><strong>Session:</strong> Maintains your session state</li>
      <li><strong>Wallet:</strong> Stores connected wallet preferences</li>
    </ul>

    <h3 className="text-lg font-semibold text-zinc-200">Analytics Cookies</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Platform usage patterns</li>
      <li>Feature adoption metrics</li>
      <li>Error tracking and performance monitoring</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">3. Local Storage</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay uses browser localStorage to store:
    </p>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Authentication tokens</li>
      <li>Wallet connection state</li>
      <li>UI preferences (theme, sidebar state)</li>
      <li>Organization selection</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">4. Third-Party Cookies</h2>
    <p className="text-zinc-400 leading-relaxed">
      We do not use third-party advertising cookies. Wallet providers (MetaMask, OKX Wallet) may set their own cookies when you connect.
    </p>

    <h2 className="text-2xl font-bold text-white">5. Managing Cookies</h2>
    <p className="text-zinc-400 leading-relaxed">
      You can clear cookies and localStorage through your browser settings. Note that clearing authentication data will log you out and disconnect your wallet.
    </p>

    <h2 className="text-2xl font-bold text-white">6. Changes to This Policy</h2>
    <p className="text-zinc-400 leading-relaxed">
      We may update this Cookie Policy. Changes will be posted on this page with an updated date.
    </p>
  </LegalLayout>
);

export default CookiePolicy;
