import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMpcProductionConfiguration,
  assertMpcSigningAllowed,
  signedMpcHeaders
} from '../src/mpc/mpcRuntime.js';

const withEnv = async (changes, fn) => {
  const before = Object.fromEntries(Object.keys(changes).map((key) => [key, process.env[key]]));
  Object.entries(changes).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  try { await fn(); } finally {
    Object.entries(before).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  }
};

test('production MPC rejects inmemory transport and local secrets', async () => {
  await withEnv({ NODE_ENV: 'production', WALLET_PROVIDER: 'mpc', MPC_TRANSPORT: 'inmemory', SECRET_BACKEND: 'local' }, () => {
    assert.throws(assertMpcProductionConfiguration, /never inmemory.*never local/i);
  });
});

test('production MPC accepts only three distinct HTTPS nodes with a nonlocal secret backend', async () => {
  await withEnv({
    NODE_ENV: 'production', WALLET_PROVIDER: 'mpc', MPC_TRANSPORT: 'remote-2of3', SECRET_BACKEND: 'vault',
    MPC_REQUEST_SIGNING_KEY_REF: 'kv/data/mpc/request', MPC_SIGNING_PAUSED: 'true',
    MPC_MTLS_CA_FILE: '/run/ca.pem', MPC_MTLS_CERT_FILE: '/run/cert.pem', MPC_MTLS_KEY_FILE: '/run/key.pem',
    MPC_SERVICE_URL: 'https://a.mpc.internal', MPC_NODE_A_URL: 'https://a.mpc.internal', MPC_NODE_B_URL: 'https://b.mpc.internal', MPC_NODE_C_URL: 'https://c.mpc.internal'
  }, () => assert.doesNotThrow(assertMpcProductionConfiguration));
});

test('paused signing fails before an MPC request can be created', async () => {
  await withEnv({ NODE_ENV: 'production', MPC_SIGNING_PAUSED: 'true' }, () => {
    assert.throws(assertMpcSigningAllowed, { code: 'MPC_SIGNING_PAUSED' });
  });
});

test('MPC request envelope signs canonical payload and includes anti-replay fields', async () => {
  await withEnv({ MPC_REQUEST_SIGNING_KEY: 'test-secret', MPC_REQUEST_SIGNING_KEY_REF: 'vault-ref' }, () => {
    const headers = signedMpcHeaders({ method: 'POST', path: '/v1/sign', body: { b: 2, a: 1 } });
    assert.match(headers['X-MPC-Nonce'], /^[0-9a-f-]{36}$/);
    assert.match(headers['X-MPC-Signature'], /^[A-Za-z0-9_-]+$/);
    assert.equal(headers['X-MPC-Key-Ref'], 'vault-ref');
    assert.match(headers['X-MPC-Content-SHA256'], /^[a-f0-9]{64}$/);
  });
});
