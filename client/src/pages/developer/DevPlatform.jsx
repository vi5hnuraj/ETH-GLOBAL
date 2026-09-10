import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FiGrid, FiCpu, FiCode, FiBarChart2, FiCreditCard, FiBookOpen, FiSettings,
  FiActivity, FiDollarSign, FiTerminal, FiRefreshCw, FiShoppingBag, FiPackage, FiFileText, FiTrendingDown, FiGlobe, FiGitBranch,
  FiBox, FiLayers, FiStar, FiUsers, FiShield, FiZap, FiDownload, FiPieChart, FiKey, FiServer, FiUpload, FiBell, FiAlertTriangle, FiMessageSquare,
  FiMenu, FiChevronLeft, FiChevronRight, FiX
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
    label: 'Develop',
    items: [
      { to: '/developer/api', label: 'API Keys', icon: FiKey },
      { to: '/developer/webhooks', label: 'Webhooks', icon: FiRefreshCw },
      { to: '/developer/playground', label: 'Playground', icon: FiTerminal },
      { to: '/developer/marketplace/services', label: 'Services', icon: FiPackage, end: true },
      { to: '/developer/status', label: 'Status', icon: FiActivity },
      { to: '/developer/x402', label: 'x402 APIs', icon: FiDollarSign }
    ]
  },
  {
    label: 'Automate',
    items: [
      { to: '/developer/agents', label: 'Agent Studio', icon: FiCpu },
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
      { to: '/developer/agent-marketplace/store', label: 'Publish Agent', icon: FiUpload, end: true },
      { to: '/developer/agent-marketplace/consumer', label: 'Usage', icon: FiBarChart2, end: true }
    ]
  },
  {
    label: 'Insights',
    items: [
        { to: '/developer/analytics', label: 'Analytics', icon: FiBarChart2 },
        { to: '/developer/graph-intelligence', label: 'Trust Engine', icon: FiShield },
        { to: '/developer/commerce/autonomous', label: 'Autonomous Commerce', icon: FiZap },
        { to: '/developer/assistant', label: 'AI Assistant', icon: FiMessageSquare },
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
    label: 'Organization',
    items: [
      { to: '/developer/organizations', label: 'Organizations', icon: FiUsers, end: true },
      { to: '/developer/organizations/members', label: 'Team', icon: FiUsers },
      { to: '/developer/notifications', label: 'Notifications', icon: FiBell },
      { to: '/developer/settings', label: 'Settings', icon: FiSettings }
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
const PROFILE_ITEM = { to: '/developer/network/profile', label: 'Profile & Identity', icon: FiGlobe };

const FLAT_NAV = [
  DASHBOARD_ITEM,
  PROFILE_ITEM,
  ...NAV_GROUPS.flatMap((g) => g.items)
];

const DevPlatform = () => {
  const { status, loading, error, refresh } = useSetup();

  const setupRequired = status?.setupRequired === true;
  const [orgKey, setOrgKey] = useState(getOrganizationId() || 'default');
  const [orgVersion, setOrgVersion] = useState(0);
  const location = useLocation();
  const mainRef = React.useRef(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return typeof window === 'undefined' || window.localStorage.getItem('globalpay:developer-sidebar') !== 'collapsed';
    } catch {
      return true;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarExpanded((expanded) => {
      const next = !expanded;
      try {
        window.localStorage.setItem('globalpay:developer-sidebar', next ? 'expanded' : 'collapsed');
      } catch {
        // Sidebar preference is non-critical when storage is unavailable.
      }
      return next;
    });
  };

  useEffect(() => {
    const el = mainRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [location.pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  const renderNavLink = ({ to, label, icon: Icon, end }, mobile = false) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      title={!sidebarExpanded && !mobile ? label : undefined}
      onClick={() => mobile && setMobileNavOpen(false)}
      className={({ isActive }) =>
        `group relative flex items-center ${sidebarExpanded || mobile ? 'gap-3' : 'justify-center'} rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'border-blue-800/50 bg-blue-600/20 text-blue-400'
            : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-white'
        }`
      }
    >
      <Icon size={16} className="shrink-0" />
      {(sidebarExpanded || mobile) && <span className="truncate">{label}</span>}
      {!sidebarExpanded && !mobile && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
          {label}
        </span>
      )}
    </NavLink>
  );

  const renderNavigation = (mobile = false) => (
    <nav aria-label="Developer navigation">
      <ul className="space-y-1 pb-3">
        <li>{renderNavLink(DASHBOARD_ITEM, mobile)}</li>
        <li>{renderNavLink(PROFILE_ITEM, mobile)}</li>
      </ul>
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {(sidebarExpanded || mobile) && (
            <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
              {group.label}
            </p>
          )}
          {!sidebarExpanded && !mobile && <div className="mx-2 my-3 border-t border-zinc-800" />}
          <ul className="space-y-1">
            {group.items.map((item) => <li key={item.to}>{renderNavLink(item, mobile)}</li>)}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarExpanded ? 'w-60' : 'w-[4.5rem]'} hidden md:flex flex-col shrink-0 bg-zinc-950 border-r border-zinc-800 p-3 h-full overflow-y-auto transition-[width] duration-300`}>
        <div className={`px-2 py-2 mb-3 flex items-center ${sidebarExpanded ? 'justify-between' : 'justify-center'}`}>
          <div className={`flex items-center ${sidebarExpanded ? 'gap-3' : ''}`}>
          <img src={logoImg} alt="GlobalPay" className="h-8 w-8 object-contain rounded-lg" />
          {sidebarExpanded && <div className="min-w-0">
            <p className="text-[10px] text-zinc-500">Developer console</p>
            <h1 className="text-sm font-extrabold text-white">GlobalPay</h1>
          </div>}
          </div>
          <button type="button" onClick={toggleSidebar} className="group relative rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white" aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarExpanded ? <FiChevronLeft size={17} /> : <FiChevronRight size={17} />}
          </button>
        </div>
        <div className={`${sidebarExpanded ? 'block' : 'flex justify-center'} mb-3`}>
          <OrgSwitcher collapsed={!sidebarExpanded} onChange={(id) => { setOrgKey(id || 'default'); setOrgVersion((v) => v + 1); }} />
        </div>
        {renderNavigation()}

        <div className={`mt-auto space-y-2 ${sidebarExpanded ? 'px-3' : 'px-1'} pt-4 mt-4 border-t border-zinc-800 text-xs text-zinc-500`}>
          {sidebarExpanded && <><EnvBadge /><p className="text-cyan-400/90 font-medium">⚡ Built on Arc L1 (USDC Native Gas)</p></>}
        </div>
      </aside>

      {/* Mobile navigation */}
      <div className="md:hidden flex-none flex items-center justify-between border-b border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="GlobalPay" className="h-7 w-7 rounded-lg object-contain" />
          <span className="text-sm font-bold text-white">GlobalPay</span>
        </div>
        <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-900 hover:text-white" aria-label="Open navigation">
          <FiMenu size={20} />
        </button>
      </div>

      {mobileNavOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(19rem,88vw)] flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-4 shadow-2xl transition-transform duration-300 md:hidden ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Mobile navigation">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><img src={logoImg} alt="GlobalPay" className="h-8 w-8 rounded-lg object-contain" /><div><p className="text-[10px] text-zinc-500">Developer console</p><p className="text-sm font-extrabold text-white">GlobalPay</p></div></div>
          <button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Close navigation"><FiX size={18} /></button>
        </div>
        <OrgSwitcher onChange={(id) => { setOrgKey(id || 'default'); setOrgVersion((v) => v + 1); }} />
        {renderNavigation(true)}
      </aside>

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
