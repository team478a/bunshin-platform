import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829110000_add_badge_line_notification_core/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const repository = readFileSync(
  fileURLToPath(new URL('../src/badge-line-notification.ts', import.meta.url)),
  'utf8',
);

describe('badge LINE notification isolation', () => {
  it('keeps one environment-specific delivery per award notification', () => {
    expect(migration).toContain('environment_badge_notification_id_key');
    expect(migration).toContain('environment_idempotency_key_key');
    expect(repository).toContain('skipDuplicates: true');
  });

  it('requires every pilot and consent gate before queueing', () => {
    expect(repository).toContain('pilotEnabled');
    expect(repository).toContain("routing.mode === 'DISABLED'");
    expect(repository).toContain("status: 'ACTIVE'");
    expect(repository).toContain("friendshipStatus !== 'FOLLOWING'");
    expect(repository).toContain('notificationConsentAt');
    expect(repository).toContain('consentedAt: { not: null }');
  });
});
