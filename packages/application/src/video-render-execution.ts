import { ApplicationError } from '@bunshin/shared';

import type {
  VideoRenderExecutionResult,
  VideoRenderOutputStoragePort,
  VideoRenderProviderPort,
  VideoRenderRepository,
  VideoRenderWebhookPort,
  VideoSceneRenderSourcePort,
} from './video-core-contracts';
import {
  assertSupportedVideoComposition,
  validateVideoId,
  validateVideoText,
} from './video-core-validation';

export class QueueVideoRender {
  constructor(private readonly repository: VideoRenderRepository) {}
  async execute(input: Parameters<VideoRenderRepository['enqueueApproved']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    const provider = validateVideoText(input.provider, 'provider', 80);
    const value = await this.repository.enqueueApproved({
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
      provider,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video render queue conflict');
    return value;
  }
}

export class ExecuteVideoRenderStep {
  constructor(
    private readonly repository: VideoRenderRepository,
    private readonly provider: VideoRenderProviderPort,
    private readonly storage: VideoRenderOutputStoragePort,
    private readonly webhook: VideoRenderWebhookPort,
    private readonly sceneSources: VideoSceneRenderSourcePort,
    private readonly photoSources?: VideoSceneRenderSourcePort,
    private readonly generatedImageSources?: VideoSceneRenderSourcePort,
    private readonly backgroundAudioSources?: VideoSceneRenderSourcePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    renderId: string;
  }): Promise<VideoRenderExecutionResult> {
    const scope = {
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      renderId: validateVideoId(input.renderId, 'renderId'),
    };
    const value = await this.repository.findForExecution(scope);
    if (!value) throw new ApplicationError('NOT_FOUND', 'video render not found');
    if (value.render.provider !== 'CREATOMATE')
      throw new ApplicationError('CONFIGURATION_ERROR', 'unsupported video render provider');
    if (value.render.status === 'SUCCEEDED') return { status: 'SUCCEEDED', render: value.render };
    if (value.render.status === 'FAILED' || value.render.status === 'CANCELLED')
      return { status: 'FAILED', render: value.render };

    let render = value.render;
    if (render.status === 'QUEUED') {
      assertSupportedVideoComposition(value.project);
      const webhookUrl = await this.webhook.createUrl(scope);
      const aiSceneSources = await Promise.all(
        value.aiSceneSources.map(async (source) => ({
          videoSceneId: source.videoSceneId,
          url: await this.sceneSources.createUrl(source.storageKey),
        })),
      );
      const photoSceneSources = await Promise.all(
        (value.photoSceneSources ?? []).map(async (source) => {
          if (!this.photoSources)
            throw new ApplicationError('CONFIGURATION_ERROR', 'photo source unavailable');
          return {
            videoSceneId: source.videoSceneId,
            url: await this.photoSources.createUrl(source.storageKey),
          };
        }),
      );
      const generatedImageSceneSources = await Promise.all(
        (value.generatedImageSceneSources ?? []).map(async (source) => {
          if (!this.generatedImageSources)
            throw new ApplicationError('CONFIGURATION_ERROR', 'generated image source unavailable');
          return {
            videoSceneId: source.videoSceneId,
            url: await this.generatedImageSources.createUrl(source.storageKey),
          };
        }),
      );
      const backgroundAudioUrl = value.backgroundAudioSource
        ? await this.backgroundAudioSources?.createUrl(value.backgroundAudioSource.storageKey)
        : undefined;
      if (value.backgroundAudioSource && !backgroundAudioUrl)
        throw new ApplicationError('CONFIGURATION_ERROR', 'background audio source unavailable');
      const submitted = await this.provider.submit({
        renderId: render.id,
        project: value.project,
        aiSceneSources,
        photoSceneSources,
        generatedImageSceneSources,
        ...(backgroundAudioUrl
          ? {
              backgroundAudioUrl,
              backgroundAudioVolumePercent: value.backgroundAudioSource!.volumePercent,
            }
          : {}),
        webhookUrl,
      });
      const updated = await this.repository.markSubmitted({
        ...scope,
        externalJobId: validateVideoText(submitted.externalJobId, 'externalJobId', 255),
      });
      if (!updated) throw new ApplicationError('CONFLICT', 'video render transition conflict');
      return { status: 'PENDING', render: updated };
    }
    if (!render.externalJobId)
      throw new ApplicationError('CONFLICT', 'video render external job is missing');
    const inspected = await this.provider.inspect({ externalJobId: render.externalJobId });
    if (inspected.status === 'SUBMITTED' || inspected.status === 'RENDERING') {
      if (inspected.status === 'RENDERING') {
        const updated = await this.repository.markRendering(scope);
        if (updated) render = updated;
      }
      return { status: 'PENDING', render };
    }
    if (inspected.status === 'FAILED') {
      const failed = await this.repository.markFailed({
        ...scope,
        errorCode: validateVideoText(inspected.errorCode, 'errorCode', 80),
      });
      if (!failed) throw new ApplicationError('CONFLICT', 'video render transition conflict');
      return { status: 'FAILED', render: failed };
    }
    if (inspected.status !== 'SUCCEEDED')
      throw new ApplicationError('INTERNAL_ERROR', 'invalid video render status');
    const stored = await this.storage.store({
      ...scope,
      groupId: value.render.groupId,
      ownerUserId: value.render.ownerUserId,
      sourceUrl: inspected.outputUrl,
    });
    const succeeded = await this.repository.markSucceeded({
      ...scope,
      outputStorageKey: validateVideoText(stored.storageKey, 'outputStorageKey', 512),
    });
    if (!succeeded) throw new ApplicationError('CONFLICT', 'video render transition conflict');
    return { status: 'SUCCEEDED', render: succeeded };
  }
}
