import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261012070000_oem_contract_period_supersession/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

describe('OEM contract period correction schema', () => {
  it('keeps corrections append-only through a one-to-one supersession reference', () => {
    expect(migration).toContain('ADD COLUMN "supersedes_id" UUID');
    expect(migration).toContain('CREATE UNIQUE INDEX "oem_contract_periods_supersedes_id_key"');
    expect(migration).toContain('FOREIGN KEY ("supersedes_id")');
    expect(migration).not.toMatch(/DELETE FROM "oem_contract_periods"/);
    expect(schema).toContain('@relation("OemContractPeriodSupersession"');
    expect(schema).toMatch(/supersedesId\s+String\?\s+@unique/);
  });
});
