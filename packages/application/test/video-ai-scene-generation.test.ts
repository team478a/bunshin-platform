/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizeVideoAiGenerationCost,
  QueueVideoSceneGenerations,
  type VideoAiProviderCostPolicyRepository,
  type VideoSceneGenerationRepository,
} from '../src';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';

describe('QueueVideoSceneGenerations', () => {
  it('passes a provider, model and per-second cost estimate to the scoped repository', async () => {
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn().mockResolvedValue([{ id: 'scene-generation-1' }]),
      findForExecution: vi.fn(),
      markSubmitted: vi.fn(),
      markGenerating: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    await expect(
      new QueueVideoSceneGenerations(repository).execute({
        workspaceId,
        groupId,
        actorUserId: userId,
        videoProjectId: projectId,
        expectedRevision: 3,
        provider: 'FAL',
        model: 'kling-o1-reference-to-video',
        estimatedCostUsdMicrosPerSecond: 112_000,
      }),
    ).resolves.toEqual([{ id: 'scene-generation-1' }]);
    expect(repository.enqueueAiScenes).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'FAL', model: 'kling-o1-reference-to-video' }),
    );
  });

  it('does not allow an empty scene queue to be treated as a successful video generation', async () => {
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn().mockResolvedValue([]),
      findForExecution: vi.fn(),
      markSubmitted: vi.fn(),
      markGenerating: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    await expect(
      new QueueVideoSceneGenerations(repository).execute({
        workspaceId,
        groupId,
        actorUserId: userId,
        videoProjectId: projectId,
        expectedRevision: 3,
        provider: 'FAL',
        model: 'kling-o1-reference-to-video',
        estimatedCostUsdMicrosPerSecond: 112_000,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'video project has no AI video scenes',
    });
  });
});

describe('AuthorizeVideoAiGenerationCost', () => {
  const policyRepository = (dailySpentUsdMicros = 0): VideoAiProviderCostPolicyRepository => ({
    findActive: vi.fn().mockResolvedValue({
      policy: {
        provider: 'FAL',
        model: 'kling-o1-reference-to-video',
        globallyPaused: false,
        dailyBudgetUsdMicros: 1_000_000,
        monthlyBudgetUsdMicros: 10_000_000,
        maxSceneCostUsdMicros: 300_000,
      },
      dailySpentUsdMicros,
      monthlySpentUsdMicros: 0,
    }),
  });

  it('allows an individually generated video only within its scene and daily cost limits', async () => {
    await expect(
      new AuthorizeVideoAiGenerationCost(policyRepository()).execute({
        environment: 'PRODUCTION',
        provider: 'FAL',
        model: 'kling-o1-reference-to-video',
        estimatedSceneCostsUsdMicros: [112_000, 112_000, 112_000],
        now: new Date('2026-08-31T12:00:00Z'),
      }),
    ).resolves.toMatchObject({ totalEstimatedCostUsdMicros: 336_000 });
  });

  it('blocks the next generation before it would exceed the daily limit', async () => {
    await expect(
      new AuthorizeVideoAiGenerationCost(policyRepository(900_000)).execute({
        environment: 'PRODUCTION',
        provider: 'FAL',
        model: 'kling-o1-reference-to-video',
        estimatedSceneCostsUsdMicros: [112_000],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'daily video provider budget reached' });
  });
});
