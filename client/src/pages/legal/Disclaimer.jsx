import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const Disclaimer = () => (
  <LegalLayout title="Disclaimer" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. General Disclaimer</h2>
    <p className="text-zinc-400 leading-relaxed">
      The information and services provided by GlobalPay are offered on an "as is" and "as available" basis. We make no warranties, expressed or implied, regarding the platform's reliability, accuracy, or availability.
    </p>

    <h2 className="text-2xl font-bold text-white">2. Financial Disclaimer</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay is a technology platform, not a financial advisor. Nothing on this platform constitutes financial, investment, or trading advice. Digital assets are volatile — you may lose value. Always do your own research.
    </p>

    <h2 className="text-2xl font-bold text-white">3. On-Chain Transactions</h2>
    <p className="text-zinc-400 leading-relaxed">
      All blockchain transactions are irreversible. Once confirmed on-chain, transactions cannot be undone. GlobalPay is not responsible for errors in transaction amounts, addresses, or timing.
    </p>

    <h2 className="text-2xl font-bold text-white">4. AI Agent Disclaimer</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>AI agents are automated software — they may make errors</li>
      <li>Agent payments should be monitored and budgeted</li>
      <li>GlobalPay is not liable for agent behavior or decisions</li>
      <li>Users retain responsibility for agent actions within their account</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">5. Third-Party Services</h2>
    <p className="text-zinc-400 leading-relaxed">
      GlobalPay integrates with blockchain networks, wallet providers, and other third-party services. We are not responsible for the availability, accuracy, or policies of external services.
    </p>

    <h2 className="text-2xl font-bold text-white">6. Regulatory Compliance</h2>
    <p className="text-zinc-400 leading-relaxed">
      Users are responsible for complying with local laws and regulations regarding digital assets and blockchain technology in their jurisdiction.
    </p>

    <h2 className="text-2xl font-bold text-white">7. Limitation of Liability</h2>
    <p className="text-zinc-400 leading-relaxed">
      To the maximum extent permitted by law, GlobalPay shall not be liable for any indirect, incidental, special, or consequential damages arising from use of the platform.
    </p>
  </LegalLayout>
);

export default Disclaimer;
