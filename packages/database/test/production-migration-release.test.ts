import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');
const configuration = JSON.parse(read('apps/web/vercel.json')) as {
  buildCommand: string;
  ignoreCommand: string;
  git: { deploymentEnabled: Record<string, boolean> };
  framework: string;
  regions: string[];
  crons: { path: string; schedule: string }[];
};

test('production release runs bounded migrations before readiness and forced Web build', () => {
  assert.equal(
    configuration.buildCommand,
    'cd ../.. && pnpm db:migrate:vercel && pnpm db:assert-ready && pnpm turbo run build --filter=web --force',
  );
  const migration = configuration.buildCommand.indexOf('db:migrate:vercel');
  const readiness = configuration.buildCommand.indexOf('db:assert-ready');
  const build = configuration.buildCommand.indexOf('turbo run build');
  assert.ok(migration >= 0 && migration < readiness && readiness < build);
});

test('release cannot be skipped and remains production-only', () => {
  // Vercel ignoreCommand exit 1 means continue the build.
  assert.equal(configuration.ignoreCommand, 'exit 1');
  assert.deepEqual(configuration.git.deploymentEnabled, { '**': false, production: true });
  assert.equal(configuration.framework, 'nextjs');
  assert.deepEqual(configuration.regions, ['hnd1']);
  assert.equal(configuration.crons.length, 15);
});

test('migration runner pins the audited release and fails closed', () => {
  const source = read('packages/database/scripts/deploy-migrations-for-vercel.mjs');
  assert.match(source, /MIGRATION_LOCK_TIMEOUT_MS/);
  assert.match(source, /MIGRATION_STATEMENT_TIMEOUT_MS/);
  assert.match(source, /MIGRATION_PROCESS_TIMEOUT_MS/);
  assert.match(source, /assertReleaseMigrationGuard/);
  assert.match(source, /UNEXPECTED_PRE_MIGRATION_HISTORY/);
  assert.match(source, /TARGET_MIGRATION_PREFLIGHT_CHANGED/);
  assert.match(source, /'migrate', 'deploy'/);
  assert.match(source, /do not retry automatically/);
  const migration = read(
    'packages/database/prisma/migrations/20261010070000_personal_learning_call_cost_reservation/migration.sql',
  );
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^SET LOCAL lock_timeout = '5s';/m);
  assert.match(migration, /^SET LOCAL statement_timeout = '60s';/m);
  assert.match(migration, /^SET LOCAL idle_in_transaction_session_timeout = '60s';/m);
  assert.match(migration, /^COMMIT;/m);
});

test('schema readiness remains a separate read-only fail-closed gate', () => {
  const source = read('packages/database/scripts/assert-schema-ready.mjs');
  assert.match(source, /SELECT EXISTS/);
  assert.match(source, /finished_at/);
  assert.match(source, /rolled_back_at/);
  assert.match(source, /rows\[0\]\?\.applied !== true/);
  assert.doesNotMatch(source, /migrate deploy|\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
});

test('package build hooks do not apply schema changes implicitly', () => {
  const database = JSON.parse(read('packages/database/package.json')) as {
    scripts: { build: string; 'db:assert-ready': string };
  };
  const web = JSON.parse(read('apps/web/package.json')) as {
    scripts: { prebuild: string; build: string };
  };
  assert.equal(database.scripts.build, 'prisma generate && tsc -p tsconfig.build.json');
  assert.equal(
    database.scripts['db:assert-ready'],
    'prisma generate && node scripts/assert-schema-ready.mjs',
  );
  assert.equal(web.scripts.prebuild, 'pnpm --filter @bunshin/database db:generate');
  assert.equal(web.scripts.build, 'next build');
});
