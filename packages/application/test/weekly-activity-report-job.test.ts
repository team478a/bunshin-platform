import { describe, expect, it, vi } from 'vitest';
import {
  EnqueueJob,
  RunWeeklyActivityReportScheduler,
  ScheduleWeeklyActivityReportDelivery,
  type JobRepository,
  type EnqueueJobInput,
  type Job,
  type LineNotificationPreference,
} from '../src';

function preference(
  overrides: Partial<LineNotificationPreference> = {},
): LineNotificationPreference {
  return {
    id: 'preference-a',
    workspaceId: 'workspace-a',
    userId: 'user-a',
    bunshinId: 'bunshin-a',
    enabled: true,
    notificationConsentAt: new Date('2026-09-01T00:00:00Z'),
    localTime: '09:00',
    timezone: 'Asia/Tokyo',
    frequency: 'WEEKDAYS',
    quietHoursStart: '21:00',
    quietHoursEnd: '07:00',
    pausedUntil: null,
    reminderEnabled: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

describe('weekly activity report scheduler', () => {
  it('enqueues one idempotent report on Monday even for weekday mission delivery', async () => {
    const enqueue = vi.fn((input: EnqueueJobInput): Promise<Job> =>
      Promise.resolve({
        ...input,
        id: 'job-a',
        bunshinId: input.bunshinId ?? null,
        capabilityType: input.capabilityType ?? null,
        priority: input.priority ?? 100,
        maxAttempts: input.maxAttempts ?? 5,
        status: 'PENDING' as const,
        scheduledAt: input.scheduledAt ?? new Date(),
        attemptCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextRetryAt: null,
        lastErrorCategory: null,
        completedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const scheduler = new RunWeeklyActivityReportScheduler(
      {
        listEnabled: () => Promise.resolve({ candidates: [preference()], truncated: false }),
      },
      new ScheduleWeeklyActivityReportDelivery(
        new EnqueueJob({ enqueue } as unknown as JobRepository),
      ),
      // 2026-09-14 09:00 JST, Monday.
      () => new Date('2026-09-14T00:00:00.000Z'),
    );
    await expect(scheduler.execute('PRODUCTION')).resolves.toMatchObject({
      due: 1,
      enqueued: 1,
      failures: 0,
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'WEEKLY_ACTIVITY_REPORT_DELIVER',
        payloadReference: 'weekly-activity-report:2026-09-07',
        idempotencyKey: 'weekly-activity-report:workspace-a:bunshin-a:user-a:2026-09-07',
      }),
    );
  });

  it('does not enqueue outside the configured local minute or while paused', async () => {
    const enqueue = vi.fn();
    const scheduler = new RunWeeklyActivityReportScheduler(
      {
        listEnabled: () =>
          Promise.resolve({
            candidates: [preference({ pausedUntil: new Date('2026-09-15T00:00:00Z') })],
            truncated: false,
          }),
      },
      new ScheduleWeeklyActivityReportDelivery(
        new EnqueueJob({ enqueue } as unknown as JobRepository),
      ),
      () => new Date('2026-09-14T00:00:00.000Z'),
    );
    await expect(scheduler.execute('PRODUCTION')).resolves.toMatchObject({
      due: 1,
      skipped: 1,
      enqueued: 0,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
