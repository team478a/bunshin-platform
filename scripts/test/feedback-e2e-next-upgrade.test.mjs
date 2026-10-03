import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { attachNextDevelopmentUpgrade } from './feedback-e2e-next-upgrade.mjs';

async function setup(t, upgrade = true) {
  const sockets = new Set();
  const requests = [];
  const upstream = http.createServer((req, res) => res.writeHead(400).end());
  upstream.on('upgrade', (req, socket, head) => {
    requests.push({ path: req.url, host: req.headers.host });
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    if (!upgrade) return socket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
    );
    if (head.length) socket.write(head);
    socket.on('data', (part) => socket.write(part));
  });
  const proxy = http.createServer((req, res) => res.writeHead(404).end());
  const cleanup = attachNextDevelopmentUpgrade(proxy);
  t.after(async () => {
    cleanup();
    for (const socket of sockets) socket.destroy();
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  });
  upstream.listen(19002, '127.0.0.1');
  await once(upstream, 'listening');
  proxy.listen(19000, '127.0.0.1');
  await once(proxy, 'listening');
  return { cleanup, requests };
}
function connect(path) {
  const request = http.request({
    hostname: '127.0.0.1',
    port: 19000,
    path,
    headers: { connection: 'Upgrade', upgrade: 'websocket' },
  });
  request.end();
  return request;
}
test(
  'test-only upgrade forwards the verified Next endpoint and bytes to one fixed loopback target',
  { timeout: 10000 },
  async (t) => {
    const { requests, cleanup } = await setup(t);
    const request = connect('/_next/hmr?id=synthetic');
    const [response, socket] = await once(request, 'upgrade');
    assert.equal(response.statusCode, 101);
    assert.deepEqual(requests, [{ path: '/_next/hmr?id=synthetic', host: '127.0.0.1:19000' }]);
    const echoed = once(socket, 'data');
    socket.write('synthetic-opaque-bytes');
    assert.equal((await echoed)[0].toString(), 'synthetic-opaque-bytes');
    const closed = once(socket, 'close');
    cleanup();
    await closed;
    assert.equal(socket.destroyed, true);
  },
);
test(
  'test-only upgrade rejects other paths without reaching the upstream',
  { timeout: 10000 },
  async (t) => {
    const { requests } = await setup(t);
    const request = connect('/api/arbitrary-tunnel');
    await assert.rejects(once(request, 'upgrade'), /socket hang up/);
    assert.deepEqual(requests, []);
  },
);
test(
  'test-only upgrade closes the client when Next refuses the upgrade',
  { timeout: 10000 },
  async (t) => {
    const { requests } = await setup(t, false);
    const request = connect('/_next/hmr');
    await assert.rejects(once(request, 'upgrade'), /socket hang up/);
    assert.equal(requests.length, 1);
  },
);
