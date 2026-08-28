import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829020000_seed_point_activity_rules/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('initial point activity rules', () => {
  it('starts only the reviewed viewed, posted and weekly rules', () => {
    expect(migration).toContain("'MISSION_VIEWED_DAILY', 1, 'ACTIVE', 1");
    expect(migration).toContain("'POSTED_DAILY', 1, 'ACTIVE', 5");
    expect(migration).toContain("'POSTED_WEEKLY_3', 1, 'ACTIVE', 10");
    expect(migration).not.toContain('LOGIN');
  });

  it('uses stable identifiers so migration re-application cannot duplicate rules', () => {
    expect(migration).toContain('ON CONFLICT ("id") DO NOTHING');
  });
});
