import { describe, expect, it, vi } from 'vitest';
import {
  GetLineNotificationPreference,
  UpdateLineNotificationPreference,
  defaultLineNotificationPreference,
  isLineNotificationSuppressed,
  type LineNotificationPreferenceRepository,
} from '../src/index';

const input = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  enabled: true,
  consentGranted: true,
  localTime: '08:00',
  timezone: 'Asia/Tokyo',
  frequency: 'DAILY' as const,
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  pausedUntil: null,
  reminderEnabled: false,
};

describe('LINE notification preference', () => {
  it('returns safe defaults only for an accessible Bunshin', async () => {
    const repository = {
      getScoped: vi.fn().mockResolvedValue({ accessible: true, preference: null }),
    } as unknown as LineNotificationPreferenceRepository;
    await expect(
      new GetLineNotificationPreference(repository).execute(input),
    ).resolves.toMatchObject({
      enabled: false,
      localTime: '08:00',
      timezone: 'Asia/Tokyo',
    });
    repository.getScoped = vi.fn().mockResolvedValue({ accessible: false, preference: null });
    await expect(
      new GetLineNotificationPreference(repository).execute(input),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('requires consent before enabling notifications', async () => {
    const upsert = vi.fn();
    const repository = { upsert } as unknown as LineNotificationPreferenceRepository;
    await expect(
      new UpdateLineNotificationPreference(repository).execute({ ...input, consentGranted: false }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([{ localTime: '24:00' }, { timezone: 'Invalid/Zone' }, { quietHoursEnd: '21:00' }])(
    'rejects invalid scheduling input %#',
    async (override) => {
      const repository = { upsert: vi.fn() } as unknown as LineNotificationPreferenceRepository;
      await expect(
        new UpdateLineNotificationPreference(repository).execute({ ...input, ...override }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    },
  );

  it('evaluates timezone, cross-midnight quiet hours, pause and weekday frequency', () => {
    const base = {
      ...defaultLineNotificationPreference({
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        bunshinId: input.bunshinId,
      }),
      enabled: true,
      notificationConsentAt: new Date('2026-08-01T00:00:00Z'),
    };
    expect(isLineNotificationSuppressed(base, new Date('2026-08-21T13:00:00Z'))).toBe(true);
    expect(isLineNotificationSuppressed(base, new Date('2026-08-21T23:00:00Z'))).toBe(false);
    expect(
      isLineNotificationSuppressed(
        { ...base, pausedUntil: new Date('2026-08-23T00:00:00Z') },
        new Date('2026-08-21T23:00:00Z'),
      ),
    ).toBe(true);
    expect(
      isLineNotificationSuppressed(
        { ...base, frequency: 'WEEKDAYS' },
        new Date('2026-08-22T03:00:00Z'),
      ),
    ).toBe(true);
  });
});
