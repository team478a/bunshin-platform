import { describe, expect, it, vi } from 'vitest';
import { PrismaVideoAssetRepository } from '../src';

const input = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  groupMembershipId: 'membership-1',
  actorUserId: 'user-1',
  videoProjectId: 'project-1',
  kind: 'IMAGE' as const,
  originalFilename: '商品.jpg',
  declaredMimeType: 'image/jpeg',
  declaredSizeBytes: 1000,
  usageTerms: '投稿作成に利用可能',
};

const row = {
  id: 'asset-1',
  workspaceId: input.workspaceId,
  groupId: input.groupId,
  groupMembershipId: input.groupMembershipId,
  ownerUserId: input.actorUserId,
  videoProjectId: input.videoProjectId,
  kind: 'IMAGE',
  status: 'PENDING_UPLOAD',
  storageKey: 'video-assets/scoped/key',
  originalFilename: input.originalFilename,
  declaredMimeType: input.declaredMimeType,
  verifiedMimeType: null,
  declaredSizeBytes: 1000,
  verifiedSizeBytes: null,
  width: null,
  height: null,
  durationMs: null,
  rightsConfirmedAt: new Date(),
  usageTerms: input.usageTerms,
  failureCode: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PrismaVideoAssetRepository', () => {
  it('does not create a pending asset outside an active entitled membership', async () => {
    const tx = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      videoProject: { findFirst: vi.fn() },
      videoAsset: { create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await expect(
      new PrismaVideoAssetRepository(client as never).createPending(input),
    ).resolves.toBeNull();
    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
        }),
      }),
    );
    expect(tx.videoAsset.create).not.toHaveBeenCalled();
  });

  it('checks the exact owned project before creating an opaque storage key', async () => {
    const tx = {
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: input.groupMembershipId }) },
      videoProject: { findFirst: vi.fn().mockResolvedValue({ id: input.videoProjectId }) },
      videoAsset: { create: vi.fn().mockResolvedValue(row) },
    };
    const client = {
      $transaction: vi.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    await new PrismaVideoAssetRepository(client as never).createPending(input);
    expect(tx.videoProject.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: input.videoProjectId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        ownerUserId: input.actorUserId,
      }),
      select: { id: true },
    });
    const data = vi.mocked(tx.videoAsset.create).mock.calls[0]?.[0]?.data;
    expect(data.storageKey).toMatch(/^video-assets\/workspace-1\/user-1\/[0-9a-f-]+$/);
    expect(data).not.toHaveProperty('url');
  });

  it('lists only ready, unexpired assets inside the exact owner scope', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = { videoAsset: { findMany } };
    await new PrismaVideoAssetRepository(client as never).listReadyOwned({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      videoProjectId: input.videoProjectId,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          status: 'READY',
          groupMembership: expect.objectContaining({
            userId: input.actorUserId,
            status: 'ACTIVE',
          }),
        }),
      }),
    );
  });
});
