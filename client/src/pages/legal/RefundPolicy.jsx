import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const RefundPolicy = () => (
  <LegalLayout title="Refund Policy" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. Overview</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay operates on Arc L1 using USDC native gas and Circle tools. Due to the nature of blockchain transactions, refunds follow specific guidelines outlined below.
    </p>

    <h2 className="text-2xl font-bold text-white">2. Subscription Refunds</h2>
    <h3 className="text-lg font-semibold text-zinc-200">Pro Plan (49 USDC/month)</h3>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Monthly subscriptions can be cancelled at any time</li>
      <li>No refund for the current billing period once payment is confirmed on-chain</li>
      <li>Your Pro access continues until the end of the current billing period</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">3. Marketplace Transaction Refunds</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>All marketplace transactions are final once confirmed on Arc L1</li>
      <li>If a service was not delivered as described, contact the developer directly</li>
      <li>GlobalPay can mediate disputes but cannot reverse on-chain transactions</li>
      <li>Refunds between parties must be processed as new transactions</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">4. Agent Store Refunds</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Agent installations are non-refundable once the agent is installed</li>
      <li>If an agent is defective, report it for review and potential delisting</li>
      <li>Developers may offer voluntary refunds at their discretion</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">5. Gas Fees</h2>
    <p className="text-zinc-400 leading-relaxed">
      All gas fees paid to the Ethereum network are non-refundable. These fees are paid to network validators, not to GlobalPay.
    </p>

    <h2 className="text-2xl font-bold text-white">6. How to Request a Refund</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Contact support via Telegram: <a href="https://t.me/dudei0" className="text-emerald-400 hover:underline">@dudei0</a></li>
      <li>Provide your wallet address and transaction hash</li>
      <li>Describe the issue clearly</li>
      <li>Response time: within 48 hours</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">7. Chargebacks</h2>
    <p className="text-zinc-400 leading-relaxed">
      Attempting to reverse on-chain transactions through external payment providers may result in account suspension.
    </p>
  </LegalLayout>
);

export default RefundPolicy;
