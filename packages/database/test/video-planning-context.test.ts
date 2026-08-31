import { describe, expect, it, vi } from 'vitest';
import { PrismaVideoPlanningContextRepository } from '../src';

const scope = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  actorUserId: 'user-1',
  videoProjectId: 'video-1',
  bunshinId: 'bunshin-1',
};

const bunshin = {
  objectiveSummary: '商品の特徴を伝える',
  audienceSummary: '初めて商品を知る人',
  personalitySummary: 'やさしい',
  personality: {
    tone: '親しみやすい',
    preferredExpressions: ['いっしょに'],
    forbiddenExpressions: ['絶対'],
  },
};

describe('PrismaVideoPlanningContextRepository', () => {
  it('builds an organic context only from the owned scoped project', async () => {
    const findFirst = vi.fn().mockResolvedValue(bunshin);
    const client = {
      bunshin: { findFirst },
      campaign: { findFirst: vi.fn() },
      videoProject: {
        findFirst: vi.fn().mockResolvedValue({
          characterProfileSnapshot: {
            name: '案内役ミナ',
            appearance: '赤いジャケットの案内役',
            worldSetting: '明るいワークスペース',
            safetyRules: ['実在人物に似せない'],
          },
          characterReferenceSnapshot: [{ storageKey: 'private/key.png' }],
        }),
      },
      videoAsset: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await new PrismaVideoPlanningContextRepository(client as never).findAuthorized({
      ...scope,
      campaignId: null,
    });
    expect(result).toMatchObject({
      objective: '商品の特徴を伝える',
      product: null,
      character: {
        name: '案内役ミナ',
        appearance: '赤いジャケットの案内役',
        worldSetting: '明るいワークスペース',
        safetyRules: ['実在人物に似せない'],
        referenceImageCount: 1,
      },
      approvedAssets: [],
      userAssets: [],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'bunshin-1',
          workspaceId: 'workspace-1',
          ownerUserId: 'user-1',
          videoProjects: {
            some: expect.objectContaining({ id: 'video-1', groupId: 'group-1' }),
          },
        }),
      }),
    );
  });

  it('fails closed when a campaign is not authorized for this participant and Bunshin', async () => {
    const campaignFindFirst = vi.fn().mockResolvedValue(null);
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue(bunshin) },
      campaign: { findFirst: campaignFindFirst },
      videoProject: {
        findFirst: vi.fn().mockResolvedValue({
          characterProfileSnapshot: {},
          characterReferenceSnapshot: [],
        }),
      },
      videoAsset: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await expect(
      new PrismaVideoPlanningContextRepository(client as never).findAuthorized({
        ...scope,
        campaignId: 'campaign-1',
      }),
    ).resolves.toBeNull();
    expect(campaignFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'campaign-1',
          workspaceId: 'workspace-1',
          groupId: 'group-1',
          participations: {
            some: expect.objectContaining({
              participantWorkspaceId: 'workspace-1',
              userId: 'user-1',
              bunshinId: 'bunshin-1',
              status: 'ACCEPTED',
            }),
          },
        }),
      }),
    );
  });
});
