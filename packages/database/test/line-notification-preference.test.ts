import { describe, expect, it, vi } from 'vitest';
import { PrismaLineNotificationPreferenceRepository } from '../src/index';

describe('PrismaLineNotificationPreferenceRepository isolation', () => {
  it('does not read or write preferences when the actor cannot access the scoped Bunshin', async () => {
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      lineNotificationPreference: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    };
    const repository = new PrismaLineNotificationPreferenceRepository(client as never);
    const scope = { workspaceId: 'workspace-b', actorUserId: 'user-a', bunshinId: 'bunshin-b' };
    await expect(repository.getScoped(scope)).resolves.toEqual({
      accessible: false,
      preference: null,
    });
    await expect(
      repository.upsert({
        ...scope,
        enabled: false,
        consentGranted: false,
        localTime: '08:00',
        timezone: 'Asia/Tokyo',
        frequency: 'DAILY',
        quietHoursStart: '21:00',
        quietHoursEnd: '07:00',
        pausedUntil: null,
        reminderEnabled: false,
      }),
    ).resolves.toBeNull();
    expect(client.lineNotificationPreference.findUnique).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});
