import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('../src/services/daily-mission-generation', () => ({
  createDailyMissionGenerationService: () => ({ execute }),
}));

import { createDailyMissionJobHandler } from '../src/jobs/daily-mission-job-handler';

const now = new Date('2026-08-22T00:00:00.000Z');

describe('daily mission job handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps validated Job scope and local date to idempotent Daily generation', async () => {
    await createDailyMissionJobHandler().execute({
      localDate: '2026-08-25',
      job: {
        id: 'job-1',
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        capabilityType: 'SOCIAL',
        jobType: 'DAILY_MISSION_GENERATE',
        payloadReference: 'daily-mission:2026-08-25',
        idempotencyKey: 'daily-mission:workspace-1:bunshin-1:2026-08-25',
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
      missionDate: '2026-08-25',
      generationIdempotencyKey: 'daily-mission:workspace-1:bunshin-1:2026-08-25',
      usageIdempotencyPrefix: 'job:job-1:daily-mission',
      existingPolicy: 'RETURN',
    });
  });
});
