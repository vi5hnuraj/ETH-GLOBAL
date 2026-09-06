import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  FiActivity,
  FiBookOpen,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiCode,
  FiCopy,
  FiEdit2,
  FiGlobe,
  FiLock,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTrash2,
  FiX
} from 'react-icons/fi';
import { developerApi } from '../../utils/developerApi';
import KeyPermissionsEditor, { ALL_PERMISSION_SCOPES } from '../../components/dev/KeyPermissionsEditor';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import StatusBadge from '../../components/dev/StatusBadge';
import Pagination from '../../components/dev/Pagination';
import ConfirmModal from '../../components/dev/ConfirmModal';

const formatNumber = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString();
};

const formatLargeNumber = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

const RANGE_TABS = [
  { key: '24h', label: '24 hours', api: 'day' },
  { key: '7d', label: '7 days', api: 'week' },
  { key: '30d', label: '30 days', api: 'month' },
  { key: '1y', label: '1 year', api: 'year' }
];

const STATUS_LABELS = {
  active: 'Active',
  revoked: 'Revoked',
  expired: 'Expired',
  suspended: 'Suspended'
};

const AUDIT_LABELS = {
  'api_key.created': 'Created an API key',
  'api_key.updated': 'Updated an API key',
  'api_key.rotated': 'Rotated an API key',
  'api_key.revoked': 'Revoked an API key',
  'api_key.deleted': 'Deleted an API key',
  'agent.created': 'Created an AI agent',
  'agent.updated': 'Updated an AI agent',
  'agent.deleted': 'Deleted an AI agent',
  'wallet.created': 'Provisioned a wallet',
  'webhook.created': 'Created a webhook endpoint',
  'webhook.updated': 'Updated a webhook endpoint',
  'webhook.deleted': 'Deleted a webhook endpoint',
  'subscription.updated': 'Changed the billing plan',
  'settings.updated': 'Updated developer settings'
};

const humanAction = (action) =>
  AUDIT_LABELS[action] ||
  String(action || '')
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const latencyTone = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n)) return 'text-zinc-500';
  if (n < 200) return 'text-emerald-400';
  if (n < 800) return 'text-amber-400';
  return 'text-red-400';
};

const METHOD_TONE = {
  GET: 'bg-blue-500/15 text-blue-300 border-blue-400/20',
  POST: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  PUT: 'bg-amber-500/15 text-amber-300 border-amber-400/20',
  PATCH: 'bg-violet-500/15 text-violet-300 border-violet-400/20',
  DELETE: 'bg-red-500/15 text-red-300 border-red-400/20'
};

const REF_EXAMPLES = {
  curl: (ep, params = {}) => {
    const q = Object.entries(params).length
      ? '?' +
        Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join('&')
      : '';
    return `curl 'https://api.globalpay.io${ep}${q}' \\
  -H "Authorization: Bearer gpay_dev_xxx" \\
  -H "Content-Type: application/json"`;
  },
  ts: (ep, params = {}) => {
    const q = Object.keys(params).length
      ? `?${Object.keys(params)
          .map((k) => `${k}: ${JSON.stringify(params[k])}`)
          .join('&')}`
      : '';
    return `const res = await fetch(\`https://api.globalpay.io${ep.replace(/:([a-zA-Z_]+)/g, '${$1}')}${q}\`, {
  headers: {
    Authorization: 'Bearer gpay_dev_xxx',
    'Content-Type': 'application/json'
  }
});
const data = await res.json();`;
  },
  py: (ep) => `import requests

resp = requests.get(
    "https://api.globalpay.io${ep}",
    headers={"Authorization": "Bearer gpay_dev_xxx"}
)
print(resp.json())`,
  go: (ep) => `req, _ := http.NewRequest("GET", "https://api.globalpay.io${ep}", nil)
req.Header.Set("Authorization", "Bearer gpay_dev_xxx")
resp, err := http.DefaultClient.Do(req)`,
  rust: (ep) => `let client = reqwest::Client::new();
let resp = client
    .get("https://api.globalpay.io${ep}")
    .header("Authorization", "Bearer gpay_dev_xxx")
    .send()
    .await?;`
};

const REF_TABS = [
  { key: 'curl', label: 'cURL' },
  { key: 'ts', label: 'TypeScript' },
  { key: 'py', label: 'Python' },
  { key: 'go', label: 'Go' },
  { key: 'rust', label: 'Rust' }
];

const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatAxisLabel = (label, rangeKey) => {
  if (!label) return '';
  if (rangeKey === '24h') return label;
  if (rangeKey === '1y') {
    const [y, m] = label.split('-').map(Number);
    return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`;
  }
  const [y, m, d] = label.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d}`;
};

const timeAgo = (iso) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function DevApi() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usage, setUsage] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [keys, setKeys] = useState([]);
  const [agents, setAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [audits, setAudits] = useState([]);
  const [endpoints, setEndpoints] = useState([]);

  const [range, setRange] = useState('7d');
  const [keySearch, setKeySearch] = useState('');
  const [keyStatus, setKeyStatus] = useState('all');
  const [expandedKey, setExpandedKey] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [logFilter, setLogFilter] = useState({
    endpoint: '',
    method: 'all',
    status: 'all'
  });
  const [logPage, setLogPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [endpointSearch, setEndpointSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [successKey, setSuccessKey] = useState(null);
  const [auditDetail, setAuditDetail] = useState(null);
  const [refEp, setRefEp] = useState(null);

  const fetchAll = async (silent) => {
    if (!silent) setLoading(true);
    try {
      const [u, m, k, ag, lg, ad, ep] = await Promise.all([
        developerApi.get('/developers/usage'),
        developerApi.get('/developers/monitoring'),
        developerApi.get('/developers/api-keys'),
        developerApi.get('/developers/agents?perPage=50'),
        developerApi.get('/developers/requests?perPage=500'),
        developerApi.get('/developers/audit'),
        developerApi.get('/openapi.json')
      ]);
      setUsage(u.usage || {});
      setMonitoring(m.monitoring || {});
      setKeys(k.apiKeys || []);
      setAgents(ag.agents || []);
      setLogs(lg.logs || []);
      setAudits(ad.auditLogs?.logs || []);
      setEndpoints(ep.paths ? Object.entries(ep.paths) : []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const t = setInterval(() => fetchAll(true), 25_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apiRange = (RANGE_TABS.find((r) => r.key === range) || RANGE_TABS[1]).api;
    developerApi
      .get(`/developers/analytics?range=${apiRange}`)
      .then((res) => {
        if (!cancelled) setAnalytics(res.analytics || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range]);

  const kpis = useMemo(() => {
    const avgMs = Number(monitoring?.usage?.avgLatencyMs || usage?.avgLatencyMs || 0);
    const month = usage?.requestsThisMonth || 0;
    const remaining = usage?.remainingRequests;
    return {
      requestsToday: usage?.requestsToday || 0,
      successRate: usage?.successRate != null ? usage.successRate : '0.0',
      avgLatencyMs: avgMs ? Math.round(avgMs) : 0,
      month,
      limit: remaining != null ? month + remaining : null
    };
  }, [usage, monitoring]);

  const chartData = useMemo(() => {
    const rows = analytics?.chart || [];
    return rows.map((d) => ({ label: d.date, total: Number(d.requests || 0) }));
  }, [analytics]);

  const chartTotal = useMemo(
    () => chartData.reduce((s, d) => s + d.total, 0),
    [chartData]
  );

  const statusBuckets = useMemo(() => {
    const b = usage?.statusBuckets || {};
    const keys = ['2xx', '3xx', '4xx', '5xx'];
    const max = Math.max(1, ...keys.map((k) => Number(b[k] || 0)));
    return keys.map((k) => ({
      key: k,
      count: Number(b[k] || 0),
      pct: (Number(b[k] || 0) / max) * 100
    }));
  }, [usage]);

  const topErrors = useMemo(() => (usage?.topErrors || []).slice(0, 3), [usage]);

  const filteredKeys = useMemo(() => {
    const q = keySearch.toLowerCase();
    return keys.filter((k) => {
      const matchesSearch =
        !q || (k.name || '').toLowerCase().includes(q) || k.status.includes(q);
      const matchesStatus =
        keyStatus === 'all' || (keyStatus === 'expired' ? isExpiredKey(k) : k.status === keyStatus);
      return matchesSearch && matchesStatus;
    });
  }, [keys, keySearch, keyStatus]);

  const logSummary = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => Number(l.statusCode) < 400).length;
    const avgMs =
      total > 0
        ? Math.round(
            logs.reduce((s, l) => s + Number(l.durationMs || 0), 0) / total
          )
        : 0;
    return { total, success, avgMs };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const ep = (logFilter.endpoint || '').toLowerCase();
      const matchesEp =
        !ep || (l.endpoint || '').toLowerCase().includes(ep);
      const matchesMethod =
        logFilter.method === 'all' || (l.method || 'GET') === logFilter.method;
      const matchesStatus =
        logFilter.status === 'all' ||
        (logFilter.status === 'success'
          ? Number(l.statusCode) < 400
          : Number(l.statusCode) >= 400);
      return matchesEp && matchesMethod && matchesStatus;
    });
  }, [logs, logFilter]);

  const paginatedLogs = useMemo(() => {
    const perPage = 10;
    const start = (logPage - 1) * perPage;
    return filteredLogs.slice(start, start + perPage);
  }, [filteredLogs, logPage]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / 10));

  const paginatedAudits = useMemo(() => {
    const perPage = 8;
    const start = (auditPage - 1) * perPage;
    return audits.slice(start, start + perPage);
  }, [audits, auditPage]);

  const totalAuditPages = Math.max(1, Math.ceil(audits.length / 8));

  const filteredEndpoints = useMemo(() => {
    const q = endpointSearch.toLowerCase();
    const list = endpoints.filter(
      ([path, def]) =>
        !q ||
        path.toLowerCase().includes(q) ||
        (def.summary || '').toLowerCase().includes(q) ||
        (def.tags || []).join(' ').toLowerCase().includes(q)
    );
    // Group by first tag
    const groups = {};
    for (const [path, def] of list) {
      const [method] = Object.keys(def).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k));
      const op = def[method || 'get'] || {};
      const tag = (op.tags && op.tags[0]) || 'Other';
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push([path, def]);
    }
    return groups;
  }, [endpoints, endpointSearch]);

  const restrictedKeys = useMemo(
    () =>
      keys.filter((k) => {
        const ip = k.ipAllowlist || k.ip_allowlist;
        return Array.isArray(ip) && ip.length > 0;
      }).length,
    [keys]
  );

  const agentsStats = useMemo(() => {
    const total = agents.length;
    const req = agents.reduce((s, a) => s + (a.requestCount || 0), 0);
    const vol = agents.reduce((s, a) => s + Number(a.volumeBOT || 0), 0);
    return { total, req, vol: vol.toFixed(2) };
  }, [agents]);

  const agentNameById = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.agentId, a.name])),
    [agents]
  );

  const percentiles = useMemo(() => {
    const p = monitoring?.usage?.percentileLatencyMs || {};
    return [
      { label: 'p50', value: Number(p[50] || 0) },
      { label: 'p90', value: Number(p[90] || 0) },
      { label: 'p95', value: Number(p[95] || 0) },
      { label: 'p99', value: Number(p[99] || 0) }
    ];
  }, [monitoring]);

  const latencyMax = Math.max(
    1,
    ...percentiles.map((p) => p.value),
    kpis.avgLatencyMs
  );

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  const handleCopy = async (text, label) => {
    await copyToClipboard(text);
    setSuccessKey({ title: `Copied ${label}`, message: 'Pasted to your clipboard.' });
    setTimeout(() => setSuccessKey(null), 2000);
  };

  const doDelete = async (k) => {
    setDeleting(true);
    try {
      await developerApi.delete(`/developers/api-keys/${k.id}`);
      setKeys((prev) => prev.filter((key) => key.id !== k.id));
      setDeleteTarget(null);
      if (expandedKey === k.id) setExpandedKey(null);
      setSuccessKey({ title: 'Key deleted', message: `"${k.name}" has been permanently deleted.` });
    } catch (err) {
      setDeleteTarget(null);
      setSuccessKey({ title: 'Delete failed', message: err.message || 'Failed to delete key.' });
    } finally {
      setDeleting(false);
    }
  };

  const doRotate = async (k) => {
    const res = await developerApi.post(`/developers/api-keys/${k.id}/rotate`);
    setSuccessKey({
      title: 'Key rotated',
      message: `${k.name} now uses a new secret. Save it now — you won't see it again.`,
      apiKey: res.apiKey
    });
    fetchAll(true);
    return res;
  };

  const doRevoke = async (k) => {
    await developerApi.post(`/developers/api-keys/${k.id}/revoke`);
    await fetchAll(true);
  };

  const performRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await doRevoke(revokeTarget);
      // Optimistically update UI immediately
      setKeys((prev) => prev.map((k) => k.id === revokeTarget.id ? { ...k, status: 'revoked' } : k));
      setSuccessKey({ title: 'Key revoked', message: `"${revokeTarget.name}" is now revoked and cannot be reactivated.` });
    } catch (err) {
      setSuccessKey({ title: 'Revoke failed', message: err.message || 'Failed to revoke key.' });
    } finally {
      setRevokeTarget(null);
    }
  };

  const revokeAll = () => {
    const active = keys.filter((k) => !isExpiredKey(k) && k.status === 'active');
    if (!active.length) return;
    setConfirmRevokeAll(true);
  };

  const performRevokeAll = async () => {
    const active = keys.filter((k) => !isExpiredKey(k) && k.status === 'active');
    try {
      for (const k of active) await developerApi.post(`/developers/api-keys/${k.id}/revoke`);
      setConfirmRevokeAll(false);
      await fetchAll(true);
    } catch (err) {
      setSuccessKey({ title: 'Revoke failed', message: err.message || 'Failed to revoke keys.' });
      setConfirmRevokeAll(false);
    }
  };

  const isExpiredKey = (k) => {
    if (!k.expiresAt) return false;
    return new Date(k.expiresAt).getTime() < Date.now();
  };

  const keyStatusOf = (k) => (isExpiredKey(k) ? 'expired' : k.status);
  const keyStatusLabel = (k) => STATUS_LABELS[keyStatusOf(k)] || k.status;

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/60 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              API Management
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Monitor how your API performs, manage credentials, and debug every
              request your agents make.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/developer/docs"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <FiCode className="h-4 w-4" /> View documentation
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <FiPlus className="h-4 w-4" /> Create key
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-400">Requests today</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
              {formatNumber(kpis.requestsToday)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {kpis.month > 0 ? `${formatLargeNumber(kpis.month)} this month` : 'No requests yet'}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-400">Success rate</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
              {kpis.successRate}%
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {logSummary.success} of {logSummary.total} recent requests
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-400">Average latency</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
              {kpis.avgLatencyMs}
              <span className="ml-1 text-sm font-normal text-zinc-500">ms</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              p95 {Math.round(percentiles.find((p) => p.label === 'p95')?.value || 0)} ms
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-400">Monthly usage</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
              {formatLargeNumber(kpis.month)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {kpis.limit
                ? `${formatLargeNumber(Math.max(0, kpis.limit - kpis.month))} requests remaining`
                : 'Unlimited plan'}
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => fetchAll()} />}

      {/* Analytics: request volume + latency */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Request volume"
          subtitle="Requests to the API over the selected period"
          className="lg:col-span-2"
          actions={
            <div className="flex items-center gap-1 rounded-lg bg-zinc-800/70 p-1">
              {RANGE_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setRange(t.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    range === t.key
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          }
        >
          {chartData.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#27272a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tickFormatter={(l) => formatAxisLabel(l, range)}
                    tick={{ fill: '#71717a', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      fontSize: 12,
                      color: '#fafafa'
                    }}
                    labelFormatter={(l) => formatAxisLabel(l, range)}
                    formatter={(v) => [formatNumber(v), 'Requests']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#vol)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={FiActivity}
              title="No requests yet"
              description="Once your agents start calling the API, volume appears here."
              actionLabel="Open the playground"
              actionHref="/developer/playground"
            />
          )}
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4 lg:grid-cols-4">
            {[
              { label: 'API calls', value: formatLargeNumber(chartTotal) },
              { label: 'Payments', value: formatNumber(analytics?.payments || 0) },
              { label: 'BOT volume', value: `${Number(analytics?.botVolumeBOT || 0).toFixed(2)} BOT` },
              { label: 'Wallets', value: formatNumber(analytics?.walletsCreated || 0) }
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xs text-zinc-500">{s.label}</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-100">{s.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Latency"
          subtitle="Response times across percentiles"
        >
          <div className="flex items-end gap-2">
            <p className="text-3xl font-semibold tracking-tight text-white">
              {kpis.avgLatencyMs}
              <span className="ml-1 text-base font-normal text-zinc-500">ms</span>
            </p>
            <p className="mb-1 text-sm text-zinc-500">average</p>
          </div>
          <div className="mt-5 space-y-4">
            {percentiles.map((p) => (
              <div key={p.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-zinc-400">{p.label}</span>
                  <span className="font-medium text-zinc-100">
                    {Math.round(p.value)} ms
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${
                      p.value > 800 ? 'bg-red-500' : p.value > 200 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(4, (p.value / latencyMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
            Latency is measured from request receipt to response sent. p99 stays under 800 ms on
            healthy plans.
          </p>
        </Card>
      </div>

      {/* Analytics: errors + live activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Errors" subtitle="Response distribution and failures">
          <div className="space-y-3">
            {statusBuckets.map((b) => (
              <div key={b.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-zinc-400">{b.key} responses</span>
                  <span className="font-medium text-zinc-100">{formatNumber(b.count)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${
                      b.key === '2xx'
                        ? 'bg-emerald-500'
                        : b.key === '3xx'
                          ? 'bg-sky-500'
                          : b.key === '4xx'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(2, b.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {topErrors.length > 0 && (
            <div className="mt-5 border-t border-zinc-800 pt-4">
              <p className="mb-2 text-xs font-medium text-zinc-400">Top errors</p>
              <div className="space-y-2">
                {topErrors.map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate font-mono text-xs text-zinc-400">
                      {e.error || e.endpoint || '—'}
                    </span>
                    <span className="ml-2 shrink-0 text-red-400">
                      {formatNumber(e.count || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Live activity"
          subtitle={`Real-time request stream · refreshes every 25 seconds`}
          className="lg:col-span-2"
          actions={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          }
        >
          {logs.length ? (
            <ul className="divide-y divide-zinc-800/70">
              {logs.slice(0, 6).map((l) => {
                const code = Number(l.statusCode || 0);
                return (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`w-14 shrink-0 rounded border px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                        METHOD_TONE[l.method || 'GET'] || METHOD_TONE.GET
                      }`}
                    >
                      {l.method || 'GET'}
                    </span>
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
                      {l.endpoint || '—'}
                    </code>
                    {agentNameById[l.agentId] && (
                      <span className="hidden shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400 sm:inline">
                        {agentNameById[l.agentId]}
                      </span>
                    )}
                    <span
                      className={`shrink-0 font-mono text-xs font-semibold ${
                        code >= 500
                          ? 'text-red-400'
                          : code >= 400
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      {code || '—'}
                    </span>
                    <span className={`shrink-0 font-mono text-xs ${latencyTone(l.durationMs)}`}>
                      {Number(l.durationMs || 0).toFixed(0)} ms
                    </span>
                    <span className="hidden shrink-0 text-xs text-zinc-500 md:inline">
                      {timeAgo(l.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={FiActivity}
              title="No traffic yet"
              description="Requests from your agents will stream in here in real time."
              actionLabel="Open the playground"
              actionHref="/developer/playground"
            />
          )}
        </Card>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="API keys"
          subtitle={`${keys.length} key${keys.length === 1 ? '' : 's'} on this account · ${restrictedKeys} protected by an IP allowlist`}
          className="lg:col-span-2"
          actions={
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <FiPlus className="h-3.5 w-3.5" /> Create key
            </button>
          }
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                placeholder="Search keys by name or status"
                aria-label="Search API keys"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500"
              />
            </div>
            <select
              value={keyStatus}
              onChange={(e) => setKeyStatus(e.target.value)}
              aria-label="Filter keys by status"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {filteredKeys.length ? (
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
                <thead className="bg-zinc-900/60">
                  <tr>
                    {['Name', 'Permissions', 'Status', 'Last used'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-xs font-medium text-zinc-500"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 bg-zinc-900/30">
                  {filteredKeys.map((k) => {
                    const id = k.id;
                    const scopes = k.scopes || [];
                    const shown = scopes.slice(0, 2);
                    const expanded = expandedKey === id;
                    return (
                      <FragmentRow
                        key={id}
                        id={id}
                        k={k}
                        expanded={expanded}
                        keyStatusLabel={keyStatusLabel}
                        onToggle={() =>
                          setExpandedKey(expanded ? null : id)
                        }
                        onEdit={() => {
                          setEditingKey(k);
                          setShowEdit(true);
                        }}
                        onCopy={(text, label) => handleCopy(text, label)}
                        doDelete={setDeleteTarget}
                        doRotate={doRotate}
                        doRevoke={setRevokeTarget}
                        fmtDate={fmtDate}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : keys.length ? (
            <EmptyState
              icon={FiSearch}
              title="No matching keys"
              description="Try a different search or clear the status filter."
            />
          ) : (
            <EmptyState
              icon={FiLock}
              title="Create your first API key"
              description="API keys authorize your agents to call the GlobalPay API. Keys can be scoped and restricted by IP."
              actionLabel="Create a key"
              onAction={() => setShowCreate(true)}
            />
          )}
        </Card>

        <Card
          title="AI agents"
          subtitle={`${agentsStats.total} agents · ${formatNumber(agentsStats.req)} requests · ${agentsStats.vol} BOT`}
          actions={
            <Link
              to="/developer/agents"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              Manage
            </Link>
          }
        >
          {agents.length ? (
            <ul className="space-y-2">
              {agents.map((a) => (
                <li
                  key={a.agentId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 transition-colors hover:border-zinc-700"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {a.name || a.agentId}
                      </p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                      {a.wallet ? `${a.wallet.slice(0, 8)}…${a.wallet.slice(-4)}` : 'No wallet'}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatNumber(a.requestCount || 0)} requests ·{' '}
                      {Number(a.balance ?? 0)} BOT balance
                    </p>
                  </div>
                  <Link
                    to={`/developer/agents/${a.agentId}`}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-zinc-400 transition-colors hover:text-white"
                  >
                    Open
                    <FiChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FiShield}
              title="No agents yet"
              description="Create an AI agent to start transacting with the GlobalPay API."
              actionLabel="Create an agent"
              actionHref="/developer/agents"
            />
          )}
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <button
              onClick={revokeAll}
              disabled={!keys.some((k) => !isExpiredKey(k) && k.status === 'active')}
              className="text-xs font-medium text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:text-zinc-600"
            >
              Revoke all active keys
            </button>
          </div>
        </Card>
      </div>

      {/* Request logs */}
      <Card
        title="Request logs"
        subtitle={`${filteredLogs.length} matching request${filteredLogs.length === 1 ? '' : 's'} · showing the most recent`}
      >
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={logFilter.endpoint}
              onChange={(e) => {
                setLogFilter((s) => ({ ...s, endpoint: e.target.value }));
                setLogPage(1);
              }}
              placeholder="Filter by endpoint"
              aria-label="Filter logs by endpoint"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500"
            />
          </div>
          <select
            value={logFilter.method}
            onChange={(e) => {
              setLogFilter((s) => ({ ...s, method: e.target.value }));
              setLogPage(1);
            }}
            aria-label="Filter logs by method"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
          >
            <option value="all">All methods</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={logFilter.status}
            onChange={(e) => {
              setLogFilter((s) => ({ ...s, status: e.target.value }));
              setLogPage(1);
            }}
            aria-label="Filter logs by status"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
          >
            <option value="all">All statuses</option>
            <option value="success">Success (2xx–3xx)</option>
            <option value="error">Errors (4xx–5xx)</option>
          </select>
          <button
            onClick={() => setLogFilter({ endpoint: '', method: 'all', status: 'all' })}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            Clear filters
          </button>
        </div>

        {paginatedLogs.length ? (
          <div className="max-h-[560px] overflow-auto rounded-lg border border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-zinc-900 shadow-[0_1px_0_0_#27272a]">
                  {['Time', 'Method', 'Endpoint', 'Status', 'Latency', 'Agent'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-xs font-medium text-zinc-500"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 bg-zinc-900/30">
                {paginatedLogs.map((l) => {
                  const code = Number(l.statusCode || 0);
                  return (
                    <tr key={l.id} className="transition-colors hover:bg-zinc-900">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                        {fmtTime(l.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                            METHOD_TONE[l.method || 'GET'] || METHOD_TONE.GET
                          }`}
                        >
                          {l.method || 'GET'}
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 font-mono text-xs text-zinc-300">
                        {l.endpoint || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`font-mono text-xs font-semibold ${
                            code >= 500
                              ? 'text-red-400'
                              : code >= 400
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                          }`}
                        >
                          {code || '—'}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 font-mono text-xs ${latencyTone(l.durationMs)}`}
                      >
                        {Number(l.durationMs || 0).toFixed(0)} ms
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                        {agentNameById[l.agentId] || l.source || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FiSearch}
            title="No requests match your filters"
            description="Adjust the endpoint, method, or status filters to see more."
            actionLabel="Open the playground"
            actionHref="/developer/playground"
          />
        )}

        <div className="mt-4">
          <Pagination
            page={logPage}
            totalPages={totalLogPages}
            onPageChange={setLogPage}
          />
        </div>
      </Card>

      {/* Audit trail */}
      <Card
        title="Audit trail"
        subtitle="Security-relevant changes to your developer account"
        actions={
          <Link
            to="/developer/settings"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            Security settings
          </Link>
        }
      >
        {audits.length ? (
          <div className="max-h-[320px] overflow-auto rounded-lg border border-zinc-800">
            <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
              <thead>
                <tr>
                  {['Action', 'Performed by', 'When'].map((h) => (
                    <th key={h} className="px-3 py-2 text-xs font-medium text-zinc-500">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {paginatedAudits.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-zinc-900/60">
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-100">{humanAction(a.action)}</span>
                        <code className="hidden rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">
                          {a.action}
                        </code>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {a.actorEmail || (a.actorId ? String(a.actorId).slice(0, 8) + '…' : 'System')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {fmtDate(a.createdAt)} · {timeAgo(a.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {a.metadata && Object.keys(a.metadata).length > 0 ? (
                        <button
                          onClick={() => setAuditDetail(a)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
                        >
                          View details <FiChevronRight className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FiShield}
            title="No audit events yet"
            description="Key creation, rotation, revocation, and security changes appear here."
            actionLabel="Create a key"
            onAction={() => setShowCreate(true)}
          />
        )}
        <div className="mt-4">
          <Pagination page={auditPage} totalPages={totalAuditPages} onPageChange={setAuditPage} />
        </div>
      </Card>

      {/* API reference */}
      <Card
        title="API reference"
        subtitle="Explore every GlobalPay endpoint, its required permissions, and live SDK examples"
        actions={
          <Link
            to="/developer/docs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <FiBookOpen className="h-3.5 w-3.5" /> View full docs
          </Link>
        }
      >
        <div className="relative mb-4">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={endpointSearch}
            onChange={(e) => setEndpointSearch(e.target.value)}
            placeholder="Search endpoints by path, tag, or description"
            aria-label="Search endpoints"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500"
          />
        </div>

        {Object.keys(filteredEndpoints).length ? (
          <div className="space-y-4">
            {Object.entries(filteredEndpoints).map(([tag, eps]) => (
            <div key={tag}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{tag}</h4>
            <div className="space-y-2">
            {eps.map(([path, def]) => {
              const [method] = Object.keys(def).filter((k) =>
                ['get', 'post', 'put', 'patch', 'delete'].includes(k)
              );
              const m = method || 'get';
              const op = def[m] || {};
              const security = op.security || def.security;
              const scopes = (security?.[0]?.developerApiKey || []).map((s) =>
                s.replace(':', ' / ')
              );
              const agentKey = Array.isArray(security?.[0]?.apiKey);
              const isPublic = !security || security.length === 0;
              return (
                <div
                  key={path}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40"
                >
                  <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <span
                      className={`w-16 shrink-0 rounded border px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                        METHOD_TONE[m.toUpperCase()] || METHOD_TONE.GET
                      }`}
                    >
                      {m.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <code className="block truncate font-mono text-xs text-zinc-200">
                        {path}
                      </code>
                      {op.summary && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{op.summary}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {isPublic ? (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                          Public
                        </span>
                      ) : agentKey ? (
                        <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[11px] text-indigo-300">
                          Agent key
                        </span>
                      ) : scopes.length ? (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300">
                          {scopes.length} required scope{scopes.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                          Developer key
                        </span>
                      )}
                      <button
                        onClick={() => setRefEp(refEp === path ? null : path)}
                        className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                      >
                        Details
                        <FiChevronDown
                          className={`h-3 w-3 transition-transform ${refEp === path ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {refEp === path && (
                    <EndpointDetails
                      path={path}
                      method={m.toUpperCase()}
                      op={op}
                      def={def}
                      scopes={scopes}
                      agentKey={agentKey}
                      isPublic={isPublic}
                      handleCopy={handleCopy}
                    />
                  )}
                </div>
              );
            })}
            </div>
            </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FiCode}
            title="No endpoints match your search"
            description="Try a different path, tag, or keyword."
          />
        )}
      </Card>

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(k) => {
            setShowCreate(false);
            // Optimistically add the new key to the list instantly
            setKeys((prev) => [
              {
                id: k.id || `tmp-${Date.now()}`,
                name: k.name,
                key_prefix: k.keyPrefix || k.apiKey?.substring(0, 20) || '',
                status: 'active',
                scopes: k.scopes || [],
                created_at: new Date().toISOString(),
                last_used_at: null,
                expires_at: k.expiresAt || null,
                ip_allowlist: k.ipAllowlist || []
              },
              ...prev
            ]);
            setSuccessKey({
              title: 'Key created',
              message: `${k.name} is ready to use. Save the secret now — you won't see it again.`,
              apiKey: k.apiKey
            });
            // Background refresh to get the real key data from DB
            fetchAll(true);
          }}
        />
      )}
      {showEdit && editingKey && (
        <EditKeyModal
          keyToEdit={editingKey}
          onClose={() => {
            setShowEdit(false);
            setEditingKey(null);
          }}
          onSaved={() => {
            setShowEdit(false);
            setEditingKey(null);
            setSuccessKey({
              title: 'Key updated',
              message: 'Your API key changes are now in effect.'
            });
            setTimeout(() => setSuccessKey(null), 2500);
            fetchAll(true);
          }}
        />
      )}
      {successKey && (
        <SuccessModal
          title={successKey.title}
          message={successKey.message}
          apiKey={successKey.apiKey}
          onClose={() => setSuccessKey(null)}
        />
      )}
      <ConfirmModal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={performRevoke}
        title={`Revoke key "${revokeTarget?.name || ''}"?`}
        description="The key will be immediately invalidated. Ongoing requests using it will fail, and a revoked key cannot be reactivated."
        confirmLabel="Revoke key"
      />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
        busy={deleting}
        title={`Delete API key "${deleteTarget?.name || ''}"?`}
        description="This permanently deletes the key. Any requests using it will fail. This cannot be undone."
        confirmLabel="Delete key"
      />
      <ConfirmModal
        open={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={performRevokeAll}
        title="Revoke all active keys?"
        description={`${keys.filter((k) => !isExpiredKey(k) && k.status === 'active').length} active key(s) will be permanently invalidated. Ongoing requests using them will fail.`}
        confirmLabel="Revoke all"
        confirmClassName="bg-red-600 hover:bg-red-500"
      />
      {auditDetail && (
        <AuditDrawer
          entry={auditDetail}
          onClose={() => setAuditDetail(null)}
        />
      )}
    </div>
  );
}

function FragmentRow({
  id,
  k,
  expanded,
  keyStatusLabel,
  onToggle,
  onEdit,
  onCopy,
  doDelete,
  doRotate,
  doRevoke,
  fmtDate
}) {
  const scopes = k.scopes || [];
  const shown = scopes.slice(0, 2);
  const rest = scopes.slice(2);
  const ip = k.ipAllowlist || k.ip_allowlist;
  const ipList = Array.isArray(ip) ? ip : [];
  const status = keyStatusLabel(k);

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Key ${k.name}, ${status}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`cursor-pointer transition-colors hover:bg-zinc-900 ${expanded ? 'bg-zinc-900/60' : ''}`}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <FiChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
            <div>
              <p className="text-sm font-medium text-zinc-100">{k.name}</p>
              <p className="font-mono text-xs text-zinc-500">{k.keyPrefix || '—'}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {shown.map((s) => (
              <span
                key={s}
                className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              >
                {s}
              </span>
            ))}
            {rest.length > 0 && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                +{rest.length} more
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={status} />
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-500">
          {k.lastUsedAt ? fmtDate(k.lastUsedAt) : 'Never'}
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-xs text-zinc-500">View</span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-950/60">
          <td colSpan={5} className="px-4 pb-4 pt-1">
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
              <DetailItem label="Key ID">
                <div className="flex items-center gap-2">
                  <code className="truncate font-mono text-xs text-zinc-300">{k.id}</code>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(k.id, 'Key ID');
                    }}
                    className="text-zinc-500 transition-colors hover:text-zinc-300"
                    aria-label="Copy key ID"
                  >
                    <FiCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </DetailItem>
              <DetailItem label="Created">
                <span className="text-xs text-zinc-300">{fmtDate(k.createdAt)}</span>
              </DetailItem>
              <DetailItem label="Expires">
                <span className="text-xs text-zinc-300">
                  {k.expiresAt ? fmtDate(k.expiresAt) : 'Never expires'}
                </span>
              </DetailItem>
              <DetailItem label="Key type">
                <span className="text-xs text-zinc-300">Developer key</span>
              </DetailItem>
              <DetailItem label="IP restrictions">
                {ipList.length ? (
                  <div className="flex items-center gap-2">
                    <FiGlobe className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs text-emerald-300">Protected by an IP allowlist</span>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-500">No IP restrictions</span>
                )}
              </DetailItem>
              <DetailItem label="Permissions">
                <div className="flex flex-wrap gap-1">
                  {(scopes.length ? scopes : []).map((s) => (
                    <span
                      key={s}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                    >
                      {s}
                    </span>
                  ))}
                  {!scopes.length && (
                    <span className="text-xs text-zinc-500">Full access</span>
                  )}
                </div>
              </DetailItem>
            </div>
            {ipList.length > 0 && (
              <div className="mt-3">
                <DetailItem label="Allowed IPs">
                  <div className="flex flex-wrap gap-1">
                    {ipList.map((i) => (
                      <code
                        key={i}
                        className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                      >
                        {i}
                      </code>
                    ))}
                  </div>
                </DetailItem>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
              {status !== 'Revoked' && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    <FiEdit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await doRotate(k);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    <FiRefreshCw className="h-3.5 w-3.5" /> Rotate
                  </button>
                </>
              )}
              {status === 'Revoked' ? (
                <span className="text-xs text-zinc-500">This key is revoked and cannot be reactivated.</span>
              ) : (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    doRevoke(k);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                >
                  <FiLock className="h-3.5 w-3.5" /> Revoke
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  doDelete(k);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
              >
                <FiTrash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}

function EndpointDetails({
  path,
  method,
  op,
  def,
  scopes,
  agentKey,
  isPublic,
  handleCopy
}) {
  const [tab, setTab] = useState('curl');
  const [paramValues, setParamValues] = useState({});

  const params = [
    ...(op.parameters || []),
    ...Object.entries(op.requestBody?.content?.['application/json']?.schema?.properties || {})
      .filter(([k, v]) => (v?.required || def?.required?.includes(k)) || op.requestBody?.required)
      .map(([k]) => ({ name: k, in: 'body', required: true, description: '' }))
  ];
  const examples = {
    get: [
      { name: 'page', value: 1 },
      { name: 'perPage', value: 10 }
    ].filter((p) => params.some((x) => x.name === p.name)),
    post: [
      { name: 'agent_id', value: 'agent_123' }
    ].filter((p) => params.some((x) => x.name === p.name))
  };

  const snippet = REF_EXAMPLES[tab]?.(path, paramValues) || REF_EXAMPLES.curl(path, paramValues);
  const scopesList = op.security?.[0]?.developerApiKey || def.security?.[0]?.developerApiKey || [];
  const authLabel = isPublic
    ? 'No authentication required'
    : agentKey
      ? 'Authenticate with an agent key (gpay_sk_...)'
      : 'Authenticate with a developer key (gpay_dev_...)';

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Description</p>
            <p className="text-sm text-zinc-200">
              {op.summary || def.summary || 'No description provided.'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Authentication</p>
            <div className="flex items-center gap-2">
              {agentKey ? (
                <FiCode className="h-4 w-4 text-indigo-400" />
              ) : isPublic ? (
                <FiGlobe className="h-4 w-4 text-zinc-400" />
              ) : (
                <FiLock className="h-4 w-4 text-emerald-400" />
              )}
              <p className="text-sm text-zinc-300">{authLabel}</p>
            </div>
          </div>
          {scopesList.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">
                Required scopes
              </p>
              <div className="flex flex-wrap gap-1">
                {scopesList.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Parameters</p>
            {params.length ? (
              <div className="space-y-1.5">
                {params.slice(0, 5).map((p) => (
                  <div
                    key={`${p.in}-${p.name}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <code className="truncate font-mono text-xs text-zinc-300">{p.name}</code>
                    <span className="text-xs text-zinc-500">{p.in}</span>
                  </div>
                ))}
                {params.length > 5 && (
                  <p className="text-xs text-zinc-500">+{params.length - 5} more</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No parameters.</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Responses</p>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(op.responses || {}) || ['200'])
                .slice(0, 4)
                .map((code) => (
                  <span
                    key={code}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                  >
                    {code}
                  </span>
                ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              to="/developer/docs"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <FiBookOpen className="h-3.5 w-3.5" /> View docs
            </Link>
            <Link
              to="/developer/playground"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <FiCode className="h-3.5 w-3.5" /> Try in playground
            </Link>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-zinc-800/70 p-1">
              {REF_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    tab === t.key
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleCopy(snippet, 'code snippet')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <FiCopy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {examples[method.toLowerCase()]?.map((ex) => (
              <button
                key={ex.name}
                onClick={() => setParamValues((s) => ({ ...s, [ex.name]: ex.value }))}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              >
                {ex.name}={ex.value}
              </button>
            ))}
            {Object.keys(paramValues).length > 0 && (
              <button
                onClick={() => setParamValues({})}
                className="rounded border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Clear params
              </button>
            )}
          </div>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
            <code>{snippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function CreateKeyModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState([]);
  const [ipAllowlist, setIpAllowlist] = useState([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr('Key name is required.');
      return;
    }
    if (!scopes.length) {
      setErr('Select at least one permission.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await developerApi.post('/developers/api-keys', {
        name: name.trim(),
        scopes,
        ipAllowlist,
        expiresAt
      });
      onCreated(res);
    } catch (e) {
      setErr(e.message || 'Failed to create key.');
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        Cancel
      </button>
      <button
        onClick={submit}
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create key'}
      </button>
    </>
  );

  return (
    <ModalShell
      onClose={onClose}
      title="Create an API key"
      subtitle="Scoped, revocable credentials for your integration."
      size="xl"
      footer={footer}
    >
      <div className="space-y-4">
        <div>
          <Label>Key name</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production, CI, Staging"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
            autoFocus
          />
        </div>

        <KeyPermissionsEditor
          scopes={scopes}
          onScopesChange={setScopes}
          ipAllowlist={ipAllowlist}
          onIpAllowlistChange={setIpAllowlist}
          expiresAt={expiresAt}
          onExpiresAtChange={setExpiresAt}
        />

        {err && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">{err}</p>
        )}
      </div>
    </ModalShell>
  );
}

function EditKeyModal({ keyToEdit, onClose, onSaved }) {
  const initialScopes = keyToEdit.scopes.includes('*')
    ? [...ALL_PERMISSION_SCOPES]
    : [...(keyToEdit.scopes || [])];
  const initialIp = Array.isArray(keyToEdit.ipAllowlist) ? keyToEdit.ipAllowlist : keyToEdit.ip_allowlist || [];
  const [name, setName] = useState(keyToEdit.name);
  const [scopes, setScopes] = useState(initialScopes);
  const [ipAllowlist, setIpAllowlist] = useState(initialIp);
  const [expiresAt, setExpiresAt] = useState(keyToEdit.expiresAt ? keyToEdit.expiresAt.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr('Key name is required.');
      return;
    }
    if (!scopes.length) {
      setErr('Select at least one permission.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await developerApi.patch(`/developers/api-keys/${keyToEdit.id}`, {
        name: name.trim(),
        scopes,
        ipAllowlist,
        expiresAt
      });
      onSaved();
    } catch (e) {
      setErr(e.message || 'Failed to update key.');
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        Cancel
      </button>
      <button
        onClick={submit}
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </>
  );

  return (
    <ModalShell
      onClose={onClose}
      title="Edit API key"
      subtitle={`Update ${keyToEdit.name}.`}
      size="xl"
      footer={footer}
    >
      <div className="space-y-4">
        <div>
          <Label>Key name</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            autoFocus
          />
        </div>

        <KeyPermissionsEditor
          scopes={scopes}
          onScopesChange={setScopes}
          ipAllowlist={ipAllowlist}
          onIpAllowlistChange={setIpAllowlist}
          expiresAt={expiresAt}
          onExpiresAtChange={setExpiresAt}
        />

        {err && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">{err}</p>
        )}
      </div>
    </ModalShell>
  );
}

function SuccessModal({ title, message, apiKey, onClose }) {
  useEffect(() => {
    if (!apiKey) {
      const t = setTimeout(onClose, 4000);
      return () => clearTimeout(t);
    }
  }, [onClose, apiKey]);

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalShell onClose={onClose} title={title} subtitle={message}>
      {apiKey && (
        <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
          <p className="text-xs font-semibold text-indigo-400">Secret API Key</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={apiKey}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy API key"
              className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-500"
            >
              {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            For security, this key will not be shown again.
          </p>
        </div>
      )}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
}

function AuditDrawer({ entry, onClose }) {
  const metadata = entry.metadata || {};

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Audit event details"
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-base font-semibold text-white">{humanAction(entry.action)}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {fmtDate(entry.createdAt)} · by {entry.actorId ? String(entry.actorId).slice(0, 12) : 'the system'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {Object.keys(metadata).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">Details</p>
              <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}
          {Object.keys(metadata).length === 0 && (
            <p className="text-sm text-zinc-500">
              No additional details were recorded for this event.
            </p>
          )}
        </div>
        <div className="border-t border-zinc-800 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalShell({ onClose, title, subtitle, children, footer, size = 'lg' }) {
  const maxW = size === 'xl' ? 'max-w-2xl' : 'max-w-lg';
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className={`flex max-h-[90vh] w-full ${maxW} flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }) {
  return <label className="mb-1.5 block text-sm font-medium text-zinc-300">{children}</label>;
}
