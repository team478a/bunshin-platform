import { describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  remove: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    videoAsset: { findMany: vi.fn().mockResolvedValue([]) },
    socialImageGeneratedMedia: { findMany: vi.fn().mockResolvedValue([]) },
    videoRender: { findMany: vi.fn().mockResolvedValue([]) },
    videoSceneGeneration: { findMany: vi.fn().mockResolvedValue([]) },
    socialImageGenerationRequest: { findMany: fake.findMany, updateMany: fake.updateMany },
  },
}));
vi.mock('../src/assets/asset-lifecycle-storage', () => ({
  SupabaseAssetLifecycleStorage: class {
    remove = fake.remove;
  },
}));
import { runExpiredAssetPurge } from '../src/http/asset-lifecycle-operations';

describe('reference photo retention', () => {
  it('purges expired references under their owner path and records completion', async () => {
    fake.findMany.mockResolvedValue([
      { id: 'request', workspaceId: 'workspace', groupId: 'group', ownerUserId: 'owner' },
    ]);
    const now = new Date('2026-09-14T00:00:00Z');
    expect(await runExpiredAssetPurge(now)).toEqual({ scanned: 1, deleted: 1, failed: 0 });
    expect(fake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          referencePurgedAt: null,
          createdAt: { lte: new Date('2026-09-07T00:00:00Z') },
        }),
      }),
    );
    expect(fake.remove).toHaveBeenCalledWith({
      bucket: 'social-image-media',
      keys: ['workspace/group/owner/request/request/reference.png'],
    });
    expect(fake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { referencePurgedAt: now } }),
    );
  });
  it('keeps failed deletions eligible for retry', async () => {
    fake.updateMany.mockClear();
    fake.findMany.mockResolvedValue([
      { id: 'request', workspaceId: 'workspace', groupId: 'group', ownerUserId: 'owner' },
    ]);
    fake.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await runExpiredAssetPurge()).toEqual({ scanned: 1, deleted: 0, failed: 1 });
    expect(fake.updateMany).not.toHaveBeenCalled();
  });
});
