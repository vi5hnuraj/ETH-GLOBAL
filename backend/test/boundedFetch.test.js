import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boundedFetch } from '../src/utils/boundedFetch.js';

const startServer = (handler) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      handler({
        method: req.method,
        url: req.url,
        body: Buffer.concat(chunks).toString('utf8'),
      })
        .then(({ status, body }) => {
          res.writeHead(status, { 'Content-Type': 'application/json', 'Connection': 'close' });
          res.end(body);
        })
        .catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Connection': 'close' });
          res.end(JSON.stringify({ message: err.message }));
        });
    });
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

// Simulates the gateway downgrading the `sb_secret_` service key to `anon`:
// PostgREST answers the write with 200 + an empty array (RLS filters every row)
// instead of 42501. `.single()` callers would then fail with PGRST116 "0 rows".
test('retries a write that comes back as an empty list on a fresh socket', async (t) => {
  let requests = 0;
  const server = await startServer(async () => {
    requests += 1;
    if (requests === 1) {
      return { status: 200, body: '[]' };
    }
    return { status: 200, body: '[{"id":"57b7bbd7-5c84-44e2-b603-a831cbd32865","primary_receiving_wallet":"external"}]' };
  });
  t.after(() => server.close());

  const res = await boundedFetch(
    `http://127.0.0.1:${server.address().port}/rest/v1/profiles?id=eq.test`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ primary_receiving_wallet: 'external' }),
    }
  );

  assert.equal(res.status, 200);
  const json = JSON.parse(await res.text());
  assert.equal(json.length, 1);
  assert.equal(json[0].primary_receiving_wallet, 'external');
  assert.equal(requests, 2, 'the degraded empty reply should be retried once');
});

test('returns an empty list read after exhausting the read-retry budget', async (t) => {
  let requests = 0;
  const server = await startServer(async () => {
    requests += 1;
    return { status: 200, body: '[]' };
  });
  t.after(() => server.close());

  const res = await boundedFetch(
    `http://127.0.0.1:${server.address().port}/rest/v1/profiles`,
    { method: 'GET' }
  );

  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(await res.text()), []);
  // A legitimately empty list is indistinguishable from a degraded anon read
  // (RLS filters every row → 200 []), so reads are retried on fresh sockets up
  // to the capped budget, then the empty result is returned.
  assert.equal(requests, 3, 'empty list reads are retried within the read budget');
});