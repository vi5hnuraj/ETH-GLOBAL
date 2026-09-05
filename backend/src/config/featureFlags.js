/**
 * FeatureFlags — runtime feature flag catalog for the GlobalPay platform.
 *
 * Flags are product/toggle configuration loaded from environment variables
 * with a deterministic in-process override used by the maintenance-mode
 * endpoint and tests. Every flag is safe to disable at runtime; the API keeps
 * running with reduced functionality.
 *
 * Supported env vars (all default to their shipped value):
 *   FEATURE_SERVICE_STATUS   enable the service-status endpoint/UI  (default on)
 *   FEATURE_AUDIT_EXPORT     enable audit-log CSV/JSON export        (default on)
 *   FEATURE_USAGE_QUOTAS     enforce org/developer monthly quotas     (default on)
 *   MAINTENANCE_MODE         1 -> block writes with 503 (maintenance)  (default off)
 */

import dotenv from 'dotenv';
dotenv.config();

const bool = (value, fallback) => {
  if (value === undefined) return fallback;
  return value === '1' || value === 'true' || value === 'on';
};

const defaultFlags = {
  serviceStatus: bool(process.env.FEATURE_SERVICE_STATUS, true),
  auditExport: bool(process.env.FEATURE_AUDIT_EXPORT, true),
  usageQuotas: bool(process.env.FEATURE_USAGE_QUOTAS, true),
  apiVersioning: true,
  maintenanceMode: bool(process.env.MAINTENANCE_MODE, false)
};

const current = { ...defaultFlags };

export const FEATURE_FLAGS = defaultFlags;

/** Runtime mutations (maintenance toggles, tests). Never persisted. */
export const setFeatureFlag = (name, value) => {
  if (name in FEATURE_FLAGS) current[name] = Boolean(value);
  return current[name];
};

export const isFeatureEnabled = (name) => Boolean(current[name]);

export const getAllFlags = () => ({ ...current });