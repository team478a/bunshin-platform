import { describe, expect, it, vi } from 'vitest';
import { hasActiveVideoProjectEntitlement } from '../src/video-project-entitlement';

const scope = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  groupMembershipId: 'membership-1',
};

function client(
  policy: object | null = { id: 'policy' },
  assignment: object | null = { id: 'assignment' },
) {
  return {
    groupFeaturePolicy: { findFirst: vi.fn().mockResolvedValue(policy) },
    groupMemberFeatureAssignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
  };
}

describe('video project entitlement', () => {
  it('uses image generation entitlement for a carousel video', async () => {
    const db = client();
    await expect(
      hasActiveVideoProjectEntitlement(db as never, {
        ...scope,
        socialImageGenerationRequestId: 'image-request-1',
      }),
    ).resolves.toBe(true);
    expect(db.groupFeaturePolicy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ featureKey: 'SOCIAL.IMAGE_GENERATION' }),
      }),
    );
    expect(db.groupMemberFeatureAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ featureKey: 'SOCIAL.IMAGE_GENERATION' }),
      }),
    );
  });

  it('keeps ordinary videos behind the video generation entitlement', async () => {
    const db = client();
    await expect(
      hasActiveVideoProjectEntitlement(db as never, {
        ...scope,
        socialImageGenerationRequestId: null,
      }),
    ).resolves.toBe(true);
    expect(db.groupFeaturePolicy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ featureKey: 'VIDEO_GENERATION' }),
      }),
    );
  });

  it('fails closed unless both the group and member are enabled', async () => {
    await expect(
      hasActiveVideoProjectEntitlement(client(null) as never, {
        ...scope,
        socialImageGenerationRequestId: 'image-request-1',
      }),
    ).resolves.toBe(false);
    await expect(
      hasActiveVideoProjectEntitlement(client({ id: 'policy' }, null) as never, {
        ...scope,
        socialImageGenerationRequestId: 'image-request-1',
      }),
    ).resolves.toBe(false);
  });
});
