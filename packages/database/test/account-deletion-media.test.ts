import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { purgeAccountMedia } from '../src/account-deletion-media';

const now = new Date('2026-09-10T00:00:00Z');
const input = { requestId: 'request', userId: 'owner', workerId: 'worker', now };
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const model = () => ({
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  });
  const db = {
    accountDeletionRequest: { findFirst: vi.fn().mockResolvedValue({ id: 'request' }) },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ updatedAt: new Date('2026-09-08T00:00:00Z') }),
    },
    ownerKnowledge: model(),
    bunshin: model(),
    videoNarration: model(),
    videoProject: model(),
    videoAsset: model(),
    videoRender: model(),
    videoSceneGeneration: model(),
    socialImageGeneratedMedia: model(),
    socialImageGenerationRequest: model(),
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  const execute = () => purgeAccountMedia(db as unknown as PrismaClient, input, storage);
  return { db, storage, execute };
}
afterEach(() => vi.useRealTimers());

describe('account media purge', () => {
  it('rejects a missing lease before reading or deleting media', async () => {
    const { db, storage, execute } = fixture();
    db.accountDeletionRequest.findFirst.mockResolvedValue(null);
    expect(await execute()).toBe(false);
    expect(db.videoAsset.findMany).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('leaves organization-owned knowledge for the existing manual review', async () => {
    const { db, storage, execute } = fixture();
    db.ownerKnowledge.count.mockResolvedValue(1);
    expect(await execute()).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(db.videoProject.updateMany).not.toHaveBeenCalled();
  });
  it('waits for suspension quarantine before cancelling and purging media', async () => {
    const { db, storage, execute } = fixture();
    db.videoProject.count.mockResolvedValue(1);
    db.user.findUniqueOrThrow.mockResolvedValue({ updatedAt: now });
    expect(await execute()).toBe('PENDING');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(db.videoProject.updateMany).not.toHaveBeenCalled();
  });
  it('uses the actual render key format and deletes before clearing the key', async () => {
    const { db, storage, execute } = fixture();
    db.videoRender.findMany.mockResolvedValue([
      {
        id: 'render',
        workspaceId: 'workspace',
        groupId: 'group',
        outputStorageKey: 'workspace/owner/render.mp4',
      },
    ]);
    expect(await execute()).toBe(true);
    expect(storage.remove).toHaveBeenCalledWith({
      bucket: 'video-renders',
      keys: ['workspace/owner/render.mp4'],
    });
    expect(db.videoRender.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: 'owner', deletedAt: null },
      take: 20,
    });
  });
  it('retains the key on storage failure so the same object can be retried', async () => {
    const { db, storage, execute } = fixture();
    db.videoAsset.findMany.mockResolvedValue([
      {
        id: 'asset',
        workspaceId: 'workspace',
        groupId: 'group',
        storageKey: 'video-assets/workspace/owner/asset',
      },
    ]);
    storage.remove.mockRejectedValue(new Error('storage unavailable'));
    await expect(execute()).rejects.toThrow('storage unavailable');
    expect(db.videoAsset.updateMany).not.toHaveBeenCalled();
  });
  it('never deletes a storage key from another owner', async () => {
    const { db, storage, execute } = fixture();
    db.videoAsset.findMany.mockResolvedValue([
      {
        id: 'asset',
        workspaceId: 'workspace',
        groupId: 'group',
        storageKey: 'video-assets/workspace/other/asset',
      },
    ]);
    await expect(execute()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('does not finish a full page that may have more files', async () => {
    const { db, execute } = fixture();
    db.videoAsset.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, id) => ({
        id: String(id),
        workspaceId: 'workspace',
        groupId: 'group',
        storageKey: `video-assets/workspace/owner/${id}`,
      })),
    );
    expect(await execute()).toBe('PENDING');
  });
});
