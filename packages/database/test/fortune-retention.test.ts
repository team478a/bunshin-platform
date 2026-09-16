import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { fortuneReadingRetentionCutoff, PrismaFortuneRepository } from '../src/fortune';

describe('fortune reading retention', () => {
  it('keeps the configured number of Japan calendar dates including today', () => {
    expect(fortuneReadingRetentionCutoff(new Date('2026-09-16T15:30:00.000Z'), 90)).toEqual(
      new Date('2026-06-20T00:00:00.000Z'),
    );
  });

  it('uses the Japan date when UTC is still on the previous date', () => {
    expect(fortuneReadingRetentionCutoff(new Date('2026-09-16T16:00:00.000Z'), 1)).toEqual(
      new Date('2026-09-17T00:00:00.000Z'),
    );
  });

  it('applies the retention boundary when a saved result URL is opened directly', async () => {
    const findReading = vi.fn().mockResolvedValue(null);
    const db = {
      fortuneServiceSetting: {
        findFirst: vi.fn().mockResolvedValue({ id: 'fortune-setting-1', historyRetentionDays: 90 }),
      },
      fortuneReading: { findFirst: findReading },
    } as unknown as PrismaClient;
    const repository = new PrismaFortuneRepository(db, () => new Date('2026-09-16T15:30:00.000Z'));

    await repository.findReading({
      serviceSlug: 'daily-fortune',
      actorUserId: 'user-1',
      readingId: 'reading-1',
    });

    expect(findReading).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'reading-1',
        localDate: { gte: new Date('2026-06-20T00:00:00.000Z') },
      }),
    });
  });
});
