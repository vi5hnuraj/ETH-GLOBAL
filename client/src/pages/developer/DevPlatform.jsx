import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FiGrid, FiCpu, FiCode, FiBarChart2, FiCreditCard, FiBookOpen, FiSettings,
  FiActivity, FiDollarSign, FiTerminal, FiRefreshCw, FiShoppingBag, FiPackage, FiFileText, FiTrendingDown, FiGlobe, FiGitBranch, FiRepeat,
  FiBox, FiLayers, FiStar, FiUsers, FiShield, FiZap, FiDownload, FiPieChart, FiKey, FiServer, FiPlus, FiUpload, FiBell, FiAlertTriangle
} from 'react-icons/fi';
import useSetup from '../../hooks/useSetup';
import SetupRequired from '../../components/dev/SetupRequired';
import Skeleton from '../../components/dev/Skeleton';
import OrgSwitcher from '../../components/dev/OrgSwitcher';
import EnvBadge from '../../components/dev/EnvBadge';
import { ArcConnectWallet } from '../../components/dev/ArcConnectWallet';
import { getOrganizationId } from '../../utils/identity';
import logoImg from '../../assets/logo.jpeg';

const NAV_GROUPS = [
  {
    label: 'Organization',
    items: [
      { to: '/developer/network/profile', label: 'Public Profile', icon: FiGlobe },
      { to: '/developer/organizations', label: 'Organizations', icon: FiUsers, end: true },
      { to: '/developer/organizations/members', label: 'Team', icon: FiUsers },
      { to: '/developer/notifications', label: 'Notifications', icon: FiBell },
      { to: '/developer/settings', label: 'Settings', icon: FiSettings }
    ]
  },
  {
    label: 'Develop',
    items: [
      { to: '/developer/api', label: 'API Keys', icon: FiKey },
      { to: '/developer/webhooks', label: 'Webhooks', icon: FiRefreshCw },
      { to: '/developer/playground', label: 'Playground', icon: FiTerminal },
      { to: '/developer/marketplace/services', label: 'Services', icon: FiPackage, end: true },
      { to: '/developer/marketplace/services/publish', label: 'Publish', icon: FiPlus, end: true },
      { to: '/developer/status', label: 'Status', icon: FiActivity }
    ]
  },
  {
    label: 'Automate',
    items: [
      { to: '/developer/agents', label: 'AI Agents', icon: FiCpu },
      { to: '/developer/network/workflows', label: 'Workflows', icon: FiGitBranch },
    ]
  },
  {
    label: 'Marketplace',
    items: [
      { to: '/developer/marketplace', label: 'Browse', icon: FiShoppingBag, end: true },
      { to: '/developer/commerce/recommendations', label: 'AI Recommendations', icon: FiTrendingDown },
      { to: '/developer/commerce/sessions', label: 'Purchases', icon: FiShoppingBag },
      { to: '/developer/marketplace/invoices', label: 'Receipts', icon: FiFileText },
      { to: '/developer/marketplace/revenue', label: 'Revenue', icon: FiBarChart2 },
      { to: '/developer/agent-marketplace', label: 'Agent Store', icon: FiShoppingBag, end: true },
      { to: '/developer/agent-marketplace/installed', label: 'Installed', icon: FiDownload, end: true },
      { to: '/developer/agent-marketplace/store', label: 'Publisher Hub', icon: FiUpload, end: true },
      { to: '/developer/agent-marketplace/consumer', label: 'Usage', icon: FiBarChart2, end: true }
    ]
  },
  {
    label: 'Insights',
    items: [
      { to: '/developer/analytics', label: 'Analytics', icon: FiBarChart2 },
      { to: '/developer/network/analytics', label: 'Network', icon: FiRepeat },
      { to: '/developer/usage', label: 'API Usage', icon: FiActivity }
    ]
  },
  {
    label: 'Billing',
    items: [
      { to: '/developer/billing', label: 'Plans & Billing', icon: FiCreditCard }
    ]
  },
  {
    label: 'Resources',
    items: [
      { to: '/developer/docs', label: 'Documentation', icon: FiBookOpen },
      { to: '/developer/changelog', label: 'Changelog', icon: FiGitBranch }
    ]
  }
];

const DASHBOARD_ITEM = { to: '/developer', label: 'Dashboard', icon: FiGrid, end: true };

const FLAT_NAV = [
  DASHBOARD_ITEM,
  ...NAV_GROUPS.flatMap((g) => g.items)
];

const DevPlatform = () => {
  const { status, loading, error, refresh } = useSetup();

  const setupRequired = status?.setupRequired === true;
  const [orgKey, setOrgKey] = useState(getOrganizationId() || 'default');
  const [orgVersion, setOrgVersion] = useState(0);
  const location = useLocation();
  const mainRef = React.useRef(null);

  useEffect(() => {
    const el = mainRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [location.pathname]);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-zinc-950 border-r border-zinc-800 p-4 h-full overflow-y-auto">
        <div className="px-3 py-2 mb-3 flex items-center gap-3">
          <img src={logoImg} alt="GlobalPay" className="h-8 w-8 object-contain rounded-lg" />
          <div>
            <p className="text-[10px] text-zinc-500">Developer console</p>
            <h1 className="text-sm font-extrabold text-white">GlobalPay</h1>
          </div>
        </div>
        <OrgSwitcher onChange={(id) => { setOrgKey(id || 'default'); setOrgVersion((v) => v + 1); }} />
        <nav>
          <ul className="space-y-1 pb-3">
            <li>
              <NavLink
                to={DASHBOARD_ITEM.to}
                end={DASHBOARD_ITEM.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-800/50'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
                  }`
                }
              >
                <DASHBOARD_ITEM.icon size={16} /> Dashboard
              </NavLink>
            </li>
          </ul>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-800/50'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
                        }`
                      }
                    >
                      <Icon size={16} /> {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-2 px-3 pt-4 mt-4 border-t border-zinc-800 text-xs text-zinc-500">
          <EnvBadge />
          <p className="text-cyan-400/90 font-medium">⚡ Built on Arc L1 (USDC Native Gas)</p>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden flex-none w-full sticky top-0 z-30 bg-zinc-950 border-b border-zinc-800 p-3 overflow-x-auto">
        <div className="flex gap-2">
          {FLAT_NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/developer'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                  isActive ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-400'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Content */}
      <main ref={mainRef} className="flex-1 min-h-0 min-w-0 p-6 md:p-8 bg-zinc-950 text-white overflow-y-auto">
        {location.pathname === '/developer' && <ArcConnectWallet />}
        {loading && !status ? (
          <div className="space-y-6">
            <Skeleton className="h-8 w-56 rounded mb-6" />
            <div className="grid lg:grid-cols-2 gap-6">
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          </div>
        ) : (error && !status) || status?.degraded ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <FiAlertTriangle size={32} className="text-amber-500 mb-4" />
            <p className="text-lg font-semibold text-zinc-200">Unable to load developer workspace.</p>
            <p className="text-sm text-zinc-500 mt-1 max-w-md">
              {status?.degraded
                ? 'The platform is temporarily degraded. Check the backend services, then retry.'
                : 'The platform API did not respond. Check that the backend is running, then retry.'}
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-lg"
            >
              <FiRefreshCw size={14} /> Retry
            </button>
          </div>
        ) : setupRequired ? (
          <SetupRequired status={status} loading={loading} error={error} onRefresh={refresh} />
        ) : (
          <Outlet key={`${orgKey}-${orgVersion}-${location.pathname}`} />
        )}
      </main>
    </div>
  );
};

export default DevPlatform;
