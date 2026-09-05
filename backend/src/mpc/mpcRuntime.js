/**
 * Production boundary for the external threshold-MPC service.
 *
 * GlobalPay deliberately does not implement threshold cryptography in the API
 * process.  That work must be performed by an independently deployed, audited
 * MPC implementation.  These checks make an accidental single-node/local
 * deployment fail before it can be used for production signing.
 */
import crypto from 'crypto';

const PROD = () => (process.env.NODE_ENV || '').toLowerCase() === 'production';
const allowedSecretBackends = new Set(['vault', 'aws-kms', 'gcp-kms', 'azure-key-vault', 'hsm']);

export const mpcNodeUrls = () => ['MPC_NODE_A_URL', 'MPC_NODE_B_URL', 'MPC_NODE_C_URL']
  .map((name) => ({ name, value: process.env[name] || '' }));

export const assertMpcProductionConfiguration = () => {
  if (!PROD() || (process.env.WALLET_PROVIDER || 'mpc') !== 'mpc') return;
  const errors = [];
  if ((process.env.MPC_TRANSPORT || '').toLowerCase() === 'inmemory' || !process.env.MPC_TRANSPORT) {
    errors.push('MPC_TRANSPORT must be remote-2of3 (never inmemory)');
  }
  if (!allowedSecretBackends.has((process.env.SECRET_BACKEND || '').toLowerCase())) {
    errors.push('SECRET_BACKEND must be Vault, KMS, Key Vault, or HSM (never local)');
  }
  if (!process.env.MPC_REQUEST_SIGNING_KEY_REF) errors.push('MPC_REQUEST_SIGNING_KEY_REF is required');
  for (const name of ['MPC_MTLS_CA_FILE', 'MPC_MTLS_CERT_FILE', 'MPC_MTLS_KEY_FILE']) {
    if (!process.env[name]) errors.push(`${name} is required for mTLS`);
  }
  const nodes = mpcNodeUrls();
  if (nodes.some((node) => !node.value || new URL(node.value).protocol !== 'https:')) {
    errors.push('all three MPC_NODE_[A-C]_URL values must use https');
  }
  if (new Set(nodes.map((node) => node.value)).size !== 3) errors.push('MPC nodes must have three distinct endpoints');
  const serviceUrls = (process.env.MPC_SERVICE_URL || '').split(',').map(s => s.trim());
  for (const sUrl of serviceUrls) {
    if (!nodes.some((node) => node.value === sUrl)) {
      errors.push(`MPC_SERVICE_URL endpoint "${sUrl}" must be one of the three MPC node endpoints`);
    }
  }
  // A paused state is safe and must not prevent the API/health plane from
  // starting. assertMpcSigningAllowed enforces the pause at every signing path.
  if (errors.length) throw new Error(`Unsafe MPC production configuration: ${errors.join('; ')}`);
};

export const assertMpcSigningAllowed = () => {
  const defaultPaused = PROD() ? 'true' : 'false';
  if ((process.env.MPC_SIGNING_PAUSED || defaultPaused).toLowerCase() !== 'false') {
    const err = new Error('MPC signing is paused by the emergency control. No signature was requested.');
    err.code = 'MPC_SIGNING_PAUSED';
    throw err;
  }
};

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Creates a replay-resistant signed request envelope. The signing secret is
 * injected at runtime by the selected secret manager, never stored in source
 * or in a wallet/node configuration. */
export const signedMpcHeaders = ({ method, path, body, key = process.env.MPC_REQUEST_SIGNING_KEY }) => {
  if (!key) throw new Error('MPC request signing key is unavailable from the configured secret backend');
  const keyRef = process.env.MPC_REQUEST_SIGNING_KEY_REF;
  if (!keyRef) {
    throw new Error('MPC_REQUEST_SIGNING_KEY_REF is required from the configured secret backend');
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const payload = stableJson(body || {});
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  const canonical = [method.toUpperCase(), path, timestamp, nonce, digest].join('\n');
  const signature = crypto.createHmac('sha256', key).update(canonical).digest('base64url');
  return {
    'X-MPC-Timestamp': timestamp,
    'X-MPC-Nonce': nonce,
    'X-MPC-Content-SHA256': digest,
    'X-MPC-Signature': signature,
    'X-MPC-Key-Ref': keyRef,
  };
};

export const getMpcRuntimeStatus = () => ({
  transport: process.env.MPC_TRANSPORT || 'unset',
  secretBackend: process.env.SECRET_BACKEND || 'unset',
  signingPaused: (process.env.MPC_SIGNING_PAUSED || (PROD() ? 'true' : 'false')).toLowerCase() !== 'false',
  nodesConfigured: mpcNodeUrls().filter((node) => node.value).length,
  productionConfigurationValid: (() => { try { assertMpcProductionConfiguration(); return true; } catch { return false; } })()
});
