import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuditedMpcProvider } from '../src/mpc/auditedMpcProvider.js';

test('provider interface rejects non-2-of-3 wallets before any external request', async () => {
  let called = false;
  const provider = createAuditedMpcProvider({ request: async () => { called = true; } });
  await assert.rejects(() => provider.createWallet({ ownerId: 'owner', threshold: 1, parties: 3 }), /2-of-3/);
  assert.equal(called, false);
});

test('provider fails closed when the external MPC health endpoint is unavailable', async () => {
  const provider = createAuditedMpcProvider({ request: async () => { throw new Error('connection refused'); } });
  const previous = process.env.MPC_SERVICE_URL;
  process.env.MPC_SERVICE_URL = 'https://mpc.example.internal';
  try {
    await assert.rejects(() => provider.healthCheck(), /connection refused/);
  } finally {
    if (previous === undefined) delete process.env.MPC_SERVICE_URL;
    else process.env.MPC_SERVICE_URL = previous;
  }
});

test('paused provider blocks authorization before contacting an MPC provider', async () => {
  const previous = process.env.MPC_SIGNING_PAUSED;
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.MPC_SIGNING_PAUSED = 'true';
  let called = false;
  const provider = createAuditedMpcProvider({ request: async () => { called = true; } });
  try {
    await assert.rejects(() => provider.authorizeSigning({ walletId: 'wallet', authorization: {} }), /paused/);
    assert.equal(called, false);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previous === undefined) delete process.env.MPC_SIGNING_PAUSED;
    else process.env.MPC_SIGNING_PAUSED = previous;
  }
});
