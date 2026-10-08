import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'vitest';
import { LATEST_DATABASE_MIGRATION } from '../src/schema-readiness';

const root = new URL('../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

test('scoped learning release does not include the OEM billing migrations or models', () => {
  for (const migration of [
    '20261007170000_add_oem_registration_billing',
    '20261007173000_oem_billing_guardrails',
  ]) {
    assert.equal(
      existsSync(new URL(`packages/database/prisma/migrations/${migration}`, root)),
      false,
    );
  }
  assert.doesNotMatch(
    read('packages/database/prisma/schema.prisma'),
    /model OemBillingPolicy\s*\{/,
  );
});

test('learning LINE migration only permits nullable short-lived Bunshin references', () => {
  const statements = read(
    'packages/database/prisma/migrations/20261008140000_learning_member_line_link/migration.sql',
  )
    .replace(/--[^\n]*/g, '')
    .trim();
  assert.equal(
    statements,
    'ALTER TABLE "service_line_link_attempts" ALTER COLUMN "bunshin_id" DROP NOT NULL;',
  );
});

test('readiness requires the latest migration that is actually included in this release', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', root), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.equal(LATEST_DATABASE_MIGRATION, '20261008140000_learning_member_line_link');
  assert.equal(migrations.at(-1), LATEST_DATABASE_MIGRATION);
});

test('internal-owner release exposes only the learner authority, not the main-only OEM services', () => {
  const source = read('packages/database/src/index.ts');
  assert.match(
    source,
    /export \{ requireTrainingLearnerRole \} from '\.\/personal-learning-pilot-seat'/,
  );
  assert.doesNotMatch(source, /PrismaOemBillingAdminService|PrismaCommercialPricingAdminService/);
  for (const file of ['oem-billing-admin.ts', 'commercial-pricing-admin.ts'])
    assert.equal(existsSync(new URL(`packages/database/src/${file}`, root)), false);
});

test('internal-owner authority retains the dedicated contract and live INTERNAL seat gate', () => {
  const source = read('packages/database/src/personal-learning-pilot-seat.ts');
  assert.match(source, /personalLearningPilotAllows\(/);
  assert.match(source, /if \(required \|\| owner\) throw/);
  assert.match(source, /seat\.kind !== 'INTERNAL' \|\| seat\.cohort !== 'INTERNAL'/);
  assert.match(source, /revoked_at IS NULL FOR SHARE/);
  assert.match(source, /await requirePersonalLearningPilotSeat\(tx, scope, true\)/);
});
