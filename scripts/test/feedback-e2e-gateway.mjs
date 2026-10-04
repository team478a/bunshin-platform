// Test-only fixed-target gateway. Auth/DB remain on a Docker internal network.
import http from 'node:http';
import net from 'node:net';

http
  .createServer((request, response) => {
    if (!request.url?.startsWith('/auth/v1/')) {
      response.writeHead(404).end();
      return;
    }
    const upstream = http.request(
      {
        hostname: 'auth',
        port: 9999,
        method: request.method,
        path: request.url.slice('/auth/v1'.length),
        headers: request.headers,
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, result.headers);
        result.pipe(response);
      },
    );
    upstream.on('error', () => response.writeHead(502).end());
    request.pipe(upstream);
  })
  .listen(18999, '0.0.0.0');

net
  .createServer((socket) => {
    const upstream = net.connect({ host: 'db', port: 5432 });
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.pipe(upstream).pipe(socket);
  })
  .listen(18998, '0.0.0.0');
