// Test-only Next development transport. Never use this as an application proxy.
import http from 'node:http';

export function attachNextDevelopmentUpgrade(server) {
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  };
  const onUpgrade = (req, socket, head) => {
    // Exact endpoint verified in the installed Next 16.3.3 client. No arbitrary tunnel.
    if (req.url?.split('?')[0] !== '/_next/hmr') return socket.destroy();
    track(socket);
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: 19002,
      path: req.url,
      headers: { ...req.headers, host: '127.0.0.1:19000' },
    });
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('upgrade', (response, peer, peerHead) => {
      track(peer);
      upstream.setTimeout(0);
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`);
      for (const [key, value] of Object.entries(response.headers))
        if (typeof value === 'string') socket.write(`${key}: ${value}\r\n`);
      socket.write('\r\n');
      if (peerHead.length) socket.write(peerHead);
      if (head.length) peer.write(head);
      peer.on('error', () => socket.destroy());
      socket.on('error', () => peer.destroy());
      socket.on('close', () => peer.destroy());
      peer.on('close', () => socket.destroy());
      socket.pipe(peer).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    upstream.on('response', (response) => {
      response.resume();
      socket.destroy();
    });
    socket.on('close', () => upstream.destroy());
    upstream.end();
  };
  server.on('upgrade', onUpgrade);
  return () => {
    server.off('upgrade', onUpgrade);
    for (const socket of sockets) socket.destroy();
  };
}
