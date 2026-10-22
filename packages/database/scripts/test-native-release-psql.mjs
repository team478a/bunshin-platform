import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runMigrationProcess } from './migration-process.mjs';
import {
  buildPsqlReleaseScript,
  loadReleaseMigrations,
  psqlArguments,
  psqlEnvironment,
} from './release-psql.mjs';

const requireModule = createRequire(import.meta.url);
const cli = requireModule.resolve('prisma/build/index.js');
const source = new URL(process.env.DIRECT_URL ?? 'postgresql://invalid/invalid');
if (
  !['bunshin_platform_test', 'bunshin_release_psql_test'].includes(source.pathname.slice(1)) ||
  !['localhost', '127.0.0.1', 'postgres', 'release-postgres'].includes(source.hostname)
) {
  throw new Error(
    'Native release tests require an explicitly allowlisted disposable local database',
  );
}
// Only after the disposable-target guard: the CI PostgreSQL service has no TLS.
// The production entry point separately requires TLS and never calls this file.
source.searchParams.set('sslmode', 'disable');
const names = [
  '20261001000000_baseline',
  '20261002000000_first',
  '20261003000000_second',
  '20261004000000_third',
];

async function fixture(overrides = {}) {
  const migrationNames = overrides.names ?? names;
  const schema = 'release_test_' + randomUUID().replaceAll('-', '');
  const directory = mkdtempSync(join(tmpdir(), 'bunshin-native-release-'));
  const migrationsDirectory = join(directory, 'migrations');
  const schemaPath = join(directory, 'schema.prisma');
  const sql = [
    overrides.baseline ?? 'CREATE TABLE baseline (id integer PRIMARY KEY);',
    overrides.first ?? 'CREATE TABLE first_item (id integer PRIMARY KEY);',
    overrides.second ?? 'CREATE TABLE second_item (id integer PRIMARY KEY);',
    overrides.third ?? 'CREATE TABLE third_item (id integer PRIMARY KEY);',
  ];
  migrationNames.forEach((name, index) => {
    mkdirSync(join(migrationsDirectory, name), { recursive: true });
    writeFileSync(join(migrationsDirectory, name, 'migration.sql'), sql[index]);
  });
  writeFileSync(join(migrationsDirectory, 'migration_lock.toml'), 'provider = "postgresql"\n');
  writeFileSync(
    schemaPath,
    'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\n',
  );
  const url = new URL(source);
  url.searchParams.set('schema', schema);
  const environment = psqlEnvironment(url.toString(), {
    ...process.env,
    DATABASE_URL: url.toString(),
    DIRECT_URL: url.toString(),
  });
  const query = (input) =>
    runMigrationProcess('psql', psqlArguments, {
      cwd: pathToFileURL(directory + '/'),
      env: environment,
      input,
      captureOutput: true,
      timeoutMs: 15000,
    });
  const setup = await query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"; ${sql[0]}`);
  assert.equal(setup.status, 0, setup.diagnostic);
  const baseline = await runMigrationProcess(
    process.execPath,
    [cli, 'migrate', 'resolve', '--applied', migrationNames[0], '--schema', schemaPath],
    {
      cwd: pathToFileURL(directory + '/'),
      env: environment,
      timeoutMs: 30000,
    },
  );
  assert.equal(baseline.status, 0, baseline.diagnostic);
  const config = {
    migrations: loadReleaseMigrations(pathToFileURL(migrationsDirectory + '/')),
    approvedNames: migrationNames.slice(1),
    bounds: { lockTimeoutMs: 100, statementTimeoutMs: 1000, processTimeoutMs: 20000 },
    resolveExecutable: process.execPath,
    prismaCli: cli,
    schemaPath,
    schema,
    database: source.pathname.slice(1),
    user: decodeURIComponent(source.username),
    preconditionSql: `DO $pristine$ BEGIN IF to_regclass('${schema}.first_item') IS NOT NULL
      THEN RAISE EXCEPTION 'RELEASE_EXISTING_ARTIFACTS_REQUIRE_REVIEW'; END IF; END $pristine$;`,
  };
  const failureCli = join(directory, 'history-failure.sh');
  writeFileSync(
    failureCli,
    `if [ "$1" = "migrate" ]; then exit 1; fi\nexec '${process.execPath}' '${cli}' "$@"\n`,
  );
  return {
    schema,
    environment,
    config,
    failureCli,
    run: (mode = 'apply', changes = {}, timeoutMs = 30000) =>
      runMigrationProcess('psql', psqlArguments, {
        cwd: pathToFileURL(directory + '/'),
        env: environment,
        input: buildPsqlReleaseScript({ ...config, mode, ...changes }),
        captureOutput: true,
        timeoutMs,
      }),
    query: async (input) => {
      const result = await query(`SET search_path TO "${schema}"; ${input}`);
      assert.equal(result.status, 0, result.diagnostic);
      return result.capturedOutput.trim();
    },
    cleanup: async () => {
      const removed = await query(`DROP SCHEMA "${schema}" CASCADE;`);
      assert.equal(removed.status, 0, removed.diagnostic);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

async function withFixture(options, work) {
  const value = await fixture(options);
  try {
    await work(value);
  } finally {
    await value.cleanup();
  }
}

async function hold(fixture, sql) {
  const child = spawn('psql', psqlArguments, {
    env: fixture.environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Synthetic holder did not become ready'));
    }, 10000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('HOLDER_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.resume();
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Synthetic holder failed'));
    });
    child.once('close', () => {
      clearTimeout(timer);
      reject(new Error('Synthetic holder exited'));
    });
    child.stdin.write(`SET search_path TO "${fixture.schema}"; ${sql}\n\\echo HOLDER_READY\n`);
  });
  return () =>
    new Promise((resolve) => {
      child.once('close', resolve);
      child.stdin.end('\\q\n');
    });
}

test('native psql release against real PostgreSQL and Prisma 6', async (t) => {
  await t.test(
    'the observed historical checksums reject divergent main and accept the restored sources without history writes',
    () =>
      withFixture({}, async (f) => {
        // Metadata replay only, in the disposable schema guarded above. This is
        // not a production DDL/schema replay or a production history repair.
        const evidence = JSON.parse(
          readFileSync(
            new URL(
              '../test/fixtures/production-migration-checksums-20261022.json',
              import.meta.url,
            ),
            'utf8',
          ),
        );
        // Freeze this replay at the release boundary. Future migrations are not
        // part of the 260-row historical snapshot and must not change its fixture.
        const migrations = loadReleaseMigrations(
          new URL('../prisma/migrations/', import.meta.url),
        ).filter((migration) => migration.name <= '20261020120000_ops_morning_digest_runs');
        const approvedNames = [
          '20261019120000_learning_provider_abstraction',
          '20261020100000_personal_learning_tool_feature_updates',
          '20261020120000_ops_morning_digest_runs',
        ];
        const historical = migrations.filter(
          (migration) => !approvedNames.includes(migration.name),
        );
        assert.equal(historical.length, 260);
        const values = historical.map((migration) => {
          const checksum =
            evidence.records.find((record) => record.name === migration.name)?.observedChecksum ??
            migration.checksum;
          return `('${randomUUID()}','${migration.name}','${checksum}',now())`;
        });
        await f.query(`DELETE FROM _prisma_migrations;
          INSERT INTO _prisma_migrations(id,migration_name,checksum,finished_at) VALUES ${values.join(',')};`);
        const history = () =>
          f.query(
            'SELECT md5(json_agg(row_to_json(m) ORDER BY migration_name)::text) FROM _prisma_migrations m;',
          );
        const before = await history();
        const divergent = migrations.map((migration) => {
          const previous = evidence.records.find((record) => record.name === migration.name);
          return previous
            ? {
                ...migration,
                checksum: previous.preRestorationChecksum,
                compatibleChecksums: [previous.preRestorationChecksum],
              }
            : migration;
        });
        const rejected = await f.run('preview', { migrations: divergent, approvedNames });
        assert.equal(rejected.diagnostic, 'release-checksum-mismatch');
        const restored = await f.run('preview', { migrations, approvedNames });
        assert.equal(restored.status, 0, restored.diagnostic);
        assert.match(restored.capturedOutput, /RELEASE_PSQL_PREVIEW_VERIFIED/);
        assert.equal(await history(), before);
        assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
        const changed = migrations.map((migration) =>
          migration.name === evidence.records[0].name
            ? { ...migration, checksum: '0'.repeat(64), compatibleChecksums: ['0'.repeat(64)] }
            : migration,
        );
        assert.equal(
          (await f.run('preview', { migrations: changed, approvedNames })).diagnostic,
          'release-checksum-mismatch',
        );
        assert.equal(await history(), before);
      }),
  );
  await t.test(
    'applies the three actual release SQL files unchanged and records their exact checksums',
    async () => {
      const approved = [
        '20261019120000_learning_provider_abstraction',
        '20261020100000_personal_learning_tool_feature_updates',
        '20261020120000_ops_morning_digest_runs',
      ];
      const actual = approved.map((name) =>
        readFileSync(
          new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
      await withFixture(
        {
          names: [names[0], ...approved],
          baseline: `CREATE TYPE "AiProviderKey" AS ENUM ('OPENAI');
        CREATE TABLE ai_provider_configurations(provider "AiProviderKey", model text);
        INSERT INTO ai_provider_configurations VALUES ('OPENAI','synthetic');
        CREATE TABLE users(id uuid PRIMARY KEY);`,
          first: actual[0],
          second: actual[1],
          third: actual[2],
        },
        async (f) => {
          const result = await f.run();
          assert.equal(result.status, 0, result.diagnostic);
          assert.equal(
            await f.query('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;'),
            '4',
          );
          assert.equal(
            await f.query(
              "SELECT model_capabilities = ARRAY['STRUCTURED_OUTPUT','IMAGE_INPUT','LONG_CONTEXT']::text[] FROM ai_provider_configurations;",
            ),
            't',
          );
          assert.equal(
            await f.query(
              "SELECT to_regclass('personal_learning_tool_feature_updates') IS NOT NULL AND to_regclass('ops_morning_digest_runs') IS NOT NULL;",
            ),
            't',
          );
        },
      );
    },
  );
  await t.test('Preview sets/verifies session limits and makes no schema or history changes', () =>
    withFixture({}, async (f) => {
      const result = await f.run('preview');
      assert.equal(result.status, 0, result.diagnostic);
      assert.match(result.capturedOutput, /RELEASE_PSQL_PREVIEW_VERIFIED/);
      assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
      assert.equal(await f.query('SELECT count(*) FROM _prisma_migrations;'), '1');
    }),
  );
  await t.test(
    'commits all original SQL and records matching checksums using actual Prisma resolve; rerun is no-op',
    () =>
      withFixture({}, async (f) => {
        const result = await f.run();
        assert.equal(result.status, 0, result.diagnostic);
        assert.match(result.capturedOutput, /RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED/);
        assert.equal(
          await f.query('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;'),
          '4',
        );
        await f.query('INSERT INTO first_item VALUES (7);');
        assert.equal((await f.run()).status, 0);
        assert.equal(await f.query('SELECT id FROM first_item;'), '7');
      }),
  );
  await t.test('checksum drift stops before applying SQL', () =>
    withFixture({}, async (f) => {
      await f.query("UPDATE _prisma_migrations SET checksum = repeat('0',64);");
      const result = await f.run();
      assert.equal(result.diagnostic, 'release-checksum-mismatch');
      assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
    }),
  );
  await t.test('Prisma-compatible LF/CRLF checksums are accepted without changing history', () =>
    withFixture(
      { baseline: 'CREATE TABLE baseline (\n id integer PRIMARY KEY\n);\n' },
      async (f) => {
        const alternate = f.config.migrations[0].compatibleChecksums.find(
          (hash) => hash !== f.config.migrations[0].checksum,
        );
        assert.ok(alternate);
        await f.query(`UPDATE _prisma_migrations SET checksum = '${alternate}';`);
        assert.equal((await f.run('preview')).status, 0);
        assert.equal(await f.query('SELECT checksum FROM _prisma_migrations;'), alternate);
      },
    ),
  );
  await t.test('a failed metadata connection is caught by Preview before any DDL', () =>
    withFixture({}, async (f) => {
      const result = await f.run('preview', { resolveExecutable: '/bin/false' });
      assert.equal(
        result.diagnostic,
        'release-metadata-connection-failed',
        JSON.stringify({ reason: result.reason, status: result.status }),
      );
      assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
    }),
  );
  await t.test('unexpected pending set stops before applying SQL', () =>
    withFixture({}, async (f) => {
      const result = await f.run('apply', { approvedNames: names.slice(1, 3) });
      assert.equal(result.diagnostic, 'release-pending-set-mismatch');
      assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
    }),
  );
  await t.test(
    'a slow statement rolls back only its migration and preserves earlier applied history',
    () =>
      withFixture(
        { second: 'CREATE TABLE second_item(id integer); SELECT pg_sleep(3);' },
        async (f) => {
          const result = await f.run();
          assert.equal(result.diagnostic, 'database-statement-timeout');
          assert.equal(
            await f.query(
              "SELECT to_regclass('first_item') IS NOT NULL AND to_regclass('second_item') IS NULL AND to_regclass('third_item') IS NULL;",
            ),
            't',
          );
          assert.equal(await f.query('SELECT count(*) FROM _prisma_migrations;'), '2');
        },
      ),
  );
  await t.test('lock timeout aborts DDL without changing its transaction', () =>
    withFixture(
      {
        first: 'LOCK TABLE baseline IN ACCESS EXCLUSIVE MODE; CREATE TABLE first_item(id integer);',
      },
      async (f) => {
        const release = await hold(f, 'BEGIN; LOCK TABLE baseline IN ACCESS SHARE MODE;');
        try {
          const result = await f.run();
          assert.equal(result.diagnostic, 'database-lock-timeout');
          assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
        } finally {
          await release();
        }
      },
    ),
  );
  await t.test('the migration advisory lock excludes concurrent apply and resolve', () =>
    withFixture({}, async (f) => {
      const release = await hold(f, 'SELECT pg_advisory_lock(72707369);');
      try {
        assert.equal((await f.run()).diagnostic, 'release-lock-busy');
      } finally {
        await release();
      }
    }),
  );
  await t.test(
    'history failure never runs a later migration and a subsequent run refuses the existing unrecorded artifact',
    () =>
      withFixture({}, async (f) => {
        assert.equal(
          (await f.run('apply', { resolveExecutable: '/bin/sh', prismaCli: f.failureCli }))
            .diagnostic,
          'release-sql-committed-history-unconfirmed',
        );
        assert.equal(
          await f.query(
            "SELECT to_regclass('first_item') IS NOT NULL AND to_regclass('second_item') IS NULL;",
          ),
          't',
        );
        assert.equal(await f.query('SELECT count(*) FROM _prisma_migrations;'), '1');
        assert.equal((await f.run()).diagnostic, 'release-existing-artifacts-require-review');
      }),
  );
  await t.test(
    'process deadline stops the transaction; no subsequent SQL or history is applied',
    () =>
      withFixture(
        { first: 'CREATE TABLE first_item(id integer); SELECT pg_sleep(30);' },
        async (f) => {
          const probeCli = join(f.config.schemaPath, '..', 'deadline-probe.mjs');
          // Consume the complete read-only probe input. An immediate /bin/true
          // exit may close stdin early, which the wrapper correctly rejects.
          writeFileSync(probeCli, 'process.stdin.resume();\n');
          const result = await f.run(
            'apply',
            {
              // Isolate the deadline from Prisma process startup latency; the
              // real metadata connection is covered by the other cases.
              prismaCli: probeCli,
              bounds: { lockTimeoutMs: 100, statementTimeoutMs: 1500, processTimeoutMs: 10000 },
            },
            1000,
          );
          assert.equal(result.reason, 'DEADLINE_EXCEEDED');
          assert.match(result.capturedOutput, /RELEASE_PSQL_PREFLIGHT_VERIFIED/);
          assert.equal(await f.query("SELECT to_regclass('first_item') IS NULL;"), 't');
          assert.equal(await f.query('SELECT count(*) FROM _prisma_migrations;'), '1');
        },
      ),
  );
});
