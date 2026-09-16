import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260917090000_add_fortune_package_entitlement/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('fortune package organization entitlement', () => {
  it('defaults new package sales to disabled until a system administrator enables them', () => {
    expect(schema).toMatch(
      /fortunePackageEnabled\s+Boolean\s+@default\(false\)\s+@map\("fortune_package_enabled"\)/,
    );
    expect(migration).toContain(
      'ADD COLUMN "fortune_package_enabled" BOOLEAN NOT NULL DEFAULT false',
    );
  });
});
