/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizeVideoAiGenerationCost,
  ExecuteVideoSceneGenerationStep,
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
      claimProviderSubmission: vi.fn(),
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
      claimProviderSubmission: vi.fn(),
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

describe('ExecuteVideoSceneGenerationStep', () => {
  it('claims a Runway submission before the paid provider request', async () => {
    const generation = {
      id: 'scene-generation-1',
      workspaceId,
      groupId,
      groupMembershipId: 'membership-1',
      ownerUserId: userId,
      videoProjectId: projectId,
      videoSceneId: 'scene-1',
      projectRevision: 3,
      sceneRevision: 1,
      provider: 'RUNWAY',
      model: 'runway-test-model',
      status: 'QUEUED' as const,
      inputSnapshot: {},
      estimatedCostUsdMicros: 112_000,
      actualCostUsdMicros: null,
      externalJobId: null,
      outputStorageKey: null,
      errorCode: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const claimProviderSubmission = vi.fn().mockResolvedValue({
      ...generation,
      status: 'SUBMISSION_UNKNOWN',
    });
    const markSubmitted = vi.fn().mockResolvedValue({
      ...generation,
      status: 'SUBMITTED',
      externalJobId: 'runway-request-1',
    });
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn(),
      findForExecution: vi.fn().mockResolvedValue({
        generation,
        prompt: 'fictional scene',
        durationSeconds: 5,
        referenceStorageKeys: ['fictional/reference.png'],
      }),
      claimProviderSubmission,
      markSubmitted,
      markGenerating: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    const submit = vi.fn().mockResolvedValue({ externalJobId: 'runway-request-1' });
    await expect(
      new ExecuteVideoSceneGenerationStep(
        repository,
        { submit, inspect: vi.fn() },
        {
          createTemporaryReadUrls: vi.fn().mockResolvedValue(['https://example.invalid/reference']),
        },
        { store: vi.fn() },
      ).execute({ workspaceId, generationId: generation.id }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(claimProviderSubmission).toHaveBeenCalledWith({
      workspaceId,
      generationId: generation.id,
      provider: 'RUNWAY',
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(markSubmitted).toHaveBeenCalledWith({
      workspaceId,
      generationId: generation.id,
      externalJobId: 'runway-request-1',
    });
  });

  it('does not submit a paid provider request without a private character reference', async () => {
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn(),
      findForExecution: vi.fn().mockResolvedValue({
        generation: {
          id: 'scene-generation-1',
          workspaceId,
          groupId,
          groupMembershipId: 'membership-1',
          ownerUserId: userId,
          videoProjectId: projectId,
          videoSceneId: 'scene-1',
          projectRevision: 3,
          sceneRevision: 1,
          provider: 'FAL',
          model: 'fal-ai/kling-video/o1/reference-to-video',
          status: 'QUEUED',
          inputSnapshot: {},
          estimatedCostUsdMicros: 112_000,
          actualCostUsdMicros: null,
          externalJobId: null,
          outputStorageKey: null,
          errorCode: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        prompt: 'short video prompt',
        durationSeconds: 5,
        referenceStorageKeys: [],
      }),
      markSubmitted: vi.fn(),
      claimProviderSubmission: vi.fn(),
      markGenerating: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    const createTemporaryReadUrls = vi.fn();
    const submit = vi.fn();
    await expect(
      new ExecuteVideoSceneGenerationStep(
        repository,
        { submit, inspect: vi.fn() },
        { createTemporaryReadUrls },
        { store: vi.fn() },
      ).execute({ workspaceId, generationId: 'scene-generation-1' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'character reference image is required',
    });
    expect(createTemporaryReadUrls).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('allows xAI text-to-video without creating reference URLs and still claims before POST', async () => {
    const generation = {
      id: 'scene-generation-1',
      workspaceId,
      groupId,
      groupMembershipId: 'membership-1',
      ownerUserId: userId,
      videoProjectId: projectId,
      videoSceneId: 'scene-1',
      projectRevision: 3,
      sceneRevision: 1,
      provider: 'XAI',
      model: 'grok-imagine-video-1.5',
      status: 'QUEUED' as const,
      inputSnapshot: {},
      estimatedCostUsdMicros: 700_000,
      actualCostUsdMicros: null,
      externalJobId: null,
      outputStorageKey: null,
      errorCode: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const createTemporaryReadUrls = vi.fn();
    const claimProviderSubmission = vi.fn().mockResolvedValue({
      ...generation,
      status: 'SUBMISSION_UNKNOWN',
    });
    const submit = vi.fn().mockResolvedValue({ externalJobId: 'xai-request-1' });
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn(),
      findForExecution: vi.fn().mockResolvedValue({
        generation,
        prompt: 'vertical text-to-video scene',
        durationSeconds: 5,
        referenceStorageKeys: [],
      }),
      claimProviderSubmission,
      markSubmitted: vi.fn().mockResolvedValue({
        ...generation,
        status: 'SUBMITTED',
        externalJobId: 'xai-request-1',
      }),
      markGenerating: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };

    await expect(
      new ExecuteVideoSceneGenerationStep(
        repository,
        { submit, inspect: vi.fn() },
        { createTemporaryReadUrls },
        { store: vi.fn() },
      ).execute({ workspaceId, generationId: generation.id }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(createTemporaryReadUrls).not.toHaveBeenCalled();
    expect(claimProviderSubmission).toHaveBeenCalledWith({
      workspaceId,
      generationId: generation.id,
      provider: 'XAI',
    });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ referenceImageUrls: [] }));
  });

  it('persists the exact xAI billed cost only when the completed output is stored', async () => {
    const generation = {
      id: 'scene-generation-1',
      workspaceId,
      groupId,
      groupMembershipId: 'membership-1',
      ownerUserId: userId,
      videoProjectId: projectId,
      videoSceneId: 'scene-1',
      projectRevision: 3,
      sceneRevision: 1,
      provider: 'XAI',
      model: 'grok-imagine-video-1.5',
      status: 'GENERATING' as const,
      inputSnapshot: {},
      estimatedCostUsdMicros: 700_000,
      actualCostUsdMicros: null,
      externalJobId: 'xai-request-1',
      outputStorageKey: null,
      errorCode: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const markSucceeded = vi.fn().mockResolvedValue({
      ...generation,
      status: 'SUCCEEDED',
      outputStorageKey: 'stored/result.mp4',
      actualCostUsdMicros: 50_000,
    });
    const store = vi.fn().mockResolvedValue({ storageKey: 'stored/result.mp4' });
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn(),
      findForExecution: vi.fn().mockResolvedValue({
        generation,
        prompt: 'completed scene',
        durationSeconds: 5,
        referenceStorageKeys: [],
      }),
      claimProviderSubmission: vi.fn(),
      markSubmitted: vi.fn(),
      markGenerating: vi.fn(),
      markSucceeded,
      markFailed: vi.fn(),
    };

    await expect(
      new ExecuteVideoSceneGenerationStep(
        repository,
        {
          submit: vi.fn(),
          inspect: vi.fn().mockResolvedValue({
            status: 'SUCCEEDED',
            outputUrl: 'https://vidgen.x.ai/result.mp4',
            actualCostUsdMicros: 50_000,
          }),
        },
        { createTemporaryReadUrls: vi.fn() },
        { store },
      ).execute({ workspaceId, generationId: generation.id }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: 'https://vidgen.x.ai/result.mp4' }),
    );
    expect(markSucceeded).toHaveBeenCalledWith({
      workspaceId,
      generationId: generation.id,
      outputStorageKey: 'stored/result.mp4',
      actualCostUsdMicros: 50_000,
    });
  });
});
