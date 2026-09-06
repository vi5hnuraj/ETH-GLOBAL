import { useEffect, useMemo, useState } from 'react';
import {
  FiAlertTriangle,
  FiChevronDown,
  FiChevronRight,
  FiPlus,
  FiSearch,
  FiShield,
  FiX
} from 'react-icons/fi';

/**
 * KeyPermissionsEditor — the permission/expiration/IP section of the create and
 * edit API key modals. Data-driven: add a resource (with its actions, labels,
 * descriptions and sensitivity flags) to PERMISSION_GROUPS and it renders with
 * zero component changes.
 *
 * Features: presets (Full Access / Read Only / Custom), live search that
 * filters groups + actions while preserving selection, per-resource collapse,
 * global "select all", a live selected-permission summary, amber
 * "Sensitive"/"Admin" badges, tag-chip IP allowlist with validation, and
 * expiration presets + custom date.
 *
 * Scope format: V3 canonical `resource.action` strings.
 */

export const PERMISSION_GROUPS = [
  {
    key: 'organizations',
    label: 'Organizations',
    description: 'View and manage organization workspace',
    icon: '🏢',
    actions: [
      { scope: 'organizations.read', label: 'Read', description: 'View organization details and settings' },
      { scope: 'organizations.write', label: 'Write', description: 'Create, update and delete organizations', badge: 'sensitive' }
    ]
  },
  {
    key: 'members',
    label: 'Members',
    description: 'Manage team members and roles',
    icon: '👥',
    actions: [
      { scope: 'members.read', label: 'Read', description: 'List members, roles and invitations' },
      { scope: 'members.write', label: 'Write', description: 'Invite, update and remove members', badge: 'sensitive' }
    ]
  },
  {
    key: 'api_keys',
    label: 'API Keys',
    description: 'Manage developer API keys',
    icon: '🔑',
    actions: [
      { scope: 'api_keys.read', label: 'Read', description: 'List API keys and their status' },
      { scope: 'api_keys.write', label: 'Write', description: 'Create, update, rotate and revoke API keys', badge: 'sensitive' }
    ]
  },
  {
    key: 'agents',
    label: 'AI Agents',
    description: 'Create and manage AI agents',
    icon: '🤖',
    actions: [
      { scope: 'agents.read', label: 'Read', description: 'View agents, stats and configuration' },
      { scope: 'agents.write', label: 'Write', description: 'Create, update and delete AI agents', badge: 'sensitive' },
      { scope: 'agents.execute', label: 'Execute', description: 'Invoke agents and send payments from agents', badge: 'sensitive' }
    ]
  },
  {
    key: 'marketplace',
    label: 'AI Marketplace',
    description: 'Discover and manage AI agents and services',
    icon: '🛒',
    actions: [
      { scope: 'marketplace.read', label: 'Read', description: 'Browse the agent and service catalog' },
      { scope: 'marketplace.publish', label: 'Publish', description: 'Publish agents and services to the marketplace', badge: 'sensitive' },
      { scope: 'marketplace.install', label: 'Install', description: 'Install marketplace agents and services', badge: 'sensitive' }
    ]
  },
  {
    key: 'services',
    label: 'AI Services',
    description: 'Publish and manage AI services',
    icon: '⚙️',
    actions: [
      { scope: 'services.read', label: 'Read', description: 'View published AI services' },
      { scope: 'services.write', label: 'Write', description: 'Create and update AI services', badge: 'sensitive' },
      { scope: 'services.manage', label: 'Manage', description: 'Manage capabilities and pricing for services', badge: 'sensitive' }
    ]
  },
  {
    key: 'workflows',
    label: 'Workflow Marketplace',
    description: 'Discover and install workflow templates',
    icon: '🔄',
    actions: [
      { scope: 'workflows.read', label: 'Read', description: 'Browse workflow templates' },
      { scope: 'workflows.publish', label: 'Publish', description: 'Publish workflow templates', badge: 'sensitive' },
      { scope: 'workflows.install', label: 'Install', description: 'Install workflow templates into projects' }
    ]
  },
  {
    key: 'commerce',
    label: 'Commerce',
    description: 'Purchase sessions and procurement policies',
    icon: '🛍️',
    actions: [
      { scope: 'sessions.read', label: 'Sessions Read', description: 'View purchase sessions' },
      { scope: 'sessions.create', label: 'Sessions Create', description: 'Create purchase sessions' },
      { scope: 'sessions.manage', label: 'Sessions Manage', description: 'Approve, start and cancel sessions', badge: 'sensitive' }
    ]
  },
  {
    key: 'usage',
    label: 'Usage',
    description: 'API usage and metering',
    icon: '📊',
    actions: [
      { scope: 'usage.read', label: 'Read', description: 'View API usage metrics and logs' },
      { scope: 'usage.write', label: 'Write', description: 'Report usage to the metering service', badge: 'sensitive' }
    ]
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description: 'View and pay invoices',
    icon: '🧾',
    actions: [
      { scope: 'invoices.read', label: 'Read', description: 'View invoices and billing history' },
      { scope: 'invoices.pay', label: 'Pay', description: 'Pay outstanding invoices', badge: 'sensitive' }
    ]
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'Send money and manage payments',
    icon: '💸',
    actions: [
      { scope: 'payments.read', label: 'Read', description: 'View payments and their status' },
      { scope: 'payments.send', label: 'Send', description: 'Initiate new payments', badge: 'sensitive' },
      { scope: 'payments.refund', label: 'Refund', description: 'Refund processed payments', badge: 'sensitive' }
    ]
  },
  {
    key: 'wallets',
    label: 'Wallets',
    description: 'Manage wallet balances',
    icon: '👛',
    actions: [
      { scope: 'wallets.read', label: 'Read', description: 'View wallet balances and addresses' },
      { scope: 'wallets.manage', label: 'Manage', description: 'Manage wallet configurations and settings', badge: 'admin' }
    ]
  },
  {
    key: 'transactions',
    label: 'Transactions',
    description: 'View transaction history',
    icon: '📒',
    actions: [
      { scope: 'transactions.read', label: 'Read', description: 'Read transaction history for agents and wallets' }
    ]
  },
  {
    key: 'revenue',
    label: 'Revenue',
    description: 'Revenue reporting',
    icon: '💰',
    actions: [
      { scope: 'revenue.read', label: 'Read', description: 'View revenue attribution and payout data' }
    ]
  },
  {
    key: 'network',
    label: 'Business Network',
    description: 'Company profiles and network relationships',
    icon: '🌐',
    actions: [
      { scope: 'network.read', label: 'Read', description: 'View company profiles and network relationships' },
      { scope: 'network.manage', label: 'Manage', description: 'Update company profile and network settings', badge: 'admin' }
    ]
  },
  {
    key: 'partnerships',
    label: 'Partnerships',
    description: 'Manage business partnerships',
    icon: '🤝',
    actions: [
      { scope: 'partnerships.read', label: 'Read', description: 'View partnership proposals and status' },
      { scope: 'partnerships.manage', label: 'Manage', description: 'Accept and manage partnership agreements', badge: 'admin' }
    ]
  },
  {
    key: 'projects',
    label: 'Projects',
    description: 'Manage collaboration projects',
    icon: '📁',
    actions: [
      { scope: 'projects.read', label: 'Read', description: 'View collaboration projects and participants' },
      { scope: 'projects.manage', label: 'Manage', description: 'Create and manage projects and participants', badge: 'admin' }
    ]
  },
  {
    key: 'workspaces',
    label: 'Workspaces',
    description: 'Enterprise workspace management',
    icon: '🏢',
    actions: [
      { scope: 'workspaces.read', label: 'Read', description: 'View workspace entities and configurations' },
      { scope: 'workspaces.manage', label: 'Manage', description: 'Create and configure workspaces', badge: 'admin' }
    ]
  },
  {
    key: 'trust',
    label: 'Trust Score',
    description: 'Trust and reputation scores',
    icon: '⭐',
    actions: [
      { scope: 'trust.read', label: 'Read', description: 'View trust scores and reputation metrics' }
    ]
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'View analytics and reports',
    icon: '📈',
    actions: [
      { scope: 'analytics.read', label: 'Read', description: 'View platform analytics and network stats' }
    ]
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    description: 'Security audit trail',
    icon: '📝',
    actions: [
      { scope: 'audit.read', label: 'Read', description: 'View audit logs and security events' }
    ]
  },
  {
    key: 'webhooks',
    label: 'Webhooks',
    description: 'Configure webhook endpoints',
    icon: '🪝',
    actions: [
      { scope: 'webhooks.read', label: 'Read', description: 'List endpoints and deliveries' },
      { scope: 'webhooks.write', label: 'Write', description: 'Create, update and delete webhook endpoints', badge: 'sensitive' }
    ]
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Manage invoices and subscriptions',
    icon: '🧾',
    actions: [
      { scope: 'billing.read', label: 'Read', description: 'View plan, invoices and limits' },
      { scope: 'billing.manage', label: 'Manage', description: 'Change plans and payment method', badge: 'admin' }
    ]
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Modify organization settings',
    icon: '⚙️',
    actions: [
      { scope: 'settings.read', label: 'Read', description: 'View organization settings and keys' },
      { scope: 'settings.write', label: 'Write', description: 'Change settings, keys and security', badge: 'admin' }
    ]
  }
];

export const ALL_PERMISSION_SCOPES = PERMISSION_GROUPS.flatMap((g) => g.actions.map((a) => a.scope));

const READ_SCOPES = ALL_PERMISSION_SCOPES.filter((s) => s.endsWith('.read'));

const PRESETS = [
  { id: 'all', label: 'Full Access', hint: 'Every permission' },
  { id: 'read', label: 'Read Only', hint: 'View-only access' },
  { id: 'custom', label: 'Custom', hint: 'Manual selection' }
];

const EXPIRY_PRESETS = [
  { id: 'never', label: 'Never expires' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '180', label: '180 days' },
  { id: 'custom', label: 'Custom date' }
];

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------- IP / CIDR validation (mirrors the backend net checks) ----------

const CIDR_RE = /^(.+?)\/(\d{1,3})$/;

const isIPv4 = (v) => {
  const parts = v.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
};

const isIPv6 = (v) => {
  if (v.includes('::')) {
    const [head, tail] = v.split('::');
    const headG = head ? head.split(':') : [];
    const tailG = tail ? tail.split(':') : [];
    const groups = [...headG, ...tailG];
    if (headG.length + tailG.length >= 8) return false;
    return groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g));
  }
  const groups = v.split(':');
  if (groups.length !== 8) return false;
  return groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g));
};

export const isValidIpOrCidr = (value) => {
  const v = String(value || '').trim();
  if (!v) return false;
  const m = v.match(CIDR_RE);
  if (m) {
    const prefix = Number(m[2]);
    if (isIPv4(m[1])) return prefix >= 0 && prefix <= 32;
    if (isIPv6(m[1])) return prefix >= 0 && prefix <= 128;
    return false;
  }
  return isIPv4(v) || isIPv6(v);
};

const BADGE_STYLES = {
  sensitive: 'bg-amber-900/40 text-amber-400 border-amber-800',
  admin: 'bg-amber-900/40 text-amber-400 border-amber-800'
};

const BADGE_LABELS = { sensitive: 'Sensitive', admin: 'Admin' };

const Checkbox = ({ checked, onChange, label, ariaLabel }) => (
  <label className="group flex cursor-pointer items-center gap-2.5 select-none">
    <input
      type="checkbox"
      className="peer sr-only"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel || label}
    />
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-600 bg-zinc-900 text-[10px] font-bold leading-none text-white transition-colors after:content-[''] peer-checked:border-indigo-500 peer-checked:bg-indigo-600 peer-checked:after:content-['✓'] peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/60" />
    {label != null && <span className="text-sm text-zinc-200">{label}</span>}
  </label>
);

function PermissionGroup({ group, selected, onToggleAction, onToggleGroup }) {
  const [open, setOpen] = useState(true);
  const allOn = group.actions.every((a) => selected.has(a.scope));
  const someOn = group.actions.some((a) => selected.has(a.scope));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 rounded-l-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-900"
          aria-expanded={open}
        >
          <span className="text-xs">{group.icon}</span>
          <span className="text-xs">{open ? <FiChevronDown className="h-4 w-4 text-zinc-500" /> : <FiChevronRight className="h-4 w-4 text-zinc-500" />}</span>
          <span className="text-sm font-medium text-zinc-100">{group.label}</span>
          <span className="text-xs text-zinc-500">· {group.actions.length} permission{group.actions.length > 1 ? 's' : ''}</span>
        </button>
        <Checkbox
          checked={allOn}
          onChange={() => onToggleGroup(group)}
          ariaLabel={`Select all ${group.label} permissions`}
        />
      </div>

      {open && (
        <div className="border-t border-zinc-800 px-3 pb-2 pt-1">
          <p className="mb-1.5 px-1 text-xs text-zinc-500">{group.description}</p>
          <div className="space-y-0.5">
            {group.actions.map((action) => {
              const on = selected.has(action.scope);
              return (
                <label
                  key={action.scope}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-900"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={on}
                    onChange={() => onToggleAction(action.scope)}
                    aria-label={`${action.label} — ${action.scope}`}
                  />
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-600 bg-zinc-900 text-[10px] font-bold leading-none text-white transition-colors after:content-[''] peer-checked:border-indigo-500 peer-checked:bg-indigo-600 peer-checked:after:content-['✓'] peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-zinc-200">{action.label}</span>
                    <span className="block truncate text-[11px] text-zinc-500">{action.description}</span>
                  </span>
                  <code className="hidden font-mono text-[10px] text-zinc-600 sm:block">{action.scope}</code>
                  {action.badge && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${BADGE_STYLES[action.badge]}`}>
                      {action.badge === 'admin' ? <FiShield className="h-2.5 w-2.5" /> : <FiAlertTriangle className="h-2.5 w-2.5" />}
                      {BADGE_LABELS[action.badge]}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function KeyPermissionsEditor({
  scopes,
  onScopesChange,
  ipAllowlist = [],
  onIpAllowlistChange,
  expiresAt = '',
  onExpiresAtChange
}) {
  const selected = useMemo(() => new Set(scopes), [scopes]);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState(() => {
    if (scopes.length === ALL_PERMISSION_SCOPES.length) return 'all';
    if (scopes.length > 0 && scopes.every((s) => s.endsWith('.read'))) return 'read';
    return 'custom';
  });
  const [ipInput, setIpInput] = useState('');
  const [ipError, setIpError] = useState(null);
  const [expiryMode, setExpiryMode] = useState(() => (expiresAt ? 'custom' : 'never'));
  const [customDate, setCustomDate] = useState(expiresAt ? String(expiresAt).slice(0, 10) : '');
  const [expiryError, setExpiryError] = useState(null);

  useEffect(() => {
    if (expiryMode === 'custom' && customDate && customDate < addDays(0)) {
      setExpiryError('Expiration cannot be in the past.');
    } else {
      setExpiryError(null);
    }
  }, [customDate, expiryMode]);

  const q = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!q) return PERMISSION_GROUPS.map((g) => ({ ...g, actions: g.actions }));
    return PERMISSION_GROUPS.map((g) => {
      const actions = g.actions.filter(
        (a) =>
          a.scope.toLowerCase().includes(q) ||
          a.label.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      );
      if (!actions.length && !g.label.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) return null;
      return { ...g, actions: actions.length ? actions : g.actions };
    }).filter(Boolean);
  }, [q]);

  const allOn = ALL_PERMISSION_SCOPES.every((s) => selected.has(s));
  const someOn = ALL_PERMISSION_SCOPES.some((s) => selected.has(s));

  const applyPreset = (id) => {
    setPreset(id);
    if (id === 'all') onScopesChange([...ALL_PERMISSION_SCOPES]);
    else if (id === 'read') onScopesChange([...READ_SCOPES]);
  };

  const toggleAction = (scope) =>
    onScopesChange(selected.has(scope) ? scopes.filter((s) => s !== scope) : [...scopes, scope]);

  const toggleGroup = (group) => {
    const groupScopes = group.actions.map((a) => a.scope);
    const allOnGroup = groupScopes.every((s) => selected.has(s));
    const next = new Set(scopes);
    groupScopes.forEach((s) => (allOnGroup ? next.delete(s) : next.add(s)));
    onScopesChange([...next]);
  };

  const addIp = () => {
    const v = ipInput.trim();
    if (!v) return;
    if (!isValidIpOrCidr(v)) {
      setIpError('Enter a valid IPv4/IPv6 address or CIDR, e.g. 203.0.113.10 or 198.51.100.0/24.');
      return;
    }
    if (ipAllowlist.includes(v)) {
      setIpError(`"${v}" is already on the allowlist.`);
      return;
    }
    onIpAllowlistChange([...ipAllowlist, v]);
    setIpInput('');
    setIpError(null);
  };

  const changeExpiry = (mode) => {
    setExpiryMode(mode);
    setExpiryError(null);
    if (mode === 'never') onExpiresAtChange('');
    else if (mode === '30') onExpiresAtChange(addDays(30));
    else if (mode === '90') onExpiresAtChange(addDays(90));
    else if (mode === '180') onExpiresAtChange(addDays(180));
    else {
      if (customDate) {
        if (customDate < addDays(0)) setExpiryError('Expiration cannot be in the past.');
        else onExpiresAtChange(customDate);
      } else {
        onExpiresAtChange('');
      }
    }
  };

  // Build a live summary of selected scopes grouped by resource
  const selectedSummary = useMemo(() => {
    const byGroup = {};
    selected.forEach((s) => {
      const group = PERMISSION_GROUPS.find((g) => g.actions.some((a) => a.scope === s));
      if (group) {
        if (!byGroup[group.label]) byGroup[group.label] = [];
        byGroup[group.label].push(s.replace(`${group.key}.`, ''));
      }
    });
    return Object.entries(byGroup);
  }, [selected]);

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-zinc-300">Access</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-950/50'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="permission-preset"
                  className="peer sr-only"
                  checked={active}
                  onChange={() => applyPreset(p.id)}
                />
                <span className={`text-sm font-medium ${active ? 'text-indigo-300' : 'text-zinc-200'}`}>{p.label}</span>
                <span className="text-[11px] text-zinc-500">{p.hint}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Search + select-all + count */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permissions…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
            />
          </div>
          <Checkbox checked={allOn} onChange={(v) => onScopesChange(v ? [...ALL_PERMISSION_SCOPES] : [])} label="Select all" />
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs ${selected.size ? 'text-indigo-400' : 'text-zinc-500'}`}>
            {selected.size} of {ALL_PERMISSION_SCOPES.length} permission{selected.size === 1 ? '' : 's'} selected
          </span>
          {someOn && !allOn && (
            <button type="button" onClick={() => onScopesChange([...ALL_PERMISSION_SCOPES])} className="text-xs text-zinc-400 hover:text-zinc-200">
              Select all
            </button>
          )}
        </div>

        {/* Live selected-permission summary */}
        {selected.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedSummary.map(([groupLabel, perms]) => (
              <div
                key={groupLabel}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1"
              >
                <span className="text-[10px] font-medium text-zinc-300">{groupLabel}</span>
                <span className="text-[10px] text-zinc-500">· {perms.join(', ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permission groups */}
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {visibleGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-sm text-zinc-500">
            No permissions match “{search}”.
          </p>
        )}
        {visibleGroups.map((g) => (
          <PermissionGroup key={g.key} group={g} selected={selected} onToggleAction={toggleAction} onToggleGroup={toggleGroup} />
        ))}
      </div>

      {/* IP allowlist */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-zinc-300">IP allowlist <span className="font-normal text-zinc-500">(optional)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {ipAllowlist.map((ip) => (
            <span key={ip} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-300">
              {ip}
              <button
                type="button"
                onClick={() => onIpAllowlistChange(ipAllowlist.filter((x) => x !== ip))}
                className="text-zinc-500 transition-colors hover:text-red-400"
                aria-label={`Remove ${ip}`}
              >
                <FiX className="h-3 w-3" />
              </button>
            </span>
          ))}
          {ipAllowlist.length > 0 && (
            <button
              type="button"
              onClick={() => onIpAllowlistChange([])}
              className="text-[11px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="mt-1.5 flex gap-2">
          <input
            value={ipInput}
            onChange={(e) => {
              setIpInput(e.target.value);
              if (ipError) setIpError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addIp();
              }
            }}
            placeholder="203.0.113.10 or 198.51.100.0/24"
            className={`flex-1 rounded-lg border bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500 ${
              ipError ? 'border-red-500' : 'border-zinc-700'
            }`}
          />
          <button
            type="button"
            onClick={addIp}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <FiPlus className="h-3.5 w-3.5" /> Add IP
          </button>
        </div>
        {ipError && <p className="mt-1 text-xs text-red-400">{ipError}</p>}
        {!ipError && ipAllowlist.length === 0 && (
          <p className="mt-1 text-xs text-zinc-500">When set, requests are only accepted from these IP addresses.</p>
        )}
      </div>

      {/* Expiration */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-zinc-300">Expiration</p>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_PRESETS.map((p) => {
            const active = expiryMode === p.id;
            return (
              <label
                key={p.id}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  active ? 'border-indigo-500 bg-indigo-950/50 text-indigo-300' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="key-expiry"
                  className="peer sr-only"
                  checked={active}
                  onChange={() => changeExpiry(p.id)}
                />
                {p.label}
              </label>
            );
          })}
        </div>
        {expiryMode === 'custom' && (
          <div className="mt-2">
            <input
              type="date"
              value={customDate}
              min={addDays(0)}
              onChange={(e) => {
                const v = e.target.value;
                setCustomDate(v);
                if (v) {
                  if (v < addDays(0)) setExpiryError('Expiration cannot be in the past.');
                  else {
                    setExpiryError(null);
                    onExpiresAtChange(v);
                  }
                }
              }}
              className={`rounded-lg border bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 ${expiryError ? 'border-red-500' : 'border-zinc-700'}`}
            />
          </div>
        )}
        {expiryError && <p className="mt-1 text-xs text-red-400">{expiryError}</p>}
      </div>
    </div>
  );
}
