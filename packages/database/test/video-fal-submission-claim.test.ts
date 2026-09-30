import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/client';
import { PrismaVideoSceneGenerationRepository } from '../src/video-scene-generation-repository';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const generationId = '22222222-2222-4222-8222-222222222222';

describe('fal submission claim persistence', () => {
  it('claims only a scoped QUEUED fal row before POST and saves the returned ID from that state', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({ id: generationId, status: 'SUBMISSION_UNKNOWN', inputSnapshot: {} })
      .mockResolvedValueOnce({
        id: generationId,
        status: 'SUBMITTED',
        externalJobId: 'fake_request_1',
        inputSnapshot: {},
      });
    const client = {
      videoSceneGeneration: { updateMany, findUniqueOrThrow },
    } as unknown as PrismaClient;
    const repository = new PrismaVideoSceneGenerationRepository(client);

    await expect(
      repository.claimFalSubmission({ workspaceId, generationId }),
    ).resolves.toMatchObject({
      status: 'SUBMISSION_UNKNOWN',
    });
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: generationId,
          workspaceId,
          provider: 'FAL',
          status: 'QUEUED',
          externalJobId: null,
        },
        data: expect.objectContaining({
          status: 'SUBMISSION_UNKNOWN',
          errorCode: 'FAL_SUBMISSION_UNCONFIRMED',
        }),
      }),
    );

    await expect(
      repository.markSubmitted({ workspaceId, generationId, externalJobId: 'fake_request_1' }),
    ).resolves.toMatchObject({ status: 'SUBMITTED', externalJobId: 'fake_request_1' });
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: generationId,
          workspaceId,
          OR: [
            { provider: 'FAL', status: 'SUBMISSION_UNKNOWN' },
            { provider: { not: 'FAL' }, status: 'QUEUED' },
          ],
        },
        data: expect.objectContaining({
          status: 'SUBMITTED',
          externalJobId: 'fake_request_1',
          errorCode: null,
        }),
      }),
    );
  });

  it('returns null on a lost claim and does not read or update the row again', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUniqueOrThrow = vi.fn();
    const client = {
      videoSceneGeneration: { updateMany, findUniqueOrThrow },
    } as unknown as PrismaClient;
    await expect(
      new PrismaVideoSceneGenerationRepository(client).claimFalSubmission({
        workspaceId,
        generationId,
      }),
    ).resolves.toBeNull();
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not turn an unknown fal submission into FAILED when a Job exhausts attempts', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUniqueOrThrow = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      videoSceneGeneration: { updateMany, findUniqueOrThrow },
    };
    const client = {
      $transaction: <T>(run: (value: typeof tx) => Promise<T>) => run(tx),
    } as unknown as PrismaClient;
    await expect(
      new PrismaVideoSceneGenerationRepository(client).markFailed({
        workspaceId,
        generationId,
        errorCode: 'FAL_TIMEOUT_OR_NETWORK',
      }),
    ).resolves.toBeNull();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['QUEUED', 'SUBMITTED', 'GENERATING'] },
        }),
      }),
    );
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
