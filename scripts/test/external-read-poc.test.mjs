import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runExternalReadPoc } from './external-read-poc.mjs';

const epoch = Date.parse('2026-11-03T00:00:00Z');
const id = '11111111-1111-4111-8111-111111111111';
const token = `synthetic.${Buffer.from(JSON.stringify({ exp: epoch / 1000 + 3600 })).toString('base64url')}.synthetic`;
const environment = (origin = 'https://synthetic.example.invalid') => ({
  EXTERNAL_READ_POC_BASE_URL: origin,
  EXTERNAL_READ_POC_CONNECTION_ID: id,
  EXTERNAL_READ_POC_ACCESS_TOKEN: token,
});
const window = {
  fromLocalDate: '2026-10-28',
  throughLocalDate: '2026-11-03',
  generated: 1,
  unknownTriggerGenerations: 0,
  accepted: 1,
  rejected: 0,
  selfReportedPosts: 1,
  activeDays: 1,
};
const dto = () => ({
  version: 'external-member-usage-v1',
  asOf: new Date(epoch).toISOString(),
  timezone: 'Asia/Tokyo',
  postEvidence: 'SELF_REPORTED_NOT_VERIFIED',
  last7Days: { ...window },
  last30Days: { ...window },
});
const envelope = (data) => ({ data, requestId: 'synthetic-request' });
function fake(patch = {}) {
  const calls = [];
  const responses = [
    new Response(JSON.stringify(envelope({ saved: true }))),
    new Response(JSON.stringify(envelope(dto()))),
    new Response(JSON.stringify({ error: { code: 'DENIED' } }), { status: 403 }),
  ];
  return {
    calls,
    options: {
      now: () => epoch,
      waitForRevocation: async () => {},
      request: async (url, init) => {
        calls.push({ url, init });
        return responses.shift();
      },
      ...patch,
    },
  };
}
test('real loopback HTTP observes bind/read/manual revocation/read without cookies or token persistence', async () => {
  const calls = [];
  let revoked = false;
  const server = createServer((req, res) => {
    calls.push({
      path: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    });
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/bind')) res.end(JSON.stringify(envelope({ saved: true })));
    else if (!revoked) res.end(JSON.stringify(envelope(dto())));
    else {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: { code: 'DENIED' } }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const result = await runExternalReadPoc(
      environment(`http://127.0.0.1:${server.address().port}`),
      {
        now: () => epoch,
        waitForRevocation: async () => {
          assert.equal(calls.length, 2);
          revoked = true;
        },
      },
    );
    assert.deepEqual(result, {
      binding: 'accepted',
      usageContract: 'valid',
      afterOwnerRevocation: 'denied',
      museCompatibility: 'not-tested',
    });
    assert.deepEqual(
      calls.map((c) => [c.method, c.path]),
      [
        ['POST', `/api/external/connections/${id}/bind`],
        ['GET', `/api/external/connections/${id}/usage`],
        ['GET', `/api/external/connections/${id}/usage`],
      ],
    );
    assert.ok(calls.every((c) => c.authorization === `Bearer ${token}` && c.cookie === undefined));
    assert.ok(!JSON.stringify(result).includes(token) && !JSON.stringify(result).includes(id));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('refuses invalid origins/configuration before any network or owner step', async () => {
  for (const origin of [
    'http://remote.example.invalid',
    'https://user:password@example.invalid',
    'https://example.invalid/path',
    'https://example.invalid/?secret=synthetic',
  ]) {
    const f = fake();
    await assert.rejects(
      runExternalReadPoc(environment(origin), f.options),
      /POC_CONFIGURATION_INVALID/,
    );
    assert.equal(f.calls.length, 0);
  }
  const f = fake();
  await assert.rejects(
    runExternalReadPoc(
      { ...environment(), EXTERNAL_READ_POC_ACCESS_TOKEN: 'not-a-token' },
      f.options,
    ),
    /POC_CONFIGURATION_INVALID/,
  );
  assert.equal(f.calls.length, 0);
});
test('never assumes an owner revocation step', async () => {
  const f = fake({ waitForRevocation: undefined });
  await assert.rejects(
    runExternalReadPoc(environment(), f.options),
    /POC_REVOCATION_STEP_REQUIRED/,
  );
  assert.equal(f.calls.length, 0);
});
test('expired token is inconclusive before network, and expiry during the owner step is not revocation success', async () => {
  const expired = fake({ now: () => epoch + 3600_001 });
  await assert.rejects(
    runExternalReadPoc(environment(), expired.options),
    /POC_TOKEN_EXPIRED_INCONCLUSIVE/,
  );
  assert.equal(expired.calls.length, 0);
  let time = epoch;
  const f = fake({
    now: () => time,
    waitForRevocation: async () => {
      time += 3600_001;
    },
  });
  await assert.rejects(
    runExternalReadPoc(environment(), f.options),
    /POC_TOKEN_EXPIRED_INCONCLUSIVE/,
  );
  assert.equal(f.calls.length, 2);
});
test('empty catalog and expired/foreign credentials never become successful tests', async () => {
  for (const status of [401, 403, 404, 503]) {
    const f = fake({ request: async () => new Response('{}', { status }) });
    await assert.rejects(runExternalReadPoc(environment(), f.options), /POC_BIND_FAILED/);
  }
});
test('does not follow redirects or expose network error details', async () => {
  const f = fake({
    request: async (_url, init) => {
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      throw new Error(`private ${token}`);
    },
  });
  await assert.rejects(runExternalReadPoc(environment(), f.options), {
    message: 'POC_REQUEST_FAILED',
  });
});
test('real redirects do not forward Bearer credentials to another endpoint', async () => {
  let destinationCalls = 0;
  const destination = createServer((_req, res) => {
    destinationCalls++;
    res.end('{}');
  });
  destination.listen(0, '127.0.0.1');
  await once(destination, 'listening');
  const source = createServer((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${destination.address().port}/leak` });
    res.end();
  });
  source.listen(0, '127.0.0.1');
  await once(source, 'listening');
  try {
    await assert.rejects(
      runExternalReadPoc(environment(`http://127.0.0.1:${source.address().port}`), {
        now: () => epoch,
        waitForRevocation: async () => {},
      }),
      /POC_REQUEST_FAILED/,
    );
    assert.equal(destinationCalls, 0);
  } finally {
    for (const server of [source, destination]) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
test('fails the minimal DTO contract if internal scope or cost is accidentally exposed', async () => {
  for (const data of [
    { ...dto(), scope: { userId: 'synthetic' } },
    { ...dto(), last7Days: { ...window, aiCost: 5 } },
    { ...dto(), last30Days: { ...window, generated: -1 } },
  ]) {
    let calls = 0;
    const f = fake({
      request: async () =>
        new Response(JSON.stringify(envelope(++calls === 1 ? { saved: true } : data))),
    });
    await assert.rejects(
      runExternalReadPoc(environment(), f.options),
      /POC_USAGE_CONTRACT_INVALID/,
    );
    assert.equal(calls, 2);
  }
});
test('accepts only the expected denial after the operator step, not outages or empty successes', async () => {
  for (const [status, body] of [
    [200, envelope(dto())],
    [503, { error: { code: 'UNAVAILABLE' } }],
    [403, { error: { code: 'OTHER' } }],
  ]) {
    const f = fake();
    const original = f.options.request;
    f.options.request = async (...args) =>
      f.calls.length === 2 ? new Response(JSON.stringify(body), { status }) : original(...args);
    await assert.rejects(
      runExternalReadPoc(environment(), f.options),
      /POC_REVOCATION_NOT_CONFIRMED/,
    );
  }
});
test('CLI prints a fixed configuration failure without secrets, paths or raw stacks', () => {
  const run = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./external-read-poc.mjs', import.meta.url))],
    {
      env: {
        SystemRoot: process.env.SystemRoot,
        EXTERNAL_READ_POC_ACCESS_TOKEN: 'synthetic-private',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr.trim(), 'POC_CONFIGURATION_INVALID');
});
