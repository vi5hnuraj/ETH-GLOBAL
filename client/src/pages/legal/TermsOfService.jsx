import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const TermsOfService = () => (
  <LegalLayout title="Terms of Service" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. Acceptance of Terms</h2>
    <p className="text-zinc-400 leading-relaxed">
      By accessing or using GlobalPay, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.
    </p>

    <h2 className="text-2xl font-bold text-white">2. Description of Service</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay is an AI Agent Economy platform that enables developers to create AI agents, publish services, accept payments, and settle transactions on-chain.
    </p>

    <h2 className="text-2xl font-bold text-white">3. Eligibility</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>You must be at least 18 years old</li>
      <li>You must comply with applicable laws in your jurisdiction</li>
      <li>You must not be on any sanctions or restricted parties list</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">4. Account Responsibilities</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>You are responsible for maintaining account security</li>
      <li>You are responsible for all activity under your account</li>
      <li>You must not share API keys or credentials with unauthorized parties</li>
      <li>You must notify us immediately of any security breach</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">5. Fees and Payments</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Pro subscription: $49 per month</li>
      <li>Marketplace transaction fee: 5% per transaction</li>
      <li>Agent store commission: 7% per install</li>
      <li>All fees are non-refundable unless stated in the Refund Policy</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">6. On-Chain Transactions</h2>
    <p className="text-zinc-400 leading-relaxed">
      All transactions are executed on-chain and are irreversible. GlobalPay does not have the ability to reverse, cancel, or modify on-chain transactions. You are responsible for verifying transaction details before confirming.
    </p>

    <h2 className="text-2xl font-bold text-white">7. Prohibited Activities</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Money laundering or terrorist financing</li>
      <li>Fraudulent or deceptive practices</li>
      <li>Exploiting vulnerabilities in the platform</li>
      <li>Creating agents designed to harm others</li>
      <li>Violating any applicable laws or regulations</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">8. Intellectual Property</h2>
    <p className="text-zinc-400 leading-relaxed">
      Developers retain ownership of their agents, services, and content published on GlobalPay. By publishing on the platform, you grant GlobalPay a non-exclusive license to display and distribute your content within the marketplace.
    </p>

    <h2 className="text-2xl font-bold text-white">9. Limitation of Liability</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay is provided "as is" without warranties. We are not liable for losses resulting from on-chain transactions, smart contract failures, network congestion, or third-party services.
    </p>

    <h2 className="text-2xl font-bold text-white">10. Termination</h2>
    <p className="text-zinc-400 leading-relaxed">
      We may suspend or terminate your account for violation of these terms. You may delete your account at any time from account settings.
    </p>

    <h2 className="text-2xl font-bold text-white">11. Changes to Terms</h2>
    <p className="text-zinc-400 leading-relaxed">
      We reserve the right to update these terms. Continued use of the platform after changes constitutes acceptance of the new terms.
    </p>

    <h2 className="text-2xl font-bold text-white">12. Contact</h2>
    <p className="text-zinc-400 leading-relaxed">
      Questions? Contact us on Telegram: <a href="https://t.me/dudei0" className="text-emerald-400 hover:underline">@dudei0</a>
    </p>
  </LegalLayout>
);

export default TermsOfService;
