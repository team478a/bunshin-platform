// Test-only Node guard; not an OS sandbox or a production security mechanism.
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns');
const { syncBuiltinESMExports } = require('node:module');
const ports = new Set([18998, 18999, 19000, 19002]);
function allowed(host, port) {
  return ['127.0.0.1', 'localhost', '::1'].includes(host) && ports.has(Number(port));
}
function check(args) {
  const first = args[0];
  const options = typeof first === 'object' ? first : { port: first, host: args[1] };
  if (!allowed(options.host ?? 'localhost', options.port))
    throw new Error('E2E socket destination forbidden');
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node's normalized argument array is passed by net.connect as one argument.
  check(Array.isArray(args[0]) ? args[0] : args);
  return connect.apply(this, args);
};
const tlsConnect = tls.connect;
tls.connect = function (...args) {
  check(args);
  return tlsConnect.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  if (!['localhost', '127.0.0.1', '::1'].includes(host))
    throw new Error('E2E DNS destination forbidden');
  return lookup.call(this, host, ...args);
};
const request = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname, url.port) || url.protocol !== 'http:')
    throw new Error('E2E fetch destination forbidden');
  return request(input, options);
};
syncBuiltinESMExports();
