import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260916160000_align_fortune_membership/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('fortune membership alignment migration', () => {
  it('moves only active legacy LINE opt-ins to the common preference topic', () => {
    expect(migration).toContain('service_notification_preferences');
    expect(migration).toContain("'FORTUNE_WEEKLY'");
    expect(migration).toContain('participant."notification_enabled" = true');
    expect(migration).toContain('membership."status" = \'ACTIVE\'');
  });

  it('does not overwrite a newer explicit common preference', () => {
    expect(migration).toMatch(/ON CONFLICT[\s\S]+DO NOTHING/);
  });
});
