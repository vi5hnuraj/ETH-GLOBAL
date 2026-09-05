/**
 * Endpoint catalog — metadata for the /api/agents/* and developer APIs.
 * Consumed by API Management, Documentation and the Playground so the
 * documented surface is never duplicated.
 *
 * No fake data lives here. Example requests are generated dynamically from the
 * parameter definitions (type-appropriate placeholders), and example responses
 * are rendered from the OpenAPI schema served by the backend.
 */

import { API_BASE_URL } from './apiBase.js';

export const BASE_URL = API_BASE_URL;

/**
 * Key types.
 *  - 'agent'     -> AI Agent Runtime API (gpay_sk_…) — used by /agents/*
 *  - 'developer' -> Developer API (gpay_dev_…) — used by /developers/*
 *  - null        -> public, no auth
 */
export const KEY_TYPE = {
  AGENT: 'agent',
  DEVELOPER: 'developer',
  PUBLIC: null
};

/** Collapsible categories for the API reference nav. */
export const CATEGORIES = [
  { id: 'authentication', title: 'Authentication', icon: 'key' },
  { id: 'agents', title: 'AI Agents', icon: 'cpu' },
  { id: 'payments', title: 'Payments', icon: 'send' },
  { id: 'services', title: 'Services', icon: 'server' },
  { id: 'marketplace', title: 'Marketplace', icon: 'shopping-cart' },
  { id: 'commerce', title: 'Commerce', icon: 'shopping-bag' },
  { id: 'projects', title: 'Projects', icon: 'folder' },
  { id: 'network', title: 'Business Network', icon: 'globe' },
  { id: 'developer-platform', title: 'Developer Platform', icon: 'shield' },
  { id: 'webhooks', title: 'Webhooks', icon: 'zap' },
  { id: 'organizations', title: 'Organizations', icon: 'users' }
];

const placeholderFor = (param) => {
  const n = param.name.toLowerCase();
  if (param.type === 'number') return 0;
  if (param.type === 'boolean') return true;
  if (/address|^to$|recipient|destination/.test(n)) return '<wallet_address>';
  if (/^name$/.test(n)) return '<name>';
  if (/token|symbol/.test(n)) return 'USDC';
  if (/wei/.test(n)) return '1000000000000000';
  if (/developerId|owner|developer/.test(n)) return '<developer_id>';
  if (/note|description|memo|matter/.test(n)) return '<optional note>';
  return `<${param.name}>`;
};

/** Builds a real, runnable example request for an endpoint from its params. */
export const buildExampleRequest = (endpoint, { base = BASE_URL, values } = {}) => {
  const method = endpoint.method;
  const needsAuth = endpoint.auth !== 'None — public endpoint';
  const lines = [`${method} ${base}${endpoint.path}`];

  const bodyParams = endpoint.params || [];
  if (method !== 'GET') {
    lines.push('Content-Type: application/json');
    if (needsAuth) lines.push('Authorization: Bearer <api_key>');
    const payload = {};
    for (const p of bodyParams) {
      const v = values && values[p.name] !== undefined ? values[p.name] : placeholderFor(p);
      if (v === undefined || v === null || v === '') continue;
      payload[p.name] = v;
    }
    const body = JSON.stringify(payload, null, 2);
    lines.push('', body);
    return lines.join('\n');
  }

  if (needsAuth) lines.push('Authorization: Bearer <api_key>');
  const query = bodyParams
    .map((p) => {
      const v = values && values[p.name] !== undefined ? values[p.name] : placeholderFor(p);
      if (v === undefined || v === null || v === '') return null;
      return `${encodeURIComponent(p.name)}=${encodeURIComponent(String(v))}`;
    })
    .filter(Boolean);
  if (query.length) lines[0] += `?${query.join('&')}`;
  return lines.join('\n');
};

/** Deep-resolves an OpenAPI schema ($ref support). */
const deref = (schema, spec, seen = new Set()) => {
  if (!schema) return schema;
  if (schema.$ref) {
    const key = schema.$ref.replace(/^#\/components\/schemas\//, '');
    if (seen.has(key)) return { type: 'object', description: `(recursive ${key})` };
    const next = spec?.components?.schemas?.[key];
    if (next) return deref(next, spec, new Set(seen).add(key));
    return { type: 'object', description: `(schema ${key})` };
  }
  if (schema.allOf && schema.allOf.length) {
    const merged = { ...schema, ...deref(schema.allOf[0], spec, seen) };
    delete merged.allOf;
    return merged;
  }
  return schema;
};

/** Renders an OpenAPI schema as an indented schema tree (not fake JSON). */
export const renderSchemaTree = (schema, spec, depth = 0) => {
  if (!schema) return '—';
  schema = deref(schema, spec);
  const indent = '  '.repeat(depth);
  const { type, description } = schema;

  if (schema.enum) {
    return `${indent}${type || 'string'} · ${schema.enum.map((v) => `"${v}"`).join(' | ')}${description ? ` — ${description}` : ''}`;
  }

  if (type === 'object' || schema.properties) {
    const props = Object.entries(schema.properties || {});
    if (!props.length) return `${indent}object${description ? ` — ${description}` : ''}`;
    const required = new Set(schema.required || []);
    const lines = [`${indent}object${description ? ` — ${description}` : ''} {`];
    for (const [key, prop] of props) {
      const req = required.has(key) ? ' *' : '';
      const child = renderSchemaTree(prop, spec, depth + 1);
      lines.push(`${indent}  ${key}${req}: ${child.trimStart()}`);
    }
    lines.push(`${indent}}`);
    return lines.join('\n');
  }

  if (type === 'array') {
    const item = renderSchemaTree(schema.items, spec, depth);
    return `${indent}array of: ${item.trimStart()}`;
  }

  const parts = [indent + (type || 'any')];
  if (schema.format) parts.push(`(${schema.format})`);
  if (description) parts.push(`— ${description}`);
  return parts.join(' ');
};

/** Example response for an endpoint, rendered from the OpenAPI 200 response schema. */
export const renderExampleResponse = (endpoint, spec) => {
  const method = endpoint.method.toLowerCase();
  const path = endpoint.openapiPath || endpoint.path;
  const responses = spec?.paths?.[path]?.[method]?.responses;
  if (!responses) return 'Response schema not available.';
  const okResponse = responses['200'] || responses['201'] || responses['2XX'] || Object.entries(responses).find(([k]) => /^2/.test(k))?.[1];
  if (!okResponse) return 'No success response defined.';
  const schema = okResponse.content?.['application/json']?.schema || okResponse.schema;
  if (!schema) return 'Response schema not available.';
  return renderSchemaTree(schema, spec);
};

export const ENDPOINTS = [
  {
    id: 'create-agent',
    method: 'POST',
    path: '/developers/agents',
    title: 'Create Agent',
    summary: 'Create an AI agent with a headless Ethereum wallet and a one-time gpay_sk_… API key.',
    auth: 'Authorization: Bearer <gpay_dev_…>',
    keyType: KEY_TYPE.DEVELOPER,
    category: 'agents',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Agent display name (max 120 chars)' },
      { name: 'description', type: 'string', required: false, description: 'What the agent is for' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[0], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[0], spec)
  },
  {
    id: 'pay',
    method: 'POST',
    path: '/agents/pay',
    title: 'Pay',
    summary: 'Send a payment from the agent wallet. Amount in token units (or raw wei).',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'payments',
    params: [
      { name: 'to', type: 'string', required: true, description: 'Destination EVM address (0x…)' },
      { name: 'amount', type: 'number', required: true, description: 'Amount in USDC (or use wei)' },
      { name: 'token', type: 'string', required: false, description: 'Token symbol, defaults to USDC' },
      { name: 'wei', type: 'string', required: false, description: 'Raw wei amount (alternative to amount)' },
      { name: 'note', type: 'string', required: false, description: 'Optional memo' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[1], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[1], spec)
  },
  {
    id: 'balance',
    method: 'GET',
    path: '/agents/balance',
    title: 'Balance',
    summary: 'Read the live Ethereum balance of the agent wallet.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'payments',
    params: [],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[2], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[2], spec)
  },
  {
    id: 'history',
    method: 'GET',
    path: '/agents/history',
    title: 'History',
    summary: 'List every transaction the agent has made (newest first).',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'payments',
    params: [{ name: 'limit', type: 'number', required: false, description: 'Max rows (default 50, max 200)' }],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[3], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[3], spec)
  },
  {
    id: 'stats',
    method: 'GET',
    path: '/agents/stats',
    title: 'Stats',
    summary: 'Payment statistics: totals, unique recipients and last-7-days volume.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'payments',
    params: [],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[4], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[4], spec)
  },
  {
    id: 'rotate-key',
    method: 'POST',
    path: '/agents/rotate-key',
    title: 'Rotate Key',
    summary: 'Regenerate the agent API key. The previous key is immediately invalidated.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'agents',
    params: [],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[5], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[5], spec)
  },
  {
    id: 'publish-service',
    method: 'POST',
    path: '/developers/services',
    title: 'Publish Service',
    summary: 'Publish an AI agent as a monetizable network service with pricing and SLA terms.',
    auth: 'Authorization: Bearer <gpay_dev_…>',
    keyType: KEY_TYPE.DEVELOPER,
    category: 'services',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Service display name' },
      { name: 'description', type: 'string', required: false, description: 'Service description' },
      { name: 'pricePerCall', type: 'number', required: false, description: 'Price per invocation in USD' },
      { name: 'sla', type: 'string', required: false, description: 'SLA level: starter, professional, enterprise' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[6], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[6], spec)
  },
  {
    id: 'search-marketplace',
    method: 'GET',
    path: '/marketplace/browse',
    title: 'Search Marketplace',
    summary: 'Browse or search the GlobalPay agent marketplace by query, category, or service type.',
    auth: 'None — public endpoint',
    keyType: KEY_TYPE.PUBLIC,
    category: 'marketplace',
    params: [
      { name: 'query', type: 'string', required: false, description: 'Search term' },
      { name: 'serviceType', type: 'string', required: false, description: 'Filter by service type (e.g. payment, oracle, compute)' },
      { name: 'limit', type: 'number', required: false, description: 'Max results (default 20)' },
      { name: 'offset', type: 'number', required: false, description: 'Paginate offset' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[7], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[7], spec)
  },
  {
    id: 'install-agent',
    method: 'POST',
    path: '/marketplace/install',
    title: 'Install Agent',
    summary: 'Install a service listing from the marketplace into your project or wallet.',
    auth: 'Authorization: Bearer <gpay_dev_…>',
    keyType: KEY_TYPE.DEVELOPER,
    category: 'marketplace',
    params: [
      { name: 'listingId', type: 'string', required: true, description: 'Marketplace listing ID to install' },
      { name: 'projectId', type: 'string', required: false, description: 'Project ID for installation target' },
      { name: 'consent', type: 'object', required: true, description: 'Consent grant scopes as object' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[8], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[8], spec)
  },
  {
    id: 'invoke-agent',
    method: 'POST',
    path: '/agents/invoke',
    title: 'Invoke Agent',
    summary: 'Invoke a marketplace-installed agent with a payload. Routes via smart-procurement.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'agents',
    params: [
      { name: 'agentId', type: 'string', required: true, description: 'Agent ID or listing ID' },
      { name: 'method', type: 'string', required: false, description: 'Method name to invoke (optional)' },
      { name: 'payload', type: 'object', required: true, description: 'Invocation payload as JSON object' },
      { name: 'sessionId', type: 'string', required: false, description: 'Session ID for stateful calls' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[9], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[9], spec)
  },
  {
    id: 'create-session',
    method: 'POST',
    path: '/agents/sessions',
    title: 'Create Session',
    summary: 'Create a stateful agent session for multi-turn conversation or workflow execution.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'agents',
    params: [
      { name: 'agentId', type: 'string', required: true, description: 'Agent ID to start session with' },
      { name: 'mode', type: 'string', required: false, description: 'Session mode: chat, workflow, batch (default chat)' },
      { name: 'ttl', type: 'number', required: false, description: 'Session TTL in seconds (default 3600)' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[10], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[10], spec)
  },
  {
    id: 'report-usage',
    method: 'POST',
    path: '/commerce/usage',
    title: 'Report Usage',
    summary: 'Report metered usage for a subscription or usage-based service.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'commerce',
    params: [
      { name: 'subscriptionId', type: 'string', required: true, description: 'Subscription or service ID' },
      { name: 'units', type: 'number', required: true, description: 'Number of usage units' },
      { name: 'unitType', type: 'string', required: false, description: 'Unit type: calls, tokens, compute-seconds (default calls)' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[11], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[11], spec)
  },
  {
    id: 'generate-invoice',
    method: 'POST',
    path: '/commerce/invoices',
    title: 'Generate Invoice',
    summary: 'Generate an invoice for completed usage or a subscription period.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'commerce',
    params: [
      { name: 'subscriptionId', type: 'string', required: false, description: 'Subscription ID (if applicable)' },
      { name: 'recipientId', type: 'string', required: true, description: 'Recipient wallet/org ID' },
      { name: 'items', type: 'array', required: true, description: 'Line items as array of {description, amount, currency}' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[12], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[12], spec)
  },
  {
    id: 'pay-invoice',
    method: 'POST',
    path: '/commerce/invoices/{id}/pay',
    title: 'Pay Invoice',
    summary: 'Pay a pending invoice using the agent wallet or linked payment method.',
    auth: 'Authorization: Bearer <gpay_sk_…>',
    keyType: KEY_TYPE.AGENT,
    category: 'commerce',
    params: [
      { name: 'id', type: 'string', required: true, description: 'Invoice ID' },
      { name: 'paymentMethod', type: 'string', required: false, description: 'wallet or payment_method (default wallet)' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[13], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[13], spec)
  },
  {
    id: 'create-project',
    method: 'POST',
    path: '/developers/projects',
    title: 'Create Project',
    summary: 'Create a new developer project for organizing agents, services, and deployments.',
    auth: 'Authorization: Bearer <gpay_dev_…>',
    keyType: KEY_TYPE.DEVELOPER,
    category: 'projects',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Project name' },
      { name: 'description', type: 'string', required: false, description: 'Project description' },
      { name: 'orgId', type: 'string', required: true, description: 'Organization ID to attach project to' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[14], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[14], spec)
  },
  {
    id: 'view-trust-score',
    method: 'GET',
    path: '/network/directory/{id}/trust-score',
    title: 'View Trust Score',
    summary: 'Retrieve the network trust score for a partner or service listing.',
    auth: 'None — public endpoint',
    keyType: KEY_TYPE.PUBLIC,
    category: 'network',
    params: [
      { name: 'id', type: 'string', required: true, description: 'Directory entity ID (service or org)' }
    ],
    exampleRequest: (base) => buildExampleRequest(ENDPOINTS[15], { base }),
    exampleResponse: (spec) => renderExampleResponse(ENDPOINTS[15], spec)
  }
];

export const getEndpoint = (id) => ENDPOINTS.find((e) => e.id === id);

export const endpointsByCategory = (categoryId) => ENDPOINTS.filter((e) => e.category === categoryId);
