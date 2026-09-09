import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPlay, FiCopy, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { ENDPOINTS, BASE_URL, KEY_TYPE } from '../../utils/endpointCatalog';
import { LANGUAGES, generateCode } from '../../utils/codeSnippets';
import CodeBlock from '../../components/dev/CodeBlock';
import Card from '../../components/dev/Card';
import CopyButton from '../../components/dev/CopyButton';

const DEFAULT_PARAMS = {
  'create-agent': { name: '', description: '' },
  'pay': { to: '', amount: '', token: '' },
  'balance': {},
  'history': { limit: '' },
  'stats': {},
  'rotate-key': {},
  'publish-service': { name: '', description: '', pricePerCall: '', sla: 'starter' },
  'search-marketplace': { query: '', serviceType: '', limit: '20', offset: '0' },
  'install-agent': { listingId: '', projectId: '', consent: '{}' },
  'invoke-agent': { agentId: '', method: '', payload: '{}', sessionId: '' },
  'create-session': { agentId: '', mode: 'chat', ttl: '3600' },
  'report-usage': { subscriptionId: '', units: '', unitType: 'calls' },
  'generate-invoice': { subscriptionId: '', recipientId: '', items: '[]' },
  'pay-invoice': { id: '', paymentMethod: 'wallet' },
  'create-project': { name: '', description: '', orgId: '' },
  'view-trust-score': { id: '' }
};

const DEVELOPER_KEY_TYPE = KEY_TYPE.DEVELOPER;
const AGENT_KEY_TYPE = KEY_TYPE.AGENT;

const SECTION_TITLES = {
  developer: {
    title: 'Developer APIs',
    subtitle: 'Manage your GlobalPay resources.',
    requires: 'Requires a Developer API Key.',
    keyLabel: 'Developer API Key',
    keyPlaceholder: 'gpay_dev_…',
    keyHint: 'Used to create and manage organizations, agents, services, marketplace listings, billing and developer resources.',
    empty: 'Enter a Developer API Key to test management APIs.'
  },
  agent: {
    title: 'Agent Runtime APIs',
    subtitle: 'Execute an AI Agent.',
    requires: 'Requires an Agent API Key.',
    keyLabel: 'Agent API Key',
    keyPlaceholder: 'gpay_sk_…',
    keyHint: 'Used by AI agents themselves to execute tasks, make payments, check balances and access runtime services.',
    empty: 'Enter an Agent API Key to test runtime APIs.'
  }
};

const DEVELOPER_CATEGORIES = ['agents', 'services', 'marketplace', 'projects', 'x402'];
const AGENT_CATEGORIES = ['agents', 'payments', 'commerce'];

const CATEGORY_LABELS = {
  agents: 'Agents',
  payments: 'Payments',
  services: 'Services',
  marketplace: 'Marketplace',
  commerce: 'Commerce',
  projects: 'Projects',
  network: 'Business Network',
  x402: 'x402 Premium'
};

const isDeveloperEndpoint = (e) => e.keyType === DEVELOPER_KEY_TYPE;
const isAgentEndpoint = (e) => e.keyType === AGENT_KEY_TYPE;
const isPublicEndpoint = (e) => e.keyType !== DEVELOPER_KEY_TYPE && e.keyType !== AGENT_KEY_TYPE;

const groupByCategory = (endpoints) => {
  const groups = {};
  endpoints.forEach((e) => {
    const cat = e.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  });
  return groups;
};

const orderedGroups = (endpoints, order) => {
  const groups = groupByCategory(endpoints);
  const ordered = [];
  const used = new Set();
  order.forEach((cat) => {
    if (groups[cat]) {
      ordered.push({ category: cat, items: groups[cat] });
      used.add(cat);
    }
  });
  Object.keys(groups).forEach((cat) => {
    if (!used.has(cat)) ordered.push({ category: cat, items: groups[cat] });
  });
  return ordered;
};

// Mask a secret so the visible console never shows the full key. The real key
// is still passed to generateCode so the copied snippet runs as-is.
const maskSecret = (key) => {
  if (!key) return '';
  const s = String(key);
  if (s.length <= 12) return '***************';
  const head = s.startsWith('gpay_dev_') || s.startsWith('gpay_sk_') ? s.slice(0, 9) : s.slice(0, 4);
  const tail = s.slice(-4);
  return `${head}${'*'.repeat(Math.max(4, s.length - head.length - tail.length))}${tail}`;
};

const STATUS_TEXT = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

const formatLatency = (ms) => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} seconds`;
  return `${ms} ms`;
};

const SummaryItem = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-0.5">{label}</div>
    <div className="text-sm text-zinc-200 break-words">{children}</div>
  </div>
);

const DevPlayground = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('endpoint') || 'create-agent';

  const [endpointId, setEndpointId] = useState(ENDPOINTS.some((e) => e.id === requested) ? requested : 'create-agent');
  const endpoint = ENDPOINTS.find((e) => e.id === endpointId);

  const [developerKey, setDeveloperKey] = useState('');
  const [agentKey, setAgentKey] = useState('');

  const [params, setParams] = useState(DEFAULT_PARAMS[endpointId] || {});
  const [executing, setExecuting] = useState(false);
  const [response, setResponse] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const [lang, setLang] = useState('javascript');

  const selectEndpoint = (id) => {
    setEndpointId(id);
    setParams(DEFAULT_PARAMS[id] || {});
    setResponse(null);
    setLastRequest(null);
  };

  const activeKeyType = endpoint.keyType;
  const activeKey = activeKeyType === DEVELOPER_KEY_TYPE ? developerKey : activeKeyType === AGENT_KEY_TYPE ? agentKey : '';
  const activeSection = activeKeyType === AGENT_KEY_TYPE ? 'agent' : 'developer';

  const buildUrl = () => {
    const base = BASE_URL.replace(/\/$/, '');
    let path = endpoint.path;
    const bodyParams = {};
    const queryParams = {};
    const allParams = {};

    Object.entries(params).forEach(([k, v]) => {
      if (v === '' || v === undefined || v === null) return;

      // Cast to proper types based on endpoint param definitions.
      let castValue = v;
      const paramDef = (endpoint.params || []).find(p => p.name === k);
      if (paramDef) {
        if (paramDef.type === 'number') {
          const n = Number(v);
          if (Number.isFinite(n)) castValue = n;
        } else if (paramDef.type === 'object' || paramDef.type === 'array') {
          try { castValue = JSON.parse(v); } catch { /* keep as string */ }
        }
      }

      allParams[k] = castValue;

      if (path.includes(`{${k}}`)) {
        path = path.replace(`{${k}}`, encodeURIComponent(String(castValue)));
      } else if (endpoint.method === 'GET') {
        queryParams[k] = castValue;
      } else {
        bodyParams[k] = castValue;
      }
    });

    const query = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`)
      .join('&');
    return { url: `${base}${path}${query ? `?${query}` : ''}`, bodyParams, allParams };
  };

  const trimmedKey = activeKey.trim();

  const execute = async () => {
    if (activeKeyType !== KEY_TYPE.PUBLIC && !trimmedKey) {
      setResponse(null);
      setLastRequest(null);
      return toast.error(SECTION_TITLES[activeSection].empty);
    }
    setExecuting(true);
    setResponse(null);
    setLastRequest(null);
    try {
      const started = performance.now();
      const headers = { 'Content-Type': 'application/json' };
      if (trimmedKey) {
        headers.Authorization = `Bearer ${trimmedKey}`;
      }
      const { url, bodyParams, allParams } = buildUrl();
      const body = endpoint.method === 'GET' ? undefined : JSON.stringify(bodyParams);
      const res = await fetch(url, { method: endpoint.method, headers, body });
      const latency = Math.round(performance.now() - started);
      const data = await res.json().catch(() => ({}));

      // The exact payload that was sent — the generated code and request summary
      // must reflect this, not the (now-cleared) form state.
      const sentParams = endpoint.method === 'GET' ? null : bodyParams;

      setLastRequest({
        method: endpoint.method,
        url,
        headers,
        body: sentParams,
        allParams
      });
      setResponse({
        status: res.status,
        latency,
        contentType: res.headers.get('content-type') || 'application/json',
        headers: Object.fromEntries(res.headers.entries()),
        body: data
      });
      if (res.ok && endpoint.method !== 'GET') {
        const blank = {};
        (endpoint.params || []).forEach((p) => { blank[p.name] = ''; });
        setParams(blank);
      }
    } catch (err) {
      setResponse({ status: 0, latency: 0, contentType: '', headers: {}, body: { error: err.message || 'Network error' } });
    } finally {
      setExecuting(false);
    }
  };

  // Generated code reflects the executed request payload (lastRequest.body),
  // falling back to the live form params before any request has run.
  const codeParams = lastRequest ? lastRequest.allParams : params;
  const resolvedKey = trimmedKey || (
    activeKeyType === KEY_TYPE.DEVELOPER ? 'gpay_dev_…' :
    activeKeyType === KEY_TYPE.AGENT ? 'gpay_sk_…' : ''
  );
  const code = generateCode(endpoint, { base: BASE_URL, apiKey: trimmedKey || undefined, params: codeParams });

  const requestBodyText = lastRequest && lastRequest.body
    ? JSON.stringify(lastRequest.body, null, 2)
    : '';

  const requestText = lastRequest
    ? [
        `${lastRequest.method} ${lastRequest.url}`,
        ...Object.entries(lastRequest.headers).map(([k, v]) => `${k}: ${v}`),
        '',
        lastRequest.body ? requestBodyText : 'No request body'
      ].join('\n')
    : '';

  const renderKeyField = (sectionId, value, onChange, disabled) => {
    const meta = SECTION_TITLES[sectionId];
    return (
      <div className={`rounded-xl border p-3 mb-4 ${sectionId === 'developer' ? 'border-violet-800/50 bg-violet-950/20' : 'border-cyan-800/50 bg-cyan-950/20'}`}>
        <label className={`text-xs font-medium mb-1.5 block ${sectionId === 'developer' ? 'text-violet-300' : 'text-cyan-300'}`}>
          {meta.keyLabel}
        </label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.keyPlaceholder}
          disabled={disabled}
          className="w-full bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">{meta.keyHint}</p>
      </div>
    );
  };

  const renderEndpointList = (items, currentId, onSelect, sectionId) => {
    const groups = orderedGroups(
      items,
      sectionId === 'developer' ? DEVELOPER_CATEGORIES : AGENT_CATEGORIES
    );
    return groups.map(({ category, items: groupItems }) => (
      <div key={category} className="mb-3 last:mb-0">
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${sectionId === 'developer' ? 'text-violet-500/80' : 'text-cyan-500/80'}`}>
          {CATEGORY_LABELS[category] || category}
        </div>
        <div className="space-y-1">
          {groupItems.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={e.id === currentId}
              onClick={() => onSelect(e.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-sm ${
                e.id === currentId ? 'bg-blue-600/20 border-blue-700 text-blue-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${e.method === 'GET' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-blue-900/40 text-blue-400'}`}>
                {e.method}
              </span>
              <code className="font-mono text-xs">{e.path}</code>
            </button>
          ))}
        </div>
      </div>
    ));
  };

  const developerEndpoints = ENDPOINTS.filter(isDeveloperEndpoint);
  const agentEndpoints = ENDPOINTS.filter(isAgentEndpoint);
  const publicEndpoints = ENDPOINTS.filter(isPublicEndpoint);

  const authLabel = activeKeyType === KEY_TYPE.DEVELOPER
    ? 'Developer API Key'
    : activeKeyType === KEY_TYPE.AGENT
      ? 'Agent API Key'
      : 'Public (no auth)';

  const statusText = response && STATUS_TEXT[response.status]
    ? STATUS_TEXT[response.status]
    : response && response.status === 0
      ? 'Network Error'
      : response
        ? 'Unknown'
        : '';

  const issuedAgentKey = response && response.body && typeof response.body.apiKey === 'string'
    ? response.body.apiKey.startsWith('gpay_sk_')
    : false;

  const copyRequest = async () => {
    if (!lastRequest) return;
    await navigator.clipboard.writeText(requestText);
    toast.success('Copied to clipboard');
  };

  const copyResponse = async () => {
    if (!response) return;
    await navigator.clipboard.writeText(JSON.stringify(response.body, null, 2));
    toast.success('Copied to clipboard');
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">API Playground</h1>
        <p className="text-sm text-zinc-500 mt-1">Execute live requests and generate code in six languages.</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Endpoint explorer: two clearly separated surfaces */}
        <div className="space-y-6">
          <Card
            title="Developer APIs"
            subtitle={`Manage your GlobalPay resources. ${SECTION_TITLES.developer.requires}`}
            className="border-violet-900/30"
          >
            {renderKeyField('developer', developerKey, setDeveloperKey, false)}
            {renderEndpointList(developerEndpoints, endpointId, selectEndpoint, 'developer')}
            {!developerKey && (
              <p className="text-xs text-zinc-500 mt-2">
                <span className="text-violet-400">→</span> {SECTION_TITLES.developer.empty}
              </p>
            )}
          </Card>

          <Card
            title="Agent Runtime APIs"
            subtitle={`Execute an AI Agent. ${SECTION_TITLES.agent.requires}`}
            className="border-cyan-900/30"
          >
            {renderKeyField('agent', agentKey, setAgentKey, false)}
            {renderEndpointList(agentEndpoints, endpointId, selectEndpoint, 'agent')}
            {!agentKey && (
              <p className="text-xs text-zinc-500 mt-2">
                <span className="text-cyan-400">→</span> {SECTION_TITLES.agent.empty}
              </p>
            )}
          </Card>

          {publicEndpoints.length > 0 && (
            <Card title="Public Endpoints" subtitle="No authentication required.">
              {renderEndpointList(publicEndpoints, endpointId, selectEndpoint, 'developer')}
            </Card>
          )}
        </div>

        {/* Request builder + response */}
        <div className="space-y-6">
          <Card
            title="Request"
            subtitle={
              <span>
                {endpoint.method} {endpoint.path}
                {' · '}
                {activeKeyType === KEY_TYPE.DEVELOPER ? (
                  <span className="text-violet-300">Developer API Key</span>
                ) : activeKeyType === KEY_TYPE.AGENT ? (
                  <span className="text-cyan-300">Agent API Key</span>
                ) : (
                  <span className="text-zinc-500">public — no auth needed</span>
                )}
              </span>
            }
          >
            <div className="mb-4">
              <p className="text-xs text-zinc-500">{endpoint.summary}</p>
            </div>

            {(endpoint.params || []).length > 0 && (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-zinc-500">Parameters</p>
                {endpoint.params.map((p) => (
                  <div key={p.name}>
                    <label className="text-xs text-zinc-500 mb-1 block font-mono">
                      {p.name} {p.required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      value={params[p.name] ?? ''}
                      onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                      placeholder={p.description}
                      className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={execute}
              disabled={executing || (activeKeyType !== KEY_TYPE.PUBLIC && !trimmedKey)}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
            >
              <FiPlay size={14} /> {executing ? 'Executing…' : `Execute ${endpoint.method.toUpperCase()} ${endpoint.path}`}
            </button>
          </Card>

          <Card
            title="Test Console"
            subtitle={response ? `${response.status} ${statusText} · ${formatLatency(response.latency)}` : 'Run a request to see the full details'}
            action={response && (
              <CopyButton text={JSON.stringify(response.body, null, 2)} label="Copy response" onCopy={copyResponse} />
            )}
          >
            {response ? (
              <div className="space-y-4">
                {issuedAgentKey && (
                  <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 flex items-start gap-3">
                    <FiAlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-200 space-y-1">
                      <p className="font-semibold">Save this Agent API Key now.</p>
                      <p className="text-amber-200/80">This secret is shown only once and cannot be viewed again. Store it securely before leaving this page.</p>
                    </div>
                  </div>
                )}

                {lastRequest && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Request</span>
                      <CopyButton text={requestText} label="Copy request" onCopy={copyRequest} className="!px-2 !py-0.5" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SummaryItem label="Method">{lastRequest.method}</SummaryItem>
                      <SummaryItem label="Endpoint">{lastRequest.url}</SummaryItem>
                      <SummaryItem label="Authentication">
                        <span className="font-mono text-xs">
                          Bearer {maskSecret(trimmedKey)}
                        </span>
                      </SummaryItem>
                      <SummaryItem label="Request Body">
                        {lastRequest.body ? (
                          <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words">
                            {requestBodyText}
                          </pre>
                        ) : (
                          <span className="text-zinc-500 italic text-xs">No request body</span>
                        )}
                      </SummaryItem>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <SummaryItem label="Status">
                      {response.status === 0 ? (
                        <span className="text-red-400">⚠ Network Error</span>
                      ) : (
                        <span className={response.status >= 400 ? 'text-red-400' : 'text-emerald-400'}>
                          <FiCheckCircle className="inline h-3.5 w-3.5 mr-1" />
                          {response.status} {statusText}
                        </span>
                      )}
                    </SummaryItem>
                    <SummaryItem label="Response Time">{formatLatency(response.latency)}</SummaryItem>
                    <SummaryItem label="Content Type">
                      <span className="font-mono text-xs">{response.contentType || '—'}</span>
                    </SummaryItem>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Response Body</span>
                    <CopyButton text={JSON.stringify(response.body, null, 2)} label="Copy" onCopy={copyResponse} className="!px-2 !py-0.5" />
                  </div>
                  <pre className="overflow-x-auto text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-3 max-h-64 overflow-y-auto">
                    {JSON.stringify(response.body, null, 2)}
                  </pre>
                </div>

                {Object.keys(response.headers || {}).length > 0 && (
                  <details className="text-xs text-zinc-400">
                    <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-300">Response headers</summary>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                      {JSON.stringify(response.headers, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-zinc-600 text-sm py-6 text-center">The live response will render here.</p>
            )}
          </Card>

          <Card
            title="Generated Code"
            subtitle="Ready to run in your stack"
            action={
              <div className="flex items-center gap-1">
                <CopyButton text={code[lang]} label="Copy code" className="mr-1" onCopy={() => toast.success('Copied to clipboard')} />
                {LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={lang === l.id}
                    onClick={() => setLang(l.id)}
                    className={`px-2 py-1 rounded-md text-xs font-medium ${lang === l.id ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-500 hover:text-white'}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            }
          >
            <CodeBlock title={`${endpoint.method} ${endpoint.path} · ${lang}`} language={lang} code={code[lang]} />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DevPlayground;
