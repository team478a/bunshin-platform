import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ purge: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: { marker: 'database-client' },
  purgeExpiredFortuneReadings: fake.purge,
}));

import { runExpiredFortuneReadingPurge } from '../src/http/fortune-lifecycle-operations';

describe('fortune lifecycle operations', () => {
  it('reports the number of expired readings removed by the database boundary', async () => {
    const now = new Date('2026-09-17T00:00:00.000Z');
    fake.purge.mockResolvedValue(12);

    await expect(runExpiredFortuneReadingPurge(now)).resolves.toEqual({ deleted: 12 });
    expect(fake.purge).toHaveBeenCalledWith({ marker: 'database-client' }, now);
  });

  it('runs physical deletion only from the protected production cron', () => {
    const operations = readFileSync(
      fileURLToPath(new URL('../src/http/fortune-lifecycle-operations.ts', import.meta.url)),
      'utf8',
    );
    const vercel = readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8');

    expect(operations).toContain('authorizeCronRequest(request, environment.CRON_SECRET)');
    expect(operations).toContain("environment.APP_ENV !== 'production'");
    expect(vercel).toContain('/api/internal/fortune/purge-expired');
  });
});
