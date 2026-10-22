import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runMigrationProcess } from './migration-process.mjs';
import { psqlArguments, psqlEnvironment } from './release-psql.mjs';
import { readReleasePrismaDiagnostic } from './release-prisma-command.mjs';

// TLS front end to the disposable local PostgreSQL service; never connects to production.
const source = new URL(process.env.DIRECT_URL ?? 'postgresql://invalid/invalid');
if (
  process.platform !== 'linux' ||
  !['bunshin_platform_test', 'bunshin_release_psql_test'].includes(source.pathname.slice(1)) ||
  !['localhost', '127.0.0.1', 'postgres', 'release-postgres'].includes(source.hostname)
) {
  throw new Error('TLS tests require a disposable allowlisted local PostgreSQL database on Linux');
}
const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const wrapper = fileURLToPath(new URL('./release-prisma-command.mjs', import.meta.url));
const readiness = fileURLToPath(new URL('./assert-schema-ready.mjs', import.meta.url));
const authentication = fileURLToPath(new URL('./probe-release-auth-client.mjs', import.meta.url));

test('verified TLS for psql, Prisma CLI, readiness and READ ONLY authentication Clients', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'bunshin-release-tls-'));
  const sockets = new Set();
  let server;
  const execute = (command, args, env = process.env, input) =>
    runMigrationProcess(command, args, {
      cwd: pathToFileURL(directory + '/'),
      env,
      input,
      captureOutput: true,
      timeoutMs: 20000,
    });
  const key = join(directory, 'server.key');
  const ca = join(directory, 'root.crt');
  const certificate = join(directory, 'server.crt');
  const schema = join(directory, 'schema.prisma');
  const generate = async (args) => {
    const result = await execute('openssl', args);
    assert.equal(result.status, 0, result.diagnostic);
  };
  try {
    await generate([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=Disposable Release Root',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
      '-keyout',
      join(directory, 'root.key'),
      '-out',
      ca,
    ]);
    await generate([
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=localhost',
      '-keyout',
      key,
      '-out',
      join(directory, 'server.csr'),
    ]);
    writeFileSync(
      join(directory, 'extensions'),
      'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n',
    );
    await generate([
      'x509',
      '-req',
      '-in',
      join(directory, 'server.csr'),
      '-CA',
      ca,
      '-CAkey',
      join(directory, 'root.key'),
      '-CAcreateserial',
      '-days',
      '1',
      '-extfile',
      join(directory, 'extensions'),
      '-out',
      certificate,
    ]);
    await generate([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=Wrong Disposable Root',
      '-keyout',
      join(directory, 'wrong.key'),
      '-out',
      join(directory, 'wrong.crt'),
    ]);
    writeFileSync(
      schema,
      'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\n',
    );
    const context = createSecureContext({
      key: readFileSync(key),
      cert: readFileSync(certificate),
    });
    const track = (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => socket.destroy());
      return socket;
    };
    server = createServer((raw) => {
      track(raw);
      const negotiate = (bytes) => {
        if (bytes.length !== 8) return raw.destroy();
        if (bytes.readUInt32BE(4) === 80877104) {
          // PostgreSQL GSSENCRequest: not supported here.
          raw.write('N');
          raw.once('data', negotiate);
          return;
        }
        if (bytes.readUInt32BE(4) !== 80877103) return raw.destroy();
        raw.write('S'); // PostgreSQL SSLRequest accepted before wrapping the same socket.
        const secure = track(new TLSSocket(raw, { isServer: true, secureContext: context }));
        secure.once('secure', () => {
          const backend = track(
            connect({ host: source.hostname, port: Number(source.port || 5432) }),
          );
          secure.pipe(backend).pipe(secure);
          secure.once('close', () => backend.destroy());
          backend.once('close', () => secure.destroy());
        });
      };
      raw.once('data', negotiate);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = new URL(source);
    url.hostname = 'localhost';
    url.port = String(server.address().port);
    url.search = '';
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set('sslcert', ca);
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('connection_limit', '1');
    const probePrisma = (connection) =>
      execute(process.execPath, [wrapper, 'probe', process.execPath, cli, schema], {
        ...process.env,
        DATABASE_URL: connection.toString(),
        DIRECT_URL: connection.toString(),
      });
    const probeReadiness = (connection) =>
      execute(process.execPath, [readiness], {
        ...process.env,
        DATABASE_URL: connection.toString(),
        DIRECT_URL: connection.toString(),
      });
    const probeAuthentication = (connection) => {
      const database = new URL(connection);
      // The disposable PostgreSQL service also has its standard postgres DB.
      // The auth child checks only that identity and READ ONLY, not app tables.
      database.pathname = '/postgres';
      return execute(process.execPath, [authentication], {
        ...process.env,
        DATABASE_URL: database.toString(),
        DIRECT_URL: database.toString(),
      });
    };
    const probeNative = (connection) => {
      const native = new URL(connection);
      native.searchParams.set('sslmode', 'verify-full');
      if (connection.searchParams.has('sslcert'))
        native.searchParams.set('sslrootcert', connection.searchParams.get('sslcert'));
      return execute(
        'psql',
        psqlArguments,
        psqlEnvironment(native.toString(), process.env),
        'BEGIN READ ONLY; SELECT 1; COMMIT;',
      );
    };
    await t.test('all clients accept the trusted CA and matching hostname', async () => {
      const prisma = await probePrisma(url);
      assert.equal(prisma.status, 0, prisma.diagnostic);
      assert.equal(prisma.capturedOutput, ''); // CLI chatter is not forwarded.
      const native = await probeNative(url);
      assert.equal(native.status, 0, native.diagnostic);
      assert.equal(native.capturedOutput.trim(), '1');
      const gate = await probeReadiness(url);
      assert.equal(gate.status, 0, gate.diagnostic);
      assert.match(gate.capturedOutput, /Database schema readiness gate passed\./);
      const auth = await probeAuthentication(url);
      assert.equal(auth.status, 0, auth.diagnostic);
      assert.equal(auth.capturedOutput.trim(), 'RELEASE_AUTH_CONNECTION_VERIFIED');
    });
    for (const mode of ['missing-ca', 'wrong-ca', 'wrong-hostname']) {
      await t.test(
        `all clients reject ${mode} and the Prisma wrapper emits no raw credentials or SQL`,
        async () => {
          const invalid = new URL(url);
          if (mode === 'missing-ca') invalid.searchParams.delete('sslcert');
          if (mode === 'wrong-ca')
            invalid.searchParams.set('sslcert', join(directory, 'wrong.crt'));
          if (mode === 'wrong-hostname') invalid.hostname = '127.0.0.1';
          const prisma = await probePrisma(invalid);
          assert.equal(prisma.status, 1);
          assert.deepEqual(readReleasePrismaDiagnostic(prisma.capturedOutput), {
            phase: 'probe',
            diagnostic: 'database-tls-failure',
          });
          assert.equal(
            prisma.capturedOutput.trim(),
            'RELEASE_PRISMA_PROBE_FAILED:database-tls-failure',
          );
          assert.notEqual((await probeNative(invalid)).status, 0);
          assert.notEqual((await probeReadiness(invalid)).status, 0);
          const auth = await probeAuthentication(invalid);
          assert.notEqual(auth.status, 0);
          assert.ok(readReleasePrismaDiagnostic(auth.capturedOutput));
          assert.equal(auth.capturedOutput.includes('postgresql://'), false);
        },
      );
    }
  } finally {
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
