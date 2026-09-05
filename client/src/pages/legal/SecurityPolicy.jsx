import React from 'react';
import LegalLayout from '../../components/legal/LegalLayout';

const SecurityPolicy = () => (
  <LegalLayout title="Security Policy" lastUpdated="August 30, 2026">
    <h2 className="text-2xl font-bold text-white">1. Our Security Commitment</h2>
    <p className="text-zinc-400 leading-relaxed">
      Security is foundational to GlobalPay. As a platform handling wallet infrastructure and on-chain payments, we implement multiple layers of protection.
    </p>

    <h2 className="text-2xl font-bold text-white">2. MPC Wallet Security</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Multi-Party Computation — no single private key exists in one place</li>
      <li>Key shares distributed across multiple secure servers</li>
      <li>Signing requires M-of-N key share agreement</li>
      <li>Even if one server is compromised, funds remain safe</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">3. Platform Security</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>JWT-based authentication with secure token storage</li>
      <li>API key authentication for developer access</li>
      <li>Role-Based Access Control (RBAC) for organizations</li>
      <li>HTTPS encryption for all API communication</li>
      <li>Input validation and sanitization on all endpoints</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">4. Data Protection</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Passwords are hashed with bcrypt (never stored in plain text)</li>
      <li>API keys stored securely in database with limited scope</li>
      <li>Webhook secrets encrypted at rest</li>
      <li>No private keys stored in client-side code</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">5. Smart Contract Security</h2>
    <p className="text-zinc-400 leading-relaxed">
      Core smart contracts are verified and immutable. The network uses Byzantine Fault Tolerant consensus with slashing for malicious validators. Contracts undergo security audits before deployment.
    </p>

    <h2 className="text-2xl font-bold text-white">6. Bug Bounty</h2>
    <p className="text-zinc-400 leading-relaxed">
      We encourage responsible disclosure of security vulnerabilities. If you discover a security issue, contact us directly on Telegram: <a href="https://t.me/dudei0" className="text-emerald-400 hover:underline">@dudei0</a>
    </p>

    <h2 className="text-2xl font-bold text-white">7. Incident Response</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Security incidents are investigated within 24 hours</li>
      <li>Affected users are notified promptly</li>
      <li>Platform may be temporarily paused for critical fixes</li>
      <li>Post-incident reports are published transparently</li>
    </ul>

    <h2 className="text-2xl font-bold text-white">8. Your Responsibilities</h2>
    <ul className="list-disc list-inside text-zinc-400 space-y-1">
      <li>Keep your account credentials secure</li>
      <li>Never share API keys in public repositories</li>
      <li>Use strong, unique passwords</li>
      <li>Enable two-factor authentication when available</li>
      <li>Verify wallet addresses before transacting</li>
    </ul>
  </LegalLayout>
);

export default SecurityPolicy;
