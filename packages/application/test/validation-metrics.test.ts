import { describe, expect, it } from 'vitest';
import { GetValidationMetrics, type ValidationMetricsRepository } from '../src';

const snapshot = {
  period: { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') },
  funnel: {
    registrations: 1,
    bunshinCreations: 1,
    socialActivations: 1,
    strategyCompletions: 1,
    strategyApprovals: 1,
    firstMissionViews: 1,
    missionAcceptances: 1,
    copies: 1,
    posts: 1,
    d7ActiveUsers: 1,
  },
  outcomes: {
    postedUsers: 1,
    postCount: 3,
    feedbackCount: 1,
    goodFeedbackCount: 1,
    goodFeedbackRate: 1,
    threePostsInFirstSevenDaysUsers: 1,
    eligibleFirstSevenDayUsers: 1,
    threePostsInFirstSevenDaysRate: 1,
    d7EligibleUsers: 1,
    d7ActiveRate: 1,
    aiCalls: 5,
    aiSuccessfulCalls: 4,
    aiFailedCalls: 1,
    aiInputTokens: 1000,
    aiOutputTokens: 500,
    aiPricedCalls: 0,
    aiEstimatedCostUsdMicros: null,
  },
};

describe('GetValidationMetrics', () => {
  it('returns an authorized workspace aggregate', async () => {
    const repository: ValidationMetricsRepository = { summarize: () => Promise.resolve(snapshot) };
    await expect(
      new GetValidationMetrics(repository).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'owner-1',
        ...snapshot.period,
      }),
    ).resolves.toEqual(snapshot);
  });

  it('hides an inaccessible workspace', async () => {
    const repository: ValidationMetricsRepository = { summarize: () => Promise.resolve(null) };
    await expect(
      new GetValidationMetrics(repository).execute({
        workspaceId: 'other-workspace',
        actorUserId: 'owner-1',
        ...snapshot.period,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects reversed and oversized periods', async () => {
    const repository: ValidationMetricsRepository = { summarize: () => Promise.resolve(snapshot) };
    const useCase = new GetValidationMetrics(repository);
    await expect(
      useCase.execute({
        workspaceId: 'workspace-1',
        actorUserId: 'owner-1',
        from: snapshot.period.to,
        to: snapshot.period.from,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({
        workspaceId: 'workspace-1',
        actorUserId: 'owner-1',
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
