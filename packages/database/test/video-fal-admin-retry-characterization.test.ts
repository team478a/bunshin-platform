import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/client';
import { PrismaVideoRenderOperationsRepository } from '../src/video-render-operations';

const completedAt = new Date('2026-09-30T01:02:03Z');
const generation = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  groupId: '33333333-3333-4333-8333-333333333333',
  ownerUserId: '44444444-4444-4444-8444-444444444444',
  videoProjectId: '55555555-5555-4555-8555-555555555555',
  videoSceneId: '99999999-9999-4999-8999-999999999999',
  projectRevision: 3,
  provider: 'FAL',
  model: 'fal-ai/kling-video/o1/reference-to-video',
  inputSnapshot: { scene: { visualPrompt: '架空の製品を映す', durationMs: 5_000 } },
  status: 'FAILED',
  errorCode: 'FAL_TIMEOUT_OR_NETWORK',
  completedAt,
  externalJobId: 'old_fake_request_1',
  actualCostUsdMicros: 123_000, // fictional fixture, NOT an actual provider invoice
  project: { bunshinId: '66666666-6666-4666-8666-666666666666' },
};

describe('F8 fal/Kling admin retry characterization using the real repository method', () => {
  it('observes the update, quota reservation and retry-history payload without a real DB', async () => {
    const persisted = { ...generation };
    const updateMany = vi.fn(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(persisted, data);
      return Promise.resolve({ count: 1 });
    });
    const upsert = vi.fn(() => Promise.resolve({ id: 'reservation-1' }));
    const createJob = vi.fn(() => Promise.resolve({ id: 'new-job-1' }));
    const createRetry = vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: data.id,
        jobId: data.jobId,
        createdAt: completedAt,
      }),
    );
    const tx = {
      $queryRaw: vi.fn(() => Promise.resolve([])),
      platformAdmin: { findFirst: vi.fn(() => Promise.resolve({ id: 'admin-1' })) },
      videoSceneGeneration: {
        findFirst: vi.fn(() => Promise.resolve({ ...persisted })),
        updateMany,
      },
      job: {
        findFirst: vi.fn(() => Promise.resolve({ id: 'old-job-1' })),
        create: createJob,
      },
      organizationEntitlement: { findUnique: vi.fn(() => Promise.resolve(null)) },
      serviceCommercialSetting: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            status: 'ACTIVE',
            monthlyVideoGenerationLimit: 1,
            startsAt: null,
            endsAt: null,
          }),
        ),
      },
      serviceMediaGenerationReservation: {
        findUnique: vi.fn(() => Promise.resolve(null)),
        count: vi.fn(() => Promise.resolve(0)),
        upsert,
      },
      videoProject: { update: vi.fn(() => Promise.resolve({ id: generation.videoProjectId })) },
      videoSceneGenerationRetryRequest: { create: createRetry },
    };
    const client = {
      $transaction: <T>(run: (value: typeof tx) => Promise<T>) => run(tx),
    } as unknown as PrismaClient;
    const repository = new PrismaVideoRenderOperationsRepository(client);

    const result = await repository.requestSceneRetry({
      environment: 'PRODUCTION',
      generationId: generation.id,
      actorUserId: '77777777-7777-4777-8777-777777777777',
      requestId: '88888888-8888-4888-8888-888888888888',
      reason: 'characterization fixture only',
    });

    expect(result).toMatchObject({
      id: '88888888-8888-4888-8888-888888888888',
      jobId: 'new-job-1',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          operationKey: `video:${generation.videoProjectId}:revision:3`,
          status: 'RESERVED',
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: generation.id, status: 'FAILED', completedAt },
        data: expect.objectContaining({
          status: 'QUEUED',
          externalJobId: null,
          actualCostUsdMicros: null,
        }),
      }),
    );
    expect(persisted).toMatchObject({
      status: 'QUEUED',
      externalJobId: null,
      actualCostUsdMicros: null,
      provider: generation.provider,
      model: generation.model,
      inputSnapshot: generation.inputSnapshot,
      videoProjectId: generation.videoProjectId,
      videoSceneId: generation.videoSceneId,
      projectRevision: generation.projectRevision,
    });
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: `video-ai-scene-admin-retry:${generation.id}:${completedAt.toISOString()}`,
        }),
      }),
    );
    expect(createRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          videoSceneGenerationId: generation.id,
          failedAtSnapshot: completedAt,
          jobId: 'new-job-1',
        }),
      }),
    );
    const retryPayload = createRetry.mock.calls[0]?.[0].data;
    expect(retryPayload).not.toHaveProperty('externalJobId');
    expect(retryPayload).not.toHaveProperty('actualCostUsdMicros');
  });
});
