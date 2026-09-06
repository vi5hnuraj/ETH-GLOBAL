import React from 'react';
import { FiClock, FiGitBranch, FiDownload, FiExternalLink, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { useState } from 'react';
import Card from '../../components/dev/Card';

const CHANGELOG = [
  {
    version: '3.0.0',
    date: '2026-08-19',
    title: 'GlobalPay V3 — AI Agent Commerce Platform',
    type: 'major',
    sections: [
      {
        label: 'AI Agent Marketplace',
        items: [
          'Full agent marketplace with browse, install, invoke, and subscription management',
          'Agent listings with versioning, reviews, and trust scoring',
          'Smart-procurement routing for optimal agent selection',
          'Consumer and provider dashboards for marketplace analytics'
        ]
      },
      {
        label: 'Business Network',
        items: [
          'Company directory with verified profiles and capabilities',
          'Relationship graphs for partnerships, referrals, and supplier chains',
          'Trust score AI model based on transaction history and network behavior',
          'Projects for cross-org collaboration with workflow marketplace'
        ]
      },
      {
        label: 'Commerce & Payments',
        items: [
          'Usage-based metering and reporting for agents and services',
          'Automated invoice generation, payment, and reconciliation',
          'Purchase sessions with approval workflows and multi-party escrow',
          'Revenue attribution across API usage, agent transactions, and wallet creation'
        ]
      },
      {
        label: 'Network Intelligence',
        items: [
          'Smart-procurement engine with cost/latency/quality optimization',
          'Workflow templates and deployment for recurring procurement',
          'Network analytics with provider switching and failover',
          'Real-time activity feed for network events'
        ]
      },
      {
        label: 'Developer Experience',
        items: [
          'Expanded API Playground with 16+ V3 endpoints',
          'SDK quickstarts for JavaScript, Python, Go, Java, PHP, and cURL',
          'OpenAPI 3.1 spec with 40+ new V3 paths',
          'Enhanced dashboard with V3 metrics (services, installs, trust score, projects)'
        ]
      },
      {
        label: 'Authentication & Security',
        items: [
          'V3 scope catalog (40+ scopes) with backward-compatible legacy format',
          'API key presets for common use cases (Agent Builder, Marketplace Consumer, Network Partner)',
          'IP allowlist and expiration per key',
          'Organization-scoped webhook events with HMAC-SHA256 signatures'
        ]
      }
    ]
  },
  {
    version: '2.5.0',
    date: '2026-06-15',
    title: 'Agent Payments & Wallets',
    type: 'minor',
    sections: [
      {
        label: 'Agent Wallets',
        items: [
          'Headless BOT Chain wallet provisioning on agent creation',
          'One-time agent API keys (gpay_sk_…) with automatic rotation',
          'Balance, history, and stats endpoints for agent wallets'
        ]
      },
      {
        label: 'Payments',
        items: [
          'Agent-to-agent payments with memo support',
          'Transaction history with filtering and pagination',
          'Payment statistics (volume, unique recipients, 7-day trends)'
        ]
      }
    ]
  },
  {
    version: '2.0.0',
    date: '2026-03-01',
    title: 'Developer Platform GA',
    type: 'major',
    sections: [
      {
        label: 'Core Platform',
        items: [
          'Organizations with role-based member management',
          'Developer API keys (gpay_dev_…) with granular scopes',
          'Real-time dashboard with API usage, wallet growth, and revenue charts'
        ]
      },
      {
        label: 'Documentation',
        items: [
          'Interactive API reference with live playground',
          'SDK quickstarts and OpenAPI specification',
          'Webhook management with delivery logs and retry'
        ]
      }
    ]
  },
  {
    version: '1.5.0',
    date: '2025-11-20',
    title: 'Webhooks & Monitoring',
    type: 'minor',
    sections: [
      {
        label: 'Webhooks',
        items: [
          'Event subscription for agent.created, payment.completed, api_key.rotated',
          'HMAC-SHA256 signature verification',
          'Delivery logs with retry and manual replay'
        ]
      },
      {
        label: 'Monitoring',
        items: [
          'Request monitoring with p50/p95/p99 latency',
          'Error rate tracking and alerting',
          'RPC health checks and uptime monitoring'
        ]
      }
    ]
  },
  {
    version: '1.0.0',
    date: '2025-08-01',
    title: 'GlobalPay Beta Launch',
    type: 'major',
    sections: [
      {
        label: 'Initial Release',
        items: [
          'Agent creation with wallet provisioning',
          'Basic payment sending and balance checking',
          'Developer API with authentication and rate limiting'
        ]
      }
    ]
  }
];

const DevChangelog = () => {
  const [expanded, setExpanded] = useState({});

  const toggle = (version) => {
    setExpanded(prev => ({ ...prev, [version]: !prev[version] }));
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Changelog</h1>
        <p className="text-sm text-zinc-500 mt-1">Version history and release notes for the GlobalPay Developer Platform.</p>
      </header>

      <div className="flex flex-col gap-4">
        {CHANGELOG.map((release, idx) => {
          const isExpanded = expanded[release.version] ?? (idx === 0);
          const typeColor = release.type === 'major' ? 'text-amber-400' : 'text-emerald-400';
          const typeBg = release.type === 'major' ? 'bg-amber-900/30' : 'bg-emerald-900/30';

          return (
            <Card key={release.version} className="bg-zinc-950/50 border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${typeColor} ${typeBg}`}>
                    {release.type.toUpperCase()}
                  </span>
                  <h3 className="font-semibold text-white">v{release.version}</h3>
                  <span className="text-sm text-zinc-500">{release.date}</span>
                </div>
                <button
                  onClick={() => toggle(release.version)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                </button>
              </div>

              <div className={`grid transition-all duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden min-h-0">
                  <div className="mt-4">
                    <p className="text-sm text-zinc-400 mb-4 font-medium">{release.title}</p>
                    <div className="space-y-4">
                      {release.sections.map((section) => (
                        <div key={section.label} className="pl-4 border-l border-zinc-800">
                          <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{section.label}</h4>
                          <ul className="space-y-1.5 text-sm text-zinc-300">
                            {section.items.map((item, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-emerald-400 shrink-0">→</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-zinc-800">
        <div className="flex flex-wrap gap-3">
          <a
            href="/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            <FiDownload size={14} /> Download OpenAPI Spec (v3.0)
          </a>
          <a
            href="https://github.com/globalpay/globalpay-platform/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            <FiExternalLink size={14} /> View on GitHub
          </a>
          <a
            href="https://github.com/globalpay/globalpay-platform/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            <FiGitBranch size={14} /> Full Changelog (Markdown)
          </a>
        </div>
      </div>
    </div>
  );
};

export default DevChangelog;