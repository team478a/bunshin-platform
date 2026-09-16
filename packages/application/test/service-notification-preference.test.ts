import { describe, expect, it, vi } from 'vitest';
import {
  ServiceNotificationPreferenceService,
  type ServiceNotificationPreferenceRepository,
} from '../src';

const preference = {
  id: 'preference-1',
  workspaceId: 'workspace-1',
  groupId: 'service-1',
  groupMembershipId: 'membership-1',
  userId: 'user-1',
  topic: 'FORTUNE_WEEKLY',
  channel: 'LINE' as const,
  enabled: true,
  consentedAt: new Date(),
  optedOutAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const repository = (): ServiceNotificationPreferenceRepository => ({
  get: vi.fn(() => Promise.resolve({ accessible: true, preference: null })),
  upsert: vi.fn(() => Promise.resolve(preference)),
});

describe('ServiceNotificationPreferenceService', () => {
  it('keeps consent scoped to a service topic and channel', async () => {
    const upsert = vi.fn(() => Promise.resolve(preference));
    await new ServiceNotificationPreferenceService({ ...repository(), upsert }).update({
      slug: 'fortune-service',
      actorUserId: 'user-1',
      topic: 'FORTUNE_WEEKLY',
      channel: 'LINE',
      enabled: true,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'fortune-service',
        actorUserId: 'user-1',
        topic: 'FORTUNE_WEEKLY',
        channel: 'LINE',
        enabled: true,
        now: expect.any(Date),
      }),
    );
  });

  it.each(['fortune-weekly', 'FORTUNE WEEKLY', 'A'])('rejects invalid topic %s', async (topic) => {
    await expect(
      new ServiceNotificationPreferenceService(repository()).get({
        slug: 'fortune-service',
        actorUserId: 'user-1',
        topic,
        channel: 'LINE',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('fails closed when the actor is not an active member of the service', async () => {
    const get = vi.fn(() => Promise.resolve({ accessible: false, preference: null }));
    await expect(
      new ServiceNotificationPreferenceService({ ...repository(), get }).get({
        slug: 'fortune-service',
        actorUserId: 'user-2',
        topic: 'FORTUNE_WEEKLY',
        channel: 'LINE',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
