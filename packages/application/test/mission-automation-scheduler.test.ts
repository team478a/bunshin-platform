import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunMissionAutomationScheduler, type LineNotificationPreference } from '../src';

const preference = (overrides: Partial<LineNotificationPreference> = {}) => ({
  id: 'preference-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  bunshinId: 'bunshin-1',
  enabled: true,
  notificationConsentAt: new Date('2026-08-01T00:00:00.000Z'),
  localTime: '08:00',
  timezone: 'Asia/Tokyo',
  frequency: 'DAILY' as const,
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  pausedUntil: null,
  reminderEnabled: false,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  ...overrides,
});

describe('RunMissionAutomationScheduler', () => {
  const weekly = vi.fn();
  const daily = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  const scheduler = (values: LineNotificationPreference[], at: Date) =>
    new RunMissionAutomationScheduler(
      {
        listEnabled: vi.fn().mockResolvedValue({ candidates: values, truncated: false }),
      },
      { execute: weekly } as never,
      { execute: daily } as never,
      () => at,
    );

  it('enqueues the local-date Daily job only at the configured local minute', async () => {
    const result = await scheduler([preference()], new Date('2026-08-24T23:00:00.000Z')).execute(
      'PRODUCTION',
    );
    expect(daily).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        actorUserId: 'user-1',
        missionDate: '2026-08-25',
      }),
    );
    expect(weekly).not.toHaveBeenCalled();
    expect(result).toMatchObject({ due: 1, dailyEnqueued: 1, failures: 0 });
  });

  it('prepares the next Monday on Sunday even for WEEKDAYS, while suppressing Sunday Daily', async () => {
    const result = await scheduler(
      [preference({ frequency: 'WEEKDAYS' })],
      new Date('2026-08-22T23:00:00.000Z'),
    ).execute('PRODUCTION');
    expect(weekly).toHaveBeenCalledWith(expect.objectContaining({ weekStartDate: '2026-08-24' }));
    expect(daily).not.toHaveBeenCalled();
    expect(result).toMatchObject({ weeklyEnqueued: 1, dailyEnqueued: 0, skipped: 1 });
  });

  it('does not enqueue outside the minute, during pause, or during quiet hours', async () => {
    const outside = await scheduler([preference()], new Date('2026-08-24T23:01:00.000Z')).execute(
      'PRODUCTION',
    );
    expect(outside.due).toBe(0);
    const paused = await scheduler(
      [preference({ pausedUntil: new Date('2026-08-26T00:00:00.000Z') })],
      new Date('2026-08-24T23:00:00.000Z'),
    ).execute('PRODUCTION');
    expect(paused).toMatchObject({ due: 1, dailyEnqueued: 0, skipped: 1 });
    const quiet = await scheduler(
      [preference({ localTime: '22:00' })],
      new Date('2026-08-25T13:00:00.000Z'),
    ).execute('PRODUCTION');
    expect(quiet).toMatchObject({ due: 1, dailyEnqueued: 0, skipped: 1 });
    expect(daily).not.toHaveBeenCalled();
  });

  it('isolates candidate failures and reports a bounded scan', async () => {
    daily.mockRejectedValueOnce(new Error('database unavailable'));
    const result = await new RunMissionAutomationScheduler(
      {
        listEnabled: vi.fn().mockResolvedValue({
          candidates: [preference()],
          truncated: true,
        }),
      },
      { execute: weekly } as never,
      { execute: daily } as never,
      () => new Date('2026-08-24T23:00:00.000Z'),
    ).execute('STAGING');
    expect(result).toMatchObject({ failures: 1, truncated: true, environment: 'STAGING' });
  });
});
