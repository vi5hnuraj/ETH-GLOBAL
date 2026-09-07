/**
 * PlatformController — operational endpoints for the developer platform:
 *   - /platform/health        public liveness + component status
 *   - /platform/flags         effective feature flags (public, harmless read)
 *   - /platform/environment   active runtime environment config
 *   - /platform/maintenance   toggle maintenance mode (dev-guarded)
 */

import { getMonitoring } from '../services/monitoringService.js';
import { getAllFlags, isFeatureEnabled, setFeatureFlag } from '../config/featureFlags.js';
import { ok } from '../utils/respond.js';

const ENV = (process.env.NODE_ENV || 'development').toLowerCase();

export const health = async (_req, res) => {
  try {
    const monitoring = await getMonitoring();
    const workers = monitoring.workers || {};
    const workerEntries = Object.values(workers);
    const components = {
      api: monitoring.api?.status === 'ok' ? 'ok' : 'down',
      database: monitoring.database?.status === 'ok' ? 'ok' : 'down',
      rpc: monitoring.rpc?.status === 'ok' ? 'ok' : 'down',
      mpc: monitoring.mpc?.productionConfigurationValid === false && ENV === 'production' ? 'down' : 'ok',
      workers: workerEntries.length ? (workerEntries.every((w) => w && w.status === 'running') ? 'ok' : 'degraded') : 'degraded'
    };
    const order = ['api', 'database', 'rpc', 'mpc', 'workers'];
    const overall = order.some((c) => components[c] === 'down')
      ? 'down'
      : order.every((c) => components[c] === 'ok') ? 'ok' : 'degraded';

    return res.json({
      success: true,
      status: overall,
      components,
      maintenance: isFeatureEnabled('maintenanceMode'),
      uptimeSeconds: monitoring.api?.uptimeSeconds || Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ success: false, status: 'down', message: err.message });
  }
};

export const flags = (_req, res) => {
  res.json({ success: true, flags: getAllFlags() });
};

export const environment = (_req, res) => {
  res.json({
    success: true,
    environment: ENV,
    isDevelopment: ENV !== 'production',
    rpcUrl: process.env.ARC_RPC_URL || process.env.RPC_URL || 'https://rpc.testnet.arc.io',
    explorerUrl: process.env.ARC_EXPLORER_URL || process.env.EXPLORER_URL || 'https://testnet.arcscan.app/',
    chainId: Number(process.env.ARC_CHAIN_ID || process.env.CHAIN_ID || 5042002),
    maintenanceMode: isFeatureEnabled('maintenanceMode')
  });
};

export const setMaintenance = (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'enabled must be a boolean.' });
  }
  setFeatureFlag('maintenanceMode', enabled);
  res.json({ success: true, maintenanceMode: isFeatureEnabled('maintenanceMode') });
};
