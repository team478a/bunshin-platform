import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  entitlement: vi.fn(),
  imageCount: vi.fn(),
  videoExisting: vi.fn(),
  videoUsage: vi.fn(),
}));

vi.mock('@bunshin/database', () => ({
  prisma: {
    organizationEntitlement: { findUnique: state.entitlement },
    socialImageGenerationRequest: { count: state.imageCount },
    videoSceneGeneration: {
      findFirst: state.videoExisting,
      findMany: state.videoUsage,
    },
  },
}));

import { assertOrganizationGenerationQuota } from '../src/organization-generation-quota';

const workspaceId = '98a31509-e0d9-473a-b374-890623a4b7d0';
const now = new Date('2026-09-15T00:00:00.000Z');

describe('organization generation quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.entitlement.mockResolvedValue(null);
    state.imageCount.mockResolvedValue(0);
    state.videoExisting.mockResolvedValue(null);
    state.videoUsage.mockResolvedValue([]);
  });

  it('keeps existing organizations without an entitlement unrestricted', async () => {
    await expect(
      assertOrganizationGenerationQuota({ workspaceId, kind: 'IMAGE', now }),
    ).resolves.toBeUndefined();
    expect(state.imageCount).not.toHaveBeenCalled();
  });

  it('rejects image generation after the organization monthly limit is reached', async () => {
    state.entitlement.mockResolvedValue({
      suspended: false,
      startsAt: null,
      endsAt: null,
      monthlyImageGenerationLimit: 2,
      monthlyVideoGenerationLimit: null,
    });
    state.imageCount.mockResolvedValue(2);
    await expect(
      assertOrganizationGenerationQuota({ workspaceId, kind: 'IMAGE', now }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not count a retried video project twice', async () => {
    state.entitlement.mockResolvedValue({
      suspended: false,
      startsAt: null,
      endsAt: null,
      monthlyImageGenerationLimit: null,
      monthlyVideoGenerationLimit: 1,
    });
    state.videoExisting.mockResolvedValue({ id: 'generation-1' });
    await expect(
      assertOrganizationGenerationQuota({
        workspaceId,
        kind: 'VIDEO',
        resourceId: 'video-project-1',
        now,
      }),
    ).resolves.toBeUndefined();
    expect(state.videoUsage).not.toHaveBeenCalled();
  });

  it('rejects a new video project after the monthly limit is reached', async () => {
    state.entitlement.mockResolvedValue({
      suspended: false,
      startsAt: null,
      endsAt: null,
      monthlyImageGenerationLimit: null,
      monthlyVideoGenerationLimit: 1,
    });
    state.videoUsage.mockResolvedValue([{ videoProjectId: 'existing-project' }]);
    await expect(
      assertOrganizationGenerationQuota({
        workspaceId,
        kind: 'VIDEO',
        resourceId: 'new-project',
        now,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
