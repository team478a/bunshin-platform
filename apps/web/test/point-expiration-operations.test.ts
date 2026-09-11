import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const operations = readFileSync(
  fileURLToPath(new URL('../src/http/point-redemption-operations.ts', import.meta.url)),
  'utf8',
);
const vercel = readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8');

describe('point expiration operations', () => {
  it('runs reservation release and grant expiration behind the protected cron endpoint', () => {
    expect(operations).toContain('authorizeCronRequest');
    expect(operations).toContain('ReleaseExpiredPointReservations');
    expect(operations).toContain('ExpireAvailablePointGrants');
    expect(operations).toContain('PrismaPointExpirationRepository');
    expect(vercel).toContain('/api/internal/points/release-expired');
  });
});
