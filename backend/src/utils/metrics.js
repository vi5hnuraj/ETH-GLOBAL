import client from 'prom-client';

// Create a Registry to register metrics
export const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'globalpay-backend'
});

// Enable the collection of default V8 and system metrics
client.collectDefaultMetrics({ register });

// Define custom metrics
export const httpRequestsTotal = new client.Counter({
  name: 'globalpay_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = new client.Histogram({
  name: 'globalpay_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10] // bounds in seconds
});

export const remittanceTransactionsTotal = new client.Counter({
  name: 'globalpay_remittance_transactions_total',
  help: 'Total number of remittance transactions initiated by agents',
  labelNames: ['status'] // pending, confirmed, failed
});

export const remittanceVolumeWei = new client.Counter({
  name: 'globalpay_remittance_volume_wei_total',
  help: 'Total volume of remittances in Web3 token wei',
});

export const quotaExceededTotal = new client.Counter({
  name: 'globalpay_quota_exceeded_total',
  help: 'Total requests blocked due to organization quota limits',
  labelNames: ['developer_id']
});

// MPC-specific counters intentionally use bounded labels only. Alert rules can
// page on failures, disagreement, replay/nonce conflicts, and policy rejects.
export const mpcSigningRequestsTotal = new client.Counter({
  name: 'globalpay_mpc_signing_requests_total',
  help: 'MPC signing job outcomes',
  labelNames: ['outcome', 'reason']
});
export const mpcRpcFailuresTotal = new client.Counter({
  name: 'globalpay_mpc_rpc_failures_total',
  help: 'MPC RPC failures by node class',
  labelNames: ['node', 'reason']
});
export const mpcNonceConflictsTotal = new client.Counter({
  name: 'globalpay_mpc_nonce_conflicts_total',
  help: 'Rejected MPC replay or transaction nonce conflicts'
});

// Register custom metrics
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);
register.registerMetric(remittanceTransactionsTotal);
register.registerMetric(remittanceVolumeWei);
register.registerMetric(quotaExceededTotal);
register.registerMetric(mpcSigningRequestsTotal);
register.registerMetric(mpcRpcFailuresTotal);
register.registerMetric(mpcNonceConflictsTotal);

/**
 * Express middleware to collect route-based latency and request totals.
 */
export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationInSeconds = Number(end - start) / 1e9;
    
    // Normalize path to avoid high-cardinality label issues (e.g., replace UUIDs, IDs)
    let route = req.baseUrl + (req.route?.path || req.path);
    if (!route) {
      route = req.path;
    }
    // Replace typical UUIDs or hex addresses
    route = route
      .replace(/\/[\w-]{36}(\/|$)/, '/:id$1') // UUIDs
      .replace(/\/0x[a-fA-F0-9]{40}(\/|$)/, '/:address$1'); // Ethereum Addresses

    const labels = {
      method: req.method,
      route: route,
      status_code: res.statusCode.toString()
    };
    
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationInSeconds);
    
    if (res.statusCode === 429 && req.header('x-developer-id')) {
      quotaExceededTotal.inc({ developer_id: req.header('x-developer-id') });
    }
  });

  next();
};
