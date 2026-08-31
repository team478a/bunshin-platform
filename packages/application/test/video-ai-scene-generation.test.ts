/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import { QueueVideoSceneGenerations, type VideoSceneGenerationRepository } from '../src';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';

describe('QueueVideoSceneGenerations', () => {
  it('passes a provider, model and per-second cost estimate to the scoped repository', async () => {
    const repository: VideoSceneGenerationRepository = {
      enqueueAiScenes: vi.fn().mockResolvedValue([{ id: 'scene-generation-1' }]),
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
