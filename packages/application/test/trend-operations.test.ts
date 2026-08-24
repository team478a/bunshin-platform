import { describe, expect, it, vi } from 'vitest';
import {
  GetTrendOperationsSnapshot,
  type TrendOperationsRepository,
  type TrendOperationsSnapshot,
} from '../src';

const snapshot: TrendOperationsSnapshot = {
  period: { from: new Date('2026-08-01'), to: new Date('2026-09-01') },
  research: { total: 1, completed: 1, failed: 0, expired: 0, failureCategories: [] },
  candidates: { total: 3, safe: 3, selected: 1, averageFreshnessScore: 80 },
  missions: { attributed: 1, accepted: 1, rejected: 0, copied: 1, posted: 1 },
  evidence: { total: 2, available: 2, expired: 0 },
  providers: [{ providerKey: 'EXA', runs: 1, failed: 0 }],
  cost: { measuredUsdMicros: null, unpricedRuns: 1, benchmarkAverageUsdMicros: 1000 },
};

describe('trend operations snapshot', () => {
  it('returns a metadata-only admin snapshot', async () => {
    const repository = {
      snapshot: vi.fn().mockResolvedValue(snapshot),
    } satisfies TrendOperationsRepository;
    await expect(
      new GetTrendOperationsSnapshot(repository).execute({
        actorUserId: 'admin-a',
        environment: 'PRODUCTION',
        from: new Date('2026-08-01'),
        to: new Date('2026-09-01'),
      }),
    ).resolves.toEqual(snapshot);
  });

  it('rejects invalid and overlong periods before reading data', async () => {
    const repository = { snapshot: vi.fn() } satisfies TrendOperationsRepository;
    await expect(
      new GetTrendOperationsSnapshot(repository).execute({
        actorUserId: 'admin-a',
        environment: 'PRODUCTION',
        from: new Date('2026-09-01'),
        to: new Date('2026-08-01'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.snapshot).not.toHaveBeenCalled();
  });

  it('hides the page when the repository denies admin access', async () => {
    const repository = {
      snapshot: vi.fn().mockResolvedValue(null),
    } satisfies TrendOperationsRepository;
    await expect(
      new GetTrendOperationsSnapshot(repository).execute({
        actorUserId: 'user-a',
        environment: 'PRODUCTION',
        from: new Date('2026-08-01'),
        to: new Date('2026-09-01'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
