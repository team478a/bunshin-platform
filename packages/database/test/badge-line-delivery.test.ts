import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('badge LINE delivery persistence', () => {
  it('keeps delivery claims environment scoped and rechecks all consent gates', () => {
    const source = readFileSync(
      new URL('../src/badge-line-notification.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain("status: 'PROCESSING'");
    expect(source).toContain('leaseExpiresAt');
    expect(source).toContain('routing?.pilotEnabled');
    expect(source).toContain("connection.friendshipStatus === 'FOLLOWING'");
    expect(source).toContain('notificationConsentAt');
  });
});
