import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  finishVideoMedia,
  reserveVideoMedia,
  settleVideoSceneBatch,
} from '../src/video-media-quota';

const scope = { workspaceId: 'w', groupId: 'g', videoProjectId: 'p', projectRevision: 3 };
const m = {
  $queryRaw: vi.fn(),
  serviceCommercialSetting: { findFirst: vi.fn() },
  serviceMediaGenerationReservation: {
    findUnique: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  videoSceneGeneration: { findMany: vi.fn() },
  videoProject: { updateMany: vi.fn() },
};
const tx = m as unknown as Prisma.TransactionClient;
describe('transactional service video allowance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.serviceCommercialSetting.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      monthlyVideoGenerationLimit: 1,
      startsAt: null,
      endsAt: null,
    });
    m.serviceMediaGenerationReservation.count.mockResolvedValue(0);
  });
  it('locks the service and reserves once per project revision, shared by scenes and composition', async () => {
    await reserveVideoMedia(tx, scope);
    expect(m.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      m.serviceCommercialSetting.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(m.serviceMediaGenerationReservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'w',
          groupId: 'g',
          operationKey: 'video:p:revision:3',
          kind: 'VIDEO',
          status: 'RESERVED',
        }),
      }),
    );
    m.serviceMediaGenerationReservation.findUnique.mockResolvedValue({ status: 'RESERVED' });
    await reserveVideoMedia(tx, scope);
    expect(m.serviceMediaGenerationReservation.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects a new video at the limit but permits a previously reserved or completed video', async () => {
    m.serviceMediaGenerationReservation.count.mockResolvedValue(1);
    await expect(reserveVideoMedia(tx, scope)).rejects.toThrow('今月の動画作成枠');
    m.serviceMediaGenerationReservation.findUnique.mockResolvedValue({ status: 'CONSUMED' });
    await expect(reserveVideoMedia(tx, scope)).resolves.toBeUndefined();
    expect(m.serviceMediaGenerationReservation.upsert).not.toHaveBeenCalled();
  });
  it.each(['DRAFT', 'SUSPENDED', 'CANCELLED'])(
    'blocks inactive contract %s even with an existing reservation',
    async (status) => {
      m.serviceCommercialSetting.findFirst.mockResolvedValue({
        status,
        monthlyVideoGenerationLimit: 1,
      });
      m.serviceMediaGenerationReservation.findUnique.mockResolvedValue({ status: 'RESERVED' });
      await expect(reserveVideoMedia(tx, scope)).rejects.toThrow('有効ではありません');
    },
  );
  it('only consumes a reserved slot, so completion and notification retries cannot count twice', async () => {
    await finishVideoMedia(tx, scope, 'CONSUMED');
    expect(m.serviceMediaGenerationReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'w',
          groupId: 'g',
          kind: 'VIDEO',
          operationKey: 'video:p:revision:3',
          status: 'RESERVED',
        },
        data: expect.objectContaining({ status: 'CONSUMED' }),
      }),
    );
  });
  it('retains a batch reservation while another scene is still running', async () => {
    m.videoSceneGeneration.findMany.mockResolvedValue([
      { status: 'FAILED' },
      { status: 'GENERATING' },
    ]);
    await settleVideoSceneBatch(tx, scope);
    expect(m.serviceMediaGenerationReservation.updateMany).not.toHaveBeenCalled();
  });
  it('releases a failed batch when its last scene finishes and marks the project retryable', async () => {
    m.videoSceneGeneration.findMany.mockResolvedValue([
      { status: 'FAILED' },
      { status: 'SUCCEEDED' },
    ]);
    await settleVideoSceneBatch(tx, scope);
    expect(m.serviceMediaGenerationReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RELEASED' }) }),
    );
    expect(m.videoProject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
