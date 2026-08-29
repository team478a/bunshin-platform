import { describe, expect, it, vi } from 'vitest';
import {
  GetBadgeUserDashboard,
  MarkBadgeNotificationRead,
  SetBadgeAwardVisibility,
  type BadgeUserExperienceRepository,
} from '../src/badge-user-experience';

const repository = (): BadgeUserExperienceRepository => ({
  getDashboard: vi.fn(),
  setVisibility: vi.fn(),
  markNotificationRead: vi.fn(),
});

describe('badge user experience', () => {
  it('does not allow group sharing without a selected group', async () => {
    await expect(
      new SetBadgeAwardVisibility(repository()).execute({
        workspaceId: 'workspace',
        actorUserId: 'user',
        badgeAwardId: 'award',
        visibility: 'GROUP',
        sharedGroupId: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not allow a group id for private visibility', async () => {
    await expect(
      new SetBadgeAwardVisibility(repository()).execute({
        workspaceId: 'workspace',
        actorUserId: 'user',
        badgeAwardId: 'award',
        visibility: 'PRIVATE',
        sharedGroupId: 'group',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a dashboard unavailable outside the user scope', async () => {
    const getDashboard = vi.fn().mockResolvedValue(null);
    const repo = { ...repository(), getDashboard };
    await expect(
      new GetBadgeUserDashboard(repo).execute({ workspaceId: 'workspace', actorUserId: 'user' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('marks only an available notification as read', async () => {
    const markNotificationRead = vi.fn().mockResolvedValue(true);
    const result = await new MarkBadgeNotificationRead({
      ...repository(),
      markNotificationRead,
    }).execute({ workspaceId: 'workspace', actorUserId: 'user', notificationId: 'notice' });
    expect(result).toEqual({ read: true });
    expect(markNotificationRead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        actorUserId: 'user',
        notificationId: 'notice',
      }),
    );
  });

  it('rejects another user notification', async () => {
    const markNotificationRead = vi.fn().mockResolvedValue(false);
    await expect(
      new MarkBadgeNotificationRead({ ...repository(), markNotificationRead }).execute({
        workspaceId: 'workspace',
        actorUserId: 'user',
        notificationId: 'notice',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
