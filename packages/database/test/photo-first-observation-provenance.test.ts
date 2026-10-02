import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaAiUsageEventRepository, PrismaMissionContentVariantRepository } from '../src';

const scope = {
  workspaceId: 'workspace',
  bunshinId: 'bunshin',
  actorUserId: 'owner',
  dailyMissionId: 'mission',
};
const generationId = '00000000-0000-4000-8000-000000000001';
function claims(existing: object | null = null) {
  const tx = {
    $executeRaw: vi.fn(),
    dailyMission: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: 'mission',
          bunshin: { ownerUserId: 'owner', workspace: { memberships: [{ role: 'MEMBER' }] } },
        }),
    },
    missionContentVariant: { findFirst: vi.fn().mockResolvedValue(null) },
    missionContentVariantGeneration: {
      findFirst: vi.fn().mockResolvedValueOnce(existing).mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ ...data, id: generationId })),
    },
  };
  return {
    tx,
    repository: new PrismaMissionContentVariantRepository({
      $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
    } as never),
  };
}
describe('Photo First observation provenance', () => {
  it.each(['PHOTO_FIRST', 'STANDARD', undefined] as const)(
    'records %s at claim, without needing success metadata',
    async (initiatingSource) => {
      const { repository, tx } = claims();
      await repository.claim({
        ...scope,
        idempotencyKey: 'key',
        ...(initiatingSource ? { initiatingSource } : {}),
      });
      expect(tx.missionContentVariantGeneration.create).toHaveBeenCalledWith({
        data: { ...scope, idempotencyKey: 'key', initiatingSource: initiatingSource ?? null },
      });
    },
  );
  it.each([
    { dailyMissionId: 'other', initiatingSource: 'PHOTO_FIRST' },
    { dailyMissionId: 'mission', initiatingSource: 'STANDARD' },
  ])('rejects reusing a generation key for another mission/source', async (existing) => {
    const { repository, tx } = claims(existing);
    await expect(
      repository.claim({ ...scope, idempotencyKey: 'key', initiatingSource: 'PHOTO_FIRST' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.missionContentVariantGeneration.create).not.toHaveBeenCalled();
  });
  it('replays an old unknown row without relabeling or creating a new generation', async () => {
    const { repository, tx } = claims({ ...scope, id: generationId, initiatingSource: null });
    expect(
      await repository.claim({ ...scope, idempotencyKey: 'key', initiatingSource: 'PHOTO_FIRST' }),
    ).toMatchObject({ acquired: false, generation: { initiatingSource: null } });
    expect(tx.missionContentVariantGeneration.create).not.toHaveBeenCalled();
  });
});

const usage = {
  ...scope,
  taskType: 'PHOTO_FIRST_ANALYSIS',
  provider: 'fake',
  model: 'fake-model',
  promptVersion: 'fake-v1',
  status: 'SUCCESS' as const,
  inputTokens: null,
  outputTokens: null,
  latencyMs: 1,
  idempotencyKey: 'usage',
  contentVariantGenerationId: generationId,
};
function events(
  allowed = true,
  stored = {
    contentVariantGenerationId: generationId,
    bunshinId: scope.bunshinId,
    taskType: usage.taskType,
  },
) {
  const findFirst = vi.fn().mockResolvedValue(allowed ? { id: generationId } : null);
  const upsert = vi.fn().mockResolvedValue(stored);
  const client = {
    bunshin: { findFirst: vi.fn().mockResolvedValue({ id: scope.bunshinId }) },
    missionContentVariantGeneration: { findFirst },
    aiUsageEvent: { upsert },
  } as unknown as PrismaClient;
  return { repository: new PrismaAiUsageEventRepository(client), findFirst, upsert };
}
describe('AI usage explicit generation reference', () => {
  it('checks Workspace, Bunshin, actor and Mission owner before persisting each stage', async () => {
    const { repository, findFirst, upsert } = events();
    await repository.record(usage);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: generationId,
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        actorUserId: scope.actorUserId,
        dailyMission: { bunshin: { ownerUserId: scope.actorUserId } },
      },
      select: { id: true },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          contentVariantGenerationId: generationId,
          estimatedCostUsdMicros: null,
          model: 'fake-model',
          promptVersion: 'fake-v1',
        }),
        update: {},
      }),
    );
  });
  it('rejects an unavailable/cross-scope generation even with active workspace membership', async () => {
    const { repository, upsert } = events(false);
    await expect(repository.record(usage)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(upsert).not.toHaveBeenCalled();
  });
  it.each([
    { contentVariantGenerationId: 'other', bunshinId: 'bunshin', taskType: usage.taskType },
    { contentVariantGenerationId: generationId, bunshinId: 'other', taskType: usage.taskType },
    { contentVariantGenerationId: generationId, bunshinId: 'bunshin', taskType: 'QUALITY_CHECKER' },
  ])('never reattaches an existing usage key or stage', async (stored) => {
    const { repository, upsert } = events(true, stored);
    await expect(repository.record(usage)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(upsert.mock.calls[0]?.[0].update).toEqual({});
  });
  it('keeps incurred stage cost when pipeline fails and unknown cost remains null', async () => {
    const { repository, upsert } = events();
    await repository.record({ ...usage, estimatedCostUsdMicros: 250 });
    expect(upsert.mock.calls[0]?.[0].create.estimatedCostUsdMicros).toBe(250n);
    await repository.record({ ...usage, status: 'FAILED', errorCode: 'FAKE_FAILURE' });
    expect(upsert.mock.calls[1]?.[0].create.estimatedCostUsdMicros).toBeNull();
  });
});
