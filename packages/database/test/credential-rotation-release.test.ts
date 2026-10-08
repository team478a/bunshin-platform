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

test('credential-only release checks schema before rebuilding and never invokes migration', () => {
  assert.equal(
    configuration.buildCommand,
    'cd ../.. && pnpm db:assert-ready && pnpm turbo run build --filter=web --force',
  );
  assert.doesNotMatch(configuration.buildCommand, /migrate|db:push|db:seed/);
});

test('credential-only release is not skipped because application source is unchanged', () => {
  // Vercel ignoreCommand exit 1 means continue the build, not build failure.
  assert.equal(configuration.ignoreCommand, 'exit 1');
});

test('production-only Git policy and runtime configuration remain in place', () => {
  assert.deepEqual(configuration.git.deploymentEnabled, { '**': false, production: true });
  assert.equal(configuration.framework, 'nextjs');
  assert.deepEqual(configuration.regions, ['hnd1']);
  assert.equal(configuration.crons.length, 15);
  assert.ok(configuration.crons.some((cron) => cron.path === '/api/internal/jobs/run'));
  assert.ok(configuration.crons.some((cron) => cron.path === '/api/internal/line/monitor'));
});

test('schema readiness retains its read-only fail-closed gate', () => {
  const source = read('packages/database/scripts/assert-schema-ready.mjs');
  assert.match(source, /SELECT EXISTS/);
  assert.match(source, /finished_at/);
  assert.match(source, /rolled_back_at/);
  assert.match(source, /rows\[0\]\?\.applied !== true/);
  assert.doesNotMatch(source, /migrate deploy|\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
});

test('package build hooks generate the client but do not apply schema changes', () => {
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
