import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { purgeExpiredFortuneReadings } from '../src/fortune';

describe('fortune reading retention purge', () => {
  it('deletes expired readings using each service retention setting', async () => {
    const execute = vi.fn().mockResolvedValue(4);
    const db = { $executeRaw: execute } as unknown as PrismaClient;

    await expect(
      purgeExpiredFortuneReadings(db, new Date('2026-09-16T16:00:00.000Z')),
    ).resolves.toBe(4);

    const query = execute.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join('?')).toContain('DELETE FROM "fortune_readings"');
    expect(query.strings.join('?')).toContain('USING "fortune_service_settings"');
    expect(query.strings.join('?')).toContain('GREATEST(setting."history_retention_days" - 1, 0)');
    expect(query.values).toEqual([new Date('2026-09-17T00:00:00.000Z')]);
  });
});
