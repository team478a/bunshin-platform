import { describe, expect, it, vi } from 'vitest';
import {
  COMMON_BADGE_CATALOG,
  calculateBadgeStreak,
  EnsureCommonBadgeCatalog,
  MigrateLegacyBadges,
  ProcessCommonBadgeBatch,
  RecalculateCommonBadgesForUser,
  type CommonBadgeProcessorRepository,
} from '../src/badge-common-processor';

const repository = (): CommonBadgeProcessorRepository => ({
  ensureCatalog: vi.fn().mockResolvedValue({ created: 10, existing: 0 }),
  listCandidates: vi.fn().mockResolvedValue([
    {
      workspaceId: 'w',
      userId: 'u',
      sourceBunshinId: 'b',
      eventType: 'POSTED',
      sourceEventId: 'p',
      occurredAt: new Date(),
    },
  ]),
  process: vi.fn().mockResolvedValue('AWARDED'),
  recalculate: vi.fn().mockResolvedValue({ scanned: 2, awarded: 1, progressed: 1 }),
  migrateLegacy: vi.fn().mockResolvedValue({ migrated: 1, skipped: 0 }),
});

describe('common badge processor', () => {
  it('defines only the approved initial ten badges without rewards', () => {
    expect(COMMON_BADGE_CATALOG).toHaveLength(10);
    expect(new Set(COMMON_BADGE_CATALOG.map((item) => item.code)).size).toBe(10);
    expect(COMMON_BADGE_CATALOG.every((item) => item.target > 0)).toBe(true);
  });

  it('ensures the versioned catalog and processes candidates', async () => {
    const repo = repository();
    await expect(
      new EnsureCommonBadgeCatalog(repo).execute({ actorUserId: 'admin-1' }),
    ).resolves.toEqual({
      created: 10,
      existing: 0,
    });
    await expect(new ProcessCommonBadgeBatch(repo).execute()).resolves.toMatchObject({
      scanned: 1,
      AWARDED: 1,
    });
  });

  it('validates operational inputs and delegates legacy migration', async () => {
    const repo = repository();
    await expect(new ProcessCommonBadgeBatch(repo).execute({ limit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      new ProcessCommonBadgeBatch(repo).execute({ timezone: 'invalid/zone' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(new MigrateLegacyBadges(repo).execute()).resolves.toEqual({
      migrated: 1,
      skipped: 0,
    });
  });

  it('counts distinct consecutive local days and Monday-based weeks', () => {
    expect(
      calculateBadgeStreak(
        [
          new Date('2026-08-28T15:30:00Z'),
          new Date('2026-08-29T15:30:00Z'),
          new Date('2026-08-29T23:00:00Z'),
          new Date('2026-08-30T15:30:00Z'),
        ],
        'DAILY',
        'Asia/Tokyo',
      ),
    ).toBe(3);
    expect(
      calculateBadgeStreak(
        [
          new Date('2026-08-03T00:00:00Z'),
          new Date('2026-08-10T00:00:00Z'),
          new Date('2026-08-17T00:00:00Z'),
          new Date('2026-08-24T00:00:00Z'),
        ],
        'WEEKLY',
        'Asia/Tokyo',
      ),
    ).toBe(4);
  });

  it('supports a user-scoped progress rebuild without changing other users', async () => {
    const repo = repository();
    await expect(
      new RecalculateCommonBadgesForUser(repo).execute({ workspaceId: 'w', userId: 'u' }),
    ).resolves.toEqual({ scanned: 2, awarded: 1, progressed: 1 });
    expect(() =>
      new RecalculateCommonBadgesForUser(repo).execute({ workspaceId: '', userId: 'u' }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
