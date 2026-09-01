import { describe, expect, it, vi } from 'vitest';
import {
  AssignVideoDelivery,
  GetMyVideoDelivery,
  RecordVideoDeliveryAction,
  RecordVideoDeliveryNotification,
  type VideoDeliveryRepository,
} from '../src/video-delivery';

const repository = () => {
  const mocks = {
    assign: vi.fn<VideoDeliveryRepository['assign']>(),
    findForRecipient: vi.fn<VideoDeliveryRepository['findForRecipient']>(),
    recordAction: vi.fn<VideoDeliveryRepository['recordAction']>(),
    recordNotification: vi.fn<VideoDeliveryRepository['recordNotification']>(),
  };
  return { repo: mocks satisfies VideoDeliveryRepository, mocks };
};

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  actorUserId: 'manager-a',
  groupMembershipId: 'membership-a',
  programEnrollmentId: 'enrollment-a',
  videoProjectId: 'project-a',
  videoRenderId: 'render-a',
};

describe('video delivery core', () => {
  it('rejects an already expired individual delivery before repository access', async () => {
    const { repo, mocks } = repository();
    await expect(
      new AssignVideoDelivery(repo).execute({
        ...scope,
        rightsSnapshot: { version: 1 },
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('passes every service and recipient key when assigning a personal video', async () => {
    const { repo, mocks } = repository();
    mocks.assign.mockResolvedValue(null);
    await expect(
      new AssignVideoDelivery(repo).execute({
        ...scope,
        rightsSnapshot: { version: 1, source: 'program' },
        expiresAt: null,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(mocks.assign).toHaveBeenCalledWith({
      ...scope,
      rightsSnapshot: { version: 1, source: 'program' },
      expiresAt: null,
    });
  });

  it('does not allow an arbitrary delivery action', async () => {
    const { repo, mocks } = repository();
    await expect(
      new RecordVideoDeliveryAction(repo).execute({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'member-a',
        videoDeliveryId: 'delivery-a',
        action: 'DELETE' as never,
        eventData: {},
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.recordAction).not.toHaveBeenCalled();
  });

  it('keeps recipient reads scoped to the current user', async () => {
    const { repo, mocks } = repository();
    mocks.findForRecipient.mockResolvedValue(null);
    await expect(
      new GetMyVideoDelivery(repo).execute({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'member-a',
        videoDeliveryId: 'delivery-a',
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(mocks.findForRecipient).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'member-a',
      videoDeliveryId: 'delivery-a',
    });
  });

  it('does not record a successful notification with an error code', async () => {
    const { repo, mocks } = repository();
    await expect(
      new RecordVideoDeliveryNotification(repo).execute({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'manager-a',
        videoDeliveryId: 'delivery-a',
        status: 'SENT',
        errorCode: 'FAILED',
        attemptedAt: new Date(),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(mocks.recordNotification).not.toHaveBeenCalled();
  });
});
