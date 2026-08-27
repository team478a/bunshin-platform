import { describe, expect, it, vi } from 'vitest';
import { PrismaLineDeliveryPreferenceRepository, PrismaLineReturnReminderRepository } from '../src';

const preference = {
  id: 'preference-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  bunshinId: 'bunshin-1',
  enabled: true,
  notificationConsentAt: new Date('2026-08-01T00:00:00.000Z'),
  localTime: '08:00',
  timezone: 'Asia/Tokyo',
  frequency: 'DAILY',
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  pausedUntil: null,
  reminderEnabled: true,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('LINE return reminder persistence policy', () => {
  it('fails closed when the current scoped preference is unavailable', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new PrismaLineDeliveryPreferenceRepository({
      lineNotificationPreference: { findFirst },
    } as never);
    await expect(
      repository.isAllowed({
        workspaceId: 'workspace-1',
        bunshinId: 'bunshin-1',
        userId: 'user-1',
        at: new Date('2026-08-27T00:00:00.000Z'),
      }),
    ).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          bunshinId: 'bunshin-1',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('selects a reminder after 7 dormant days and blocks it during the cooldown', async () => {
    const client = {
      lineNotificationPreference: { findFirst: vi.fn().mockResolvedValue({ id: preference.id }) },
      missionActivity: {
        findFirst: vi.fn().mockResolvedValue({
          dailyMission: { missionDate: new Date('2026-08-20T00:00:00.000Z') },
        }),
      },
      lineMessageDelivery: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const repository = new PrismaLineReturnReminderRepository(client as never);
    const input = {
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      actorUserId: 'user-1',
      localDate: '2026-08-27',
      dormancyDays: 7,
      cooldownDays: 7,
    };
    await expect(repository.shouldUse(input)).resolves.toBe(true);
    client.lineMessageDelivery.findFirst.mockResolvedValue({ id: 'recent-reminder' });
    await expect(repository.shouldUse(input)).resolves.toBe(false);
  });
});
