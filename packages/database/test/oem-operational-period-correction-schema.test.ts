import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261012080000_oem_operational_period_supersession/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

describe('OEM operational period correction schema', () => {
  it('uses append-only one-to-one supersession for offering and registration evidence', () => {
    expect(migration).toContain('oem_registration_periods_supersedes_id_key');
    expect(migration).toContain('oem_offering_periods_supersedes_id_key');
    expect(migration).toContain('oem_registration_supersedes_fk');
    expect(migration).toContain('oem_offering_supersedes_fk');
    expect(migration).not.toMatch(/DELETE FROM "oem_(registration|offering)_periods"/);
    expect(schema).toContain('@relation("OemRegistrationPeriodSupersession"');
    expect(schema).toContain('@relation("OemOfferingPeriodSupersession"');
  });
});
