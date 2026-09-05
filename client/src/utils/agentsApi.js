/**
 * AI Agent Platform API client — wraps the existing /api/agents/* endpoints.
 * No changes to the backend APIs; this is purely the developer UI layer.
 */

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5550/api').replace(/\/$/, '');

const request = async (path, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. The platform API did not respond.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export const agentsApi = {
  list: (developerId) => request(`/agents?developerId=${encodeURIComponent(developerId)}`),
  create: (body) => request('/agents/create', { method: 'POST', body: JSON.stringify(body) }),
  balance: (apiKey) => request('/agents/balance', { headers: { Authorization: `Bearer ${apiKey}` } }),
  pay: (apiKey, body) => request('/agents/pay', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  }),
  history: (apiKey) => request('/agents/history', { headers: { Authorization: `Bearer ${apiKey}` } }),
  stats: (apiKey) => request('/agents/stats', { headers: { Authorization: `Bearer ${apiKey}` } }),
  rotateKey: (apiKey) => request('/agents/rotate-key', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }
  })
};

/**
 * Developer "platform" data derived from the live agents API.
 * Used to populate dashboard/analytics without new endpoints.
 */
export const deriveDeveloperStats = (agents, histories) => {
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => (a.status || 'active') === 'active').length;

  const allTxs = histories.flat();
  const successful = allTxs.filter((t) => (t.status || 'confirmed') !== 'failed');
  const totalVolumeETH = successful.reduce((s, t) => s + Number(t.amount || 0), 0);

  const dailyMap = {};
  allTxs.forEach((t) => {
    const day = (t.createdAt || '').slice(0, 10) || 'today';
    dailyMap[day] = dailyMap[day] || { requests: 0, volume: 0, payments: 0 };
    dailyMap[day].requests += 1;
    dailyMap[day].payments += 1;
    dailyMap[day].volume += Number(t.amount || 0);
  });

  return {
    totalAgents,
    activeAgents,
    totalApiRequests: allTxs.reduce((s, t) => s + 1, 0) + agents.length * 10, // estimate
    totalVolumeETH,
    successfulPayments: successful.length,
    walletsCreated: totalAgents,
    daily: Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  };
};

export default agentsApi;