import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FiGrid, FiUsers, FiShoppingBag, FiCreditCard, FiGlobe, FiShield,
  FiActivity, FiRefreshCw, FiServer, FiZap, FiFileText, FiSettings,
  FiAlertTriangle, FiSearch, FiKey
} from 'react-icons/fi';

const NAV_GROUPS = [
  {
    label: 'Management',
    items: [
      { to: '/admin/developers', label: 'Developers', icon: FiUsers },
      { to: '/admin/organizations', label: 'Organizations', icon: FiGlobe },
      { to: '/admin/profile-approvals', label: 'Profile Approvals', icon: FiShield },
      { to: '/admin/marketplace', label: 'Marketplace', icon: FiShoppingBag },
    ]
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/payments', label: 'Payments', icon: FiCreditCard },
      { to: '/admin/wallets', label: 'Wallets', icon: FiKey },
    ]
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/platform', label: 'Platform', icon: FiServer },
      { to: '/admin/audit-logs', label: 'Audit Logs', icon: FiFileText },
    ]
  }
];

const DASHBOARD_ITEM = { to: '/admin', label: 'Dashboard', icon: FiGrid, end: true };

const FLAT_NAV = [
  DASHBOARD_ITEM,
  ...NAV_GROUPS.flatMap((g) => g.items)
];

const AdminPlatform = () => {
  const location = useLocation();
  const mainRef = useRef(null);

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
        <div className="px-3 py-2 mb-3">
          <p className="text-xs text-zinc-500">Admin console</p>
          <h1 className="text-lg font-extrabold text-gradient">GlobalPay Admin</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <FiShield size={11} className="text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Super Admin</span>
          </div>
        </div>
        <nav>
          <ul className="space-y-1 pb-3">
            <li>
              <NavLink
                to={DASHBOARD_ITEM.to}
                end={DASHBOARD_ITEM.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-800/50'
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
                {group.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-amber-600/20 text-amber-400 border border-amber-800/50'
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
          <p className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Platform Online
          </p>
          <a href="/developer" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            ← Developer Console
          </a>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden flex-none w-full sticky top-0 z-30 bg-zinc-950 border-b border-zinc-800 p-3 overflow-x-auto">
        <div className="flex gap-2">
          {FLAT_NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                  isActive ? 'bg-amber-600/30 text-amber-300' : 'text-zinc-400'
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
        <Outlet />
      </main>
    </div>
  );
};

export default AdminPlatform;
