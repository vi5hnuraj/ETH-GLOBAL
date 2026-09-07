import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMpcWalletService } from '../src/wallets/mpcWalletService.js';
import { getWalletService } from '../src/wallets/walletService.js';

// ─── Helper ────────────────────────────────────────────────────────────────

/** Set NETWORK + CHAIN_ID together, clean up in t.after(). */
const setNetwork = (t, network, chainId) => {
  const prevNetwork = process.env.NETWORK;
  const prevChainId = process.env.CHAIN_ID;
  process.env.NETWORK = network;
  process.env.CHAIN_ID = String(chainId);
  t.after(() => {
    if (prevNetwork === undefined) delete process.env.NETWORK;
    else process.env.NETWORK = prevNetwork;
    if (prevChainId === undefined) delete process.env.CHAIN_ID;
    else process.env.CHAIN_ID = prevChainId;
  });
};

// Every wallet-path test talks to the configured MPC provider. Set the URL
// explicitly so tests never depend on a .env default or a local fallback.
const setMpcUrl = (t, url = 'http://localhost:8080', token = 'test-token') => {
  const prevUrl = process.env.MPC_SERVICE_URL;
  const prevToken = process.env.MPC_SERVICE_TOKEN;
  process.env.MPC_SERVICE_URL = url;
  process.env.MPC_SERVICE_TOKEN = token;
  t.after(() => {
    if (prevUrl === undefined) delete process.env.MPC_SERVICE_URL;
    else process.env.MPC_SERVICE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MPC_SERVICE_TOKEN;
    else process.env.MPC_SERVICE_TOKEN = prevToken;
  });
};

const missingMpcUrl = (t) => {
  const prev = process.env.MPC_SERVICE_URL;
  delete process.env.MPC_SERVICE_URL;
  t.after(() => {
    if (prev === undefined) delete process.env.MPC_SERVICE_URL;
    else process.env.MPC_SERVICE_URL = prev;
  });
};

/** Preserve MAINNET_BROADCAST_ENABLED + MAINNET_APPROVAL_TOKEN across a test. */
const setMainnetBroadcast = (t, enabled, token) => {
  const prevEnabled = process.env.MAINNET_BROADCAST_ENABLED;
  const prevToken = process.env.MAINNET_APPROVAL_TOKEN;
  if (enabled === undefined) delete process.env.MAINNET_BROADCAST_ENABLED;
  else process.env.MAINNET_BROADCAST_ENABLED = String(enabled);
  if (token === undefined) delete process.env.MAINNET_APPROVAL_TOKEN;
  else process.env.MAINNET_APPROVAL_TOKEN = token;
  t.after(() => {
    if (prevEnabled === undefined) delete process.env.MAINNET_BROADCAST_ENABLED;
    else process.env.MAINNET_BROADCAST_ENABLED = prevEnabled;
    if (prevToken === undefined) delete process.env.MAINNET_APPROVAL_TOKEN;
    else process.env.MAINNET_APPROVAL_TOKEN = prevToken;
  });
};

// ─── Provider selection ─────────────────────────────────────────────────────

test('getWalletService returns mpc provider when WALLET_PROVIDER is mpc', (t) => {
  const originalEnv = process.env.WALLET_PROVIDER;
  process.env.WALLET_PROVIDER = 'mpc';
  t.after(() => { process.env.WALLET_PROVIDER = originalEnv; });
  const svc = getWalletService();
  assert.equal(svc.provider, 'mpc');
});

// ─── Testnet (chain 5042002) happy path ─────────────────────────────────────────

test('mpcWalletService createWallet on testnet/5042002 calls external MPC and returns wallet details', async (t) => {
  setNetwork(t, 'testnet', 5042002);
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.threshold, 2);
    assert.equal(body.parties, 3);
    assert.equal(body.chainId, 5042002);
    return {
      ok: true,
      json: async () => ({
        walletId: 'wallet-testnet-123',
        address: '0x1234567890123456789012345678901234567890',
        status: 'READY'
      })
    };
  };

  const svc = createMpcWalletService();
  const wallet = await svc.createWallet({ name: 'Test MPC', ownerId: 'user-1' });
  assert.equal(wallet.walletId, 'wallet-testnet-123');
  assert.equal(wallet.address, '0x1234567890123456789012345678901234567890');
  assert.equal(wallet.provider, 'mpc');
  assert.equal(wallet.privateKey, null);
});

test('mpcWalletService sendPayment on testnet/5042002 succeeds', async (t) => {
  setNetwork(t, 'testnet', 5042002);
  setMpcUrl(t);
  delete process.env.MAINNET_BROADCAST_ENABLED;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets/wallet-testnet-123/send');
    const body = JSON.parse(options.body);
    assert.equal(body.chainId, 5042002);
    return {
      ok: true,
      json: async () => ({ txHash: '0xhash_testnet', status: 'BROADCASTED' })
    };
  };

  const svc = createMpcWalletService();
  const result = await svc.sendPayment({ walletId: 'wallet-testnet-123', to: '0xrecipient', wei: '1000000000' });
  assert.equal(result.txHash, '0xhash_testnet');
  assert.equal(result.provider, 'mpc');
});

// ─── Mainnet (chain 5042001) wallet creation — allowed even while broadcast is locked ─

test('mpcWalletService createWallet on mainnet/5042001 is allowed regardless of broadcast lock', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMpcUrl(t);
  delete process.env.MAINNET_BROADCAST_ENABLED;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.chainId, 5042001);
    return {
      ok: true,
      json: async () => ({
        walletId: 'wallet-mainnet-456',
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        status: 'READY'
      })
    };
  };

  const svc = createMpcWalletService();
  const wallet = await svc.createWallet({ name: 'Mainnet MPC', ownerId: 'user-mainnet' });
  assert.equal(wallet.walletId, 'wallet-mainnet-456');
  assert.equal(wallet.provider, 'mpc');
});

// ─── Mainnet broadcast lock: sendPayment blocked by default ─────────────────

test('mpcWalletService sendPayment on mainnet/5042001 is blocked by default (MAINNET_BROADCAST_ENABLED not set)', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMainnetBroadcast(t, undefined, undefined);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.sendPayment({ walletId: 'wallet-mainnet-456', to: '0xbad', wei: '1' }),
    (err) => {
      assert.match(err.message, /Mainnet broadcasting is locked/);
      assert.match(err.message, /MAINNET_BROADCAST_ENABLED/);
      return true;
    }
  );
});

test('mpcWalletService sendPayment on mainnet/5042001 is blocked when MAINNET_BROADCAST_ENABLED=false', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMainnetBroadcast(t, false, undefined);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.sendPayment({ walletId: 'wallet-mainnet-456', to: '0xbad', wei: '1' }),
    (err) => {
      assert.match(err.message, /Mainnet broadcasting is locked/);
      return true;
    }
  );
});

// ─── Mainnet approval token: fail closed when missing/invalid ──────────────

test('mpcWalletService sendPayment on mainnet/5042001 is blocked when enabled but MAINNET_APPROVAL_TOKEN is missing', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMpcUrl(t);
  setMainnetBroadcast(t, true, undefined);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.sendPayment({ walletId: 'wallet-mainnet-456', to: '0xbad', wei: '1' }),
    (err) => {
      assert.match(err.message, /MAINNET_APPROVAL_TOKEN is missing/);
      return true;
    }
  );
});

test('mpcWalletService sendPayment on mainnet/5042001 is blocked when approval token is blank whitespace', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMpcUrl(t);
  setMainnetBroadcast(t, true, '   ');

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.sendPayment({ walletId: 'wallet-mainnet-456', to: '0xbad', wei: '1' }),
    (err) => {
      assert.match(err.message, /MAINNET_APPROVAL_TOKEN is missing/);
      return true;
    }
  );
});

// ─── Mainnet send with armed config forwards the approval header ───────────

test('mpcWalletService sendPayment on mainnet/5042001 forwards X-Mainnet-Approval when armed', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMainnetBroadcast(t, true, 'approval-s3cret-token');
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets/wallet-mainnet-456/send');
    assert.equal(options.headers['X-Mainnet-Approval'], 'approval-s3cret-token');
    const body = JSON.parse(options.body);
    assert.equal(body.chainId, 5042001);
    assert.ok(body.idempotencyKey, 'idempotency key should be derived');
    assert.ok(body.sessionId, 'sessionId should mirror the idempotency key');
    return {
      ok: true,
      json: async () => ({ txHash: '0xhash_mainnet', status: 'BROADCASTED' })
    };
  };

  const svc = createMpcWalletService();
  const result = await svc.sendPayment({ walletId: 'wallet-mainnet-456', to: '0xrecipient', wei: '1000000000' });
  assert.equal(result.txHash, '0xhash_mainnet');
  assert.equal(result.provider, 'mpc');
});

// ─── Testnet never sends the approval header ───────────────────────────────

test('mpcWalletService sendPayment on testnet/5042002 does NOT send X-Mainnet-Approval', async (t) => {
  setNetwork(t, 'testnet', 5042002);
  setMainnetBroadcast(t, true, 'approval-s3cret-token');
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets/wallet-testnet-123/send');
    assert.equal(options.headers['X-Mainnet-Approval'], undefined);
    return {
      ok: true,
      json: async () => ({ txHash: '0xhash_testnet', status: 'BROADCASTED' })
    };
  };

  const svc = createMpcWalletService();
  const result = await svc.sendPayment({ walletId: 'wallet-testnet-123', to: '0xrecipient', wei: '1000000000' });
  assert.equal(result.txHash, '0xhash_testnet');
});

// ─── Wallet metadata: chainId propagation ──────────────────────────────────

test('mpcWalletService createWallet propagates chainId from the MPC provider', async (t) => {
  setNetwork(t, 'mainnet', 5042001);
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets');
    return {
      ok: true,
      json: async () => ({
        walletId: 'wallet-chain-1',
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        chainId: 5042001,
        status: 'READY'
      })
    };
  };

  const svc = createMpcWalletService();
  const wallet = await svc.createWallet({ name: 'Chain MPC', ownerId: 'user-1' });
  assert.equal(wallet.walletId, 'wallet-chain-1');
  assert.equal(wallet.chainId, 5042001);
});

test('mpcWalletService getWallet resolves authoritative chainId', async (t) => {
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets/wallet-lookup-1');
    return {
      ok: true,
      json: async () => ({ walletId: 'wallet-lookup-1', chainId: 5042001, status: 'READY' })
    };
  };

  const svc = createMpcWalletService();
  assert.equal(await svc.getWalletChainId('wallet-lookup-1'), 5042001);
});

test('mpcWalletService getWalletChainId fails closed when the wallet has no chainId', async (t) => {
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ walletId: 'wallet-nochain-1' }) });

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.getWalletChainId('wallet-nochain-1'),
    (err) => {
      assert.match(err.message, /no chain ID/);
      return true;
    }
  );
});

// ─── Network/chain mismatch: hard rejection ─────────────────────────────────

test('mpcWalletService rejects NETWORK=testnet + CHAIN_ID=5042001 mismatch', async (t) => {
  setNetwork(t, 'testnet', 5042001);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.createWallet({ name: 'Bad Config', ownerId: 'user-1' }),
    (err) => {
      assert.match(err.message, /configuration mismatch/);
      assert.match(err.message, /testnet/);
      assert.match(err.message, /5042002/);
      return true;
    }
  );
});

test('mpcWalletService rejects NETWORK=mainnet + CHAIN_ID=5042002 mismatch', async (t) => {
  setNetwork(t, 'mainnet', 5042002);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.createWallet({ name: 'Bad Config', ownerId: 'user-1' }),
    (err) => {
      assert.match(err.message, /configuration mismatch/);
      assert.match(err.message, /mainnet/);
      assert.match(err.message, /5042001/);
      return true;
    }
  );
});

test('mpcWalletService rejects invalid NETWORK value', async (t) => {
  setNetwork(t, 'devnet', 5042002);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.createWallet({ name: 'Bad Config', ownerId: 'user-1' }),
    (err) => {
      assert.match(err.message, /Invalid NETWORK/);
      assert.match(err.message, /devnet/);
      return true;
    }
  );
});

// ─── getAddress ─────────────────────────────────────────────────────────────

test('mpcWalletService getAddress returns wallet address from external MPC provider', async (t) => {
  setMpcUrl(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8080/api/v1/wallets/wallet-mpc-123');
    assert.equal(options.method, 'GET');
    return {
      ok: true,
      json: async () => ({ address: '0x1234567890123456789012345678901234567890' })
    };
  };

  const svc = createMpcWalletService();
  const address = await svc.getAddress({ walletId: 'wallet-mpc-123', walletAddress: '0xfallback' });
  assert.equal(address, '0x1234567890123456789012345678901234567890');
});

test('mpcWalletService getAddress falls back to walletAddress when no walletId', async (t) => {
  const svc = createMpcWalletService();
  const address = await svc.getAddress({ walletId: null, walletAddress: '0xfallback' });
  assert.equal(address, '0xfallback');
});

// ─── Fail-closed configuration ──────────────────────────────────────────────

test('mpcWalletService fails closed when MPC_SERVICE_URL is not configured (no local fallback)', async (t) => {
  setNetwork(t, 'testnet', 5042002);
  missingMpcUrl(t);

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.createWallet({ name: 'No Fallback', ownerId: 'user-1' }),
    (err) => {
      assert.equal(err.code, 'MPC_NOT_CONFIGURED');
      assert.match(err.message, /MPC_SERVICE_URL is not configured/);
      return true;
    }
  );
});

test('mpcWalletService fails closed when MPC_SERVICE_URL is empty', async (t) => {
  setNetwork(t, 'testnet', 5042002);
  const prev = process.env.MPC_SERVICE_URL;
  process.env.MPC_SERVICE_URL = '   ';
  t.after(() => {
    if (prev === undefined) delete process.env.MPC_SERVICE_URL;
    else process.env.MPC_SERVICE_URL = prev;
  });

  const svc = createMpcWalletService();
  await assert.rejects(
    () => svc.createWallet({ name: 'No Fallback', ownerId: 'user-1' }),
    (err) => {
      assert.equal(err.code, 'MPC_NOT_CONFIGURED');
      assert.match(err.message, /MPC_SERVICE_URL/);
      return true;
    }
  );
});
