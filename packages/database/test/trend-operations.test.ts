import { describe, expect, it, vi } from 'vitest';
import { PrismaTrendOperationsRepository } from '../src';

function client(activeAdmin = true) {
  return {
    platformAdmin: { findFirst: vi.fn().mockResolvedValue(activeAdmin ? { id: 'admin-a' } : null) },
    trendResearchRun: {
      findMany: vi.fn().mockResolvedValue([
        { status: 'COMPLETED', providerKey: 'EXA', failureCategory: null },
        { status: 'FAILED', providerKey: 'EXA', failureCategory: 'RATE_LIMITED' },
      ]),
    },
    trendIdeaCandidate: {
      findMany: vi.fn().mockResolvedValue([
        { status: 'SELECTED', safetyStatus: 'SAFE', freshnessScore: 90 },
        { status: 'PROPOSED', safetyStatus: 'SAFE', freshnessScore: 70 },
      ]),
    },
    trendEvidence: {
      findMany: vi.fn().mockResolvedValue([
        { status: 'ACTIVE', expiresAt: new Date('2026-09-15') },
        { status: 'EXPIRED', expiresAt: new Date('2026-08-10') },
      ]),
    },
    missionTrendContext: { count: vi.fn().mockResolvedValue(2) },
    missionDecision: {
      findMany: vi.fn().mockResolvedValue([{ decision: 'ACCEPTED' }, { decision: 'REJECTED' }]),
    },
    missionActivity: { findMany: vi.fn().mockResolvedValue([{ dailyMissionId: 'mission-a' }]) },
    postRecord: { count: vi.fn().mockResolvedValue(1) },
    trendProviderBenchmarkObservation: {
      findMany: vi.fn().mockResolvedValue([{ costUsdMicros: 1000 }, { costUsdMicros: 3000 }]),
    },
  };
}

describe('Prisma trend operations repository', () => {
  it('aggregates metadata without selecting Mission or evidence content', async () => {
    const db = client();
    const result = await new PrismaTrendOperationsRepository(db as never).snapshot({
      actorUserId: 'admin-a',
      environment: 'PRODUCTION',
      from: new Date('2026-08-01'),
      to: new Date('2026-09-01'),
    });
    expect(result).toMatchObject({
      research: { total: 2, completed: 1, failed: 1 },
      candidates: { total: 2, safe: 2, selected: 1, averageFreshnessScore: 80 },
      missions: { attributed: 2, accepted: 1, rejected: 1, copied: 1, posted: 1 },
      evidence: { total: 2, available: 1, expired: 1 },
      providers: [{ providerKey: 'EXA', runs: 2, failed: 1 }],
      cost: { measuredUsdMicros: null, unpricedRuns: 2, benchmarkAverageUsdMicros: 2000 },
    });
    expect(JSON.stringify(db.trendResearchRun.findMany.mock.calls[0]?.[0])).not.toContain('topic');
    expect(JSON.stringify(db.trendEvidence.findMany.mock.calls[0]?.[0])).not.toContain('summary');
    expect(JSON.stringify(db.missionActivity.findMany.mock.calls[0]?.[0])).not.toContain(
      'metadata',
    );
  });

  it('does not query metrics for a non-admin user', async () => {
    const db = client(false);
    await expect(
      new PrismaTrendOperationsRepository(db as never).snapshot({
        actorUserId: 'user-a',
        environment: 'PRODUCTION',
        from: new Date('2026-08-01'),
        to: new Date('2026-09-01'),
      }),
    ).resolves.toBeNull();
    expect(db.trendResearchRun.findMany).not.toHaveBeenCalled();
  });
});
