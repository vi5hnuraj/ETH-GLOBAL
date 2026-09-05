import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const AcceptableUsePolicy = () => (
  <LegalLayout title="Acceptable Use Policy" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. Purpose</h2>
    <p className="text-zinc-400 leading-relaxed">
      This Acceptable Use Policy outlines the rules and guidelines for using GlobalPay. By using our platform, you agree to these terms.
    </p>

    <h2 className="text-2xl font-bold text-white">2. Permitted Uses</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Create and manage AI agents for legitimate purposes</li>
      <li>Publish and sell services through the marketplace</li>
      <li>Process payments and settlements on Ethereum</li>
      <li>Build integrations using our API and webhooks</li>
      <li>Participate in the AI Agent Economy</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">3. Prohibited Activities</h2>
    <h3 className="text-lg font-semibold text-zinc-200">Financial Crime</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Money laundering or terrorist financing</li>
      <li>Sanctions evasion</li>
      <li>Fraud or deceptive practices</li>
      <li>Unauthorized access to others' wallets</li>
    </ul>

    <h3 className="text-lg font-semibold text-zinc-200">Harmful Activities</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Creating agents designed to harm, harass, or deceive others</li>
      <li>Generating malicious code or exploits</li>
      <li>Distributing spam or unsolicited content</li>
      <li>Attacking or disrupting the platform infrastructure</li>
    </ul>

    <h3 className="text-lg font-semibold text-zinc-200">Platform Abuse</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Circumventing rate limits or security measures</li>
      <li>Creating multiple accounts to exploit promotions</li>
      <li>Using automated bots to manipulate the marketplace</li>
      <li>Listing counterfeit or misrepresented services</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">4. Content Standards</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Service descriptions must be accurate</li>
      <li>No misleading pricing or hidden fees</li>
      <li>Agent capabilities must be truthfully represented</li>
      <li>No illegal, explicit, or harmful content</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">5. Enforcement</h2>
    <p className="text-zinc-400 leading-relaxed">
      Violations may result in:
    </p>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Warning notification</li>
      <li>Temporary suspension of account</li>
      <li>Permanent ban from the platform</li>
      <li>Referral to law enforcement if required</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">6. Reporting Violations</h2>
    <p className="text-zinc-400 leading-relaxed">
      If you witness a violation of this policy, report it on Telegram: <a href="https://t.me/dudei0" className="text-emerald-400 hover:underline">@dudei0</a>
    </p>
  </LegalLayout>
);

export default AcceptableUsePolicy;
