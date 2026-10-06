// Test-only loopback server. No env files, Next, DB or Provider.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const { createServer } = await import(pathToFileURL(vitestRequire.resolve('vite')).href);
const server = await createServer({
  configFile: false,
  envDir: false,
  root: fileURLToPath(new URL('../../apps/web/test/browser/profile-preparation/', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1',
    port: 18998,
    strictPort: true,
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:18998; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
      'Cache-Control': 'no-store',
    },
  },
});
await server.listen();
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
