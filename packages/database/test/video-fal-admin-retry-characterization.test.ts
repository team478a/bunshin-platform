import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/client';
import { PrismaVideoRenderOperationsRepository } from '../src/video-render-operations';

describe('F8 fal/Kling admin retry safety regression using the real repository method', () => {
  it('does not reopen a FAILED fal generation with an old request ID and fictional cost', async () => {
    const persisted = {
      id: '11111111-1111-4111-8111-111111111111',
      provider: 'FAL',
      status: 'FAILED',
      externalJobId: 'old_fake_request_1',
      actualCostUsdMicros: 123_000, // fictional fixture, not a provider invoice
    };
    const findGeneration = vi.fn().mockResolvedValue(null);
    const updateGeneration = vi.fn();
    const reserve = vi.fn();
    const createJob = vi.fn();
    const createRetry = vi.fn();
    const tx = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-1' }) },
      videoSceneGeneration: { findFirst: findGeneration, updateMany: updateGeneration },
      serviceMediaGenerationReservation: { upsert: reserve },
      job: { create: createJob },
      videoSceneGenerationRetryRequest: { create: createRetry },
    };
    const client = {
      $transaction: <T>(run: (value: typeof tx) => Promise<T>) => run(tx),
    } as unknown as PrismaClient;

    const result = await new PrismaVideoRenderOperationsRepository(client).requestSceneRetry({
      environment: 'PRODUCTION',
      generationId: persisted.id,
      actorUserId: '77777777-7777-4777-8777-777777777777',
      requestId: '88888888-8888-4888-8888-888888888888',
      reason: 'test-only reconciliation hold',
    });

    expect(result).toBeNull();
    expect(findGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: { not: 'FAL' }, status: 'FAILED' }),
      }),
    );
    expect(updateGeneration).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(createRetry).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({
      externalJobId: 'old_fake_request_1',
      actualCostUsdMicros: 123_000,
    });
  });
});
