import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260917110000_drop_fortune_legacy_membership_columns/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('fortune legacy membership cleanup migration', () => {
  it('removes the obsolete Fortune notification and withdrawal fields', () => {
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "fortune_participants_service_setting_id_withdrawn_at_idx"',
    );
    expect(migration).toContain('DROP COLUMN IF EXISTS "notification_enabled"');
    expect(migration).toContain('DROP COLUMN IF EXISTS "withdrawn_at"');
  });
});
