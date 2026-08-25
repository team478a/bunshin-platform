/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import { CompleteJob, EnqueueJob, FailJob, type Job, type JobRepository } from '../src';
import {
  ExecuteMissionAutomationJob,
  MissionAutomationHandlerError,
  MissionAutomationHandlerRegistry,
  ScheduleDailyMissionGeneration,
  ScheduleWeeklyPlanPreparation,
  type MissionAutomationScopeRepository,
} from '../src/mission-automation-jobs';

const now = new Date('2026-08-24T00:00:00.000Z');
const job: Job = {
  id: 'job-1',
  environment: 'PRODUCTION',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  correlationId: 'correlation-1',
  requestedBy: 'user-1',
  jobType: 'DAILY_MISSION_GENERATE',
  payloadReference: 'daily-mission:2026-08-24',
  idempotencyKey: 'daily-mission:workspace-1:bunshin-1:2026-08-24',
  status: 'LEASED',
  priority: 100,
  scheduledAt: now,
  attemptCount: 1,
  maxAttempts: 5,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date(now.getTime() + 60_000),
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

const jobRepository = (): JobRepository => ({
  enqueue: vi.fn((input) => Promise.resolve({ ...job, ...input })),
  claim: vi.fn(() => Promise.resolve(job)),
  complete: vi.fn(() => Promise.resolve({ ...job, status: 'SUCCEEDED' as const })),
  fail: vi.fn((input) =>
    Promise.resolve({
      ...job,
      status: input.nextRetryAt ? ('RETRY_SCHEDULED' as const) : ('DEAD' as const),
    }),
  ),
  cancel: vi.fn(() => Promise.resolve({ ...job, status: 'CANCELLED' as const })),
});
const scopes = (eligible = true): MissionAutomationScopeRepository => ({
  validateWeekly: vi.fn(() => Promise.resolve(eligible)),
  validateDaily: vi.fn(() => Promise.resolve(eligible)),
  validateTrend: vi.fn(() => Promise.resolve(eligible)),
});

describe('Mission automation jobs', () => {
  it('enqueues one environment-scoped weekly job per Bunshin and week', async () => {
    const repository = jobRepository();
    const scope = scopes();
    await new ScheduleWeeklyPlanPreparation(new EnqueueJob(repository), scope).execute({
      environment: 'STAGING',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      actorUserId: 'user-1',
      correlationId: 'correlation-1',
      weekStartDate: '2026-08-24',
    });
    expect(repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'STAGING',
        jobType: 'WEEKLY_PLAN_PREPARE',
        payloadReference: 'weekly-plan:2026-08-24',
        idempotencyKey: 'weekly-plan:workspace-1:bunshin-1:2026-08-24',
      }),
    );
  });

  it('does not enqueue daily work when current scope is ineligible', async () => {
    const repository = jobRepository();
    await expect(
      new ScheduleDailyMissionGeneration(new EnqueueJob(repository), scopes(false)).execute({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        actorUserId: 'user-1',
        correlationId: 'correlation-1',
        missionDate: '2026-08-24',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it('revalidates the full daily scope immediately before invoking a handler', async () => {
    const repository = jobRepository();
    const scope = scopes();
    const handler = { execute: vi.fn(() => Promise.resolve()) };
    const registry = new MissionAutomationHandlerRegistry().register(
      'DAILY_MISSION_GENERATE',
      handler,
    );
    await new ExecuteMissionAutomationJob(
      scope,
      registry,
      new CompleteJob(repository, () => now),
      new FailJob(repository, () => now),
    ).execute(job, 'worker-1');
    expect(scope.validateDaily).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      actorUserId: 'user-1',
      missionDate: '2026-08-24',
    });
    expect(handler.execute).toHaveBeenCalledOnce();
    expect(repository.complete).toHaveBeenCalled();
  });

  it('moves revoked scope to DEAD without calling a handler', async () => {
    const repository = jobRepository();
    const handler = { execute: vi.fn(() => Promise.resolve()) };
    const registry = new MissionAutomationHandlerRegistry().register(
      'DAILY_MISSION_GENERATE',
      handler,
    );
    await new ExecuteMissionAutomationJob(
      scopes(false),
      registry,
      new CompleteJob(repository, () => now),
      new FailJob(repository, () => now),
    ).execute(job, 'worker-1');
    expect(handler.execute).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: { errorCategory: 'SCOPE_NO_LONGER_ELIGIBLE', retryable: false },
        nextRetryAt: null,
      }),
    );
  });

  it('classifies transient handler failure for retry', async () => {
    const repository = jobRepository();
    const registry = new MissionAutomationHandlerRegistry().register('DAILY_MISSION_GENERATE', {
      execute: vi.fn(() => Promise.reject(new MissionAutomationHandlerError('AI_TEMPORARY', true))),
    });
    await new ExecuteMissionAutomationJob(
      scopes(),
      registry,
      new CompleteJob(repository, () => now),
      new FailJob(repository, () => now),
    ).execute(job, 'worker-1');
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: { errorCategory: 'AI_TEMPORARY', retryable: true },
        nextRetryAt: new Date(now.getTime() + 30_000),
      }),
    );
  });
});
