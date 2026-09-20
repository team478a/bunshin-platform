import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260920150000_add_commercial_pricing_schedules/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('commercial pricing schedule schema', () => {
  it('versions future pricing by a unique effective month', () => {
    expect(migration).toContain('CREATE TABLE "commercial_pricing_schedules"');
    expect(migration).toContain('commercial_pricing_schedules_version_key');
    expect(migration).toContain('commercial_pricing_schedules_effective_from_key');
    expect(migration).toContain(
      'ALTER TABLE "commercial_pricing_schedules" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain('"tiers" JSONB NOT NULL');
  });
});
