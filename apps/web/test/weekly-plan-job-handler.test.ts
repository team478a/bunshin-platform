import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('../src/services/weekly-plan-generation', () => ({
  createWeeklyPlanGenerationService: () => Promise.resolve({ execute }),
}));

import { createWeeklyPlanJobHandler } from '../src/jobs/weekly-plan-job-handler';

describe('weekly plan job handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps validated Job scope and local date to idempotent weekly generation', async () => {
    await createWeeklyPlanJobHandler().execute({
      localDate: '2026-08-24',
      job: {
        id: 'job-1',
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        capabilityType: 'SOCIAL',
        jobType: 'WEEKLY_PLAN_PREPARE',
        payloadReference: 'weekly-plan:2026-08-24',
        idempotencyKey: 'weekly-plan:workspace-1:bunshin-1:2026-08-24',
        correlationId: 'correlation-1',
        requestedBy: 'user-1',
        status: 'LEASED',
        priority: 100,
        attemptCount: 1,
        maxAttempts: 5,
        scheduledAt: now,
        leaseOwner: 'worker-1',
        leaseExpiresAt: now,
        nextRetryAt: null,
        lastErrorCategory: null,
        completedAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(execute).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      actorUserId: 'user-1',
      weekStartDate: '2026-08-24',
      usageIdempotencyKey: 'job:job-1:weekly-plan',
      existingPolicy: 'RETURN',
    });
  });
});

const now = new Date('2026-08-22T00:00:00.000Z');
