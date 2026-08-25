import { describe, expect, it, vi } from 'vitest';
import {
  EnqueueJob,
  ExpireTrendResearchData,
  RunTrendResearchScheduler,
  ScheduleWeeklyTrendResearch,
  type JobRepository,
} from '../src';

const candidate = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  socialProfileId: '11111111-1111-4111-8111-111111111111',
};

describe('Trend research jobs', () => {
  it('enqueues one idempotent weekly job per scoped SocialProfile', async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: 'job-1' });
    const jobs = { enqueue } as unknown as JobRepository;
    const schedule = new ScheduleWeeklyTrendResearch(new EnqueueJob(jobs), {
      validateTrend: vi.fn().mockResolvedValue(true),
    });
    const result = await new RunTrendResearchScheduler(
      {
        listEligible: vi.fn().mockResolvedValue({ candidates: [candidate], truncated: false }),
      },
      schedule,
      () => new Date('2026-08-24T00:00:00.000Z'),
    ).execute('PRODUCTION');
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        jobType: 'TREND_RESEARCH_REFRESH',
        payloadReference: `trend-research:${candidate.socialProfileId}:2026-08-24`,
        idempotencyKey: `trend-research:workspace-1:bunshin-1:${candidate.socialProfileId}:2026-08-24`,
      }),
    );
    expect(result).toMatchObject({ candidates: 1, enqueued: 1, failures: 0 });
  });

  it('skips a revoked scope without enqueueing', async () => {
    const enqueue = vi.fn();
    const result = await new RunTrendResearchScheduler(
      {
        listEligible: vi.fn().mockResolvedValue({ candidates: [candidate], truncated: true }),
      },
      new ScheduleWeeklyTrendResearch(new EnqueueJob({ enqueue } as unknown as JobRepository), {
        validateTrend: vi.fn().mockResolvedValue(false),
      }),
      () => new Date('2026-08-24T00:00:00.000Z'),
    ).execute('STAGING');
    expect(enqueue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: 1, truncated: true });
  });

  it('expires only data returned by the isolated repository', async () => {
    const expire = vi.fn().mockResolvedValue({ runs: 1, evidence: 2, candidates: 3 });
    await expect(
      new ExpireTrendResearchData({ expire }).execute({
        ...candidate,
        at: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ runs: 1, evidence: 2, candidates: 3 });
    expect(expire).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1', bunshinId: 'bunshin-1' }),
    );
  });
});
