import { ApplicationError } from '@bunshin/shared';

import {
  DEFAULT_VIDEO_NARRATION_SPEED,
  DEFAULT_VIDEO_NARRATION_VOICE,
  VIDEO_NARRATION_SPEEDS,
  VIDEO_NARRATION_VOICES,
  type VideoAiProcessingType,
  type VideoPlanGeneratorPort,
  type VideoPlanningContextRepository,
  type VideoProjectRepository,
  type VideoProjectReviewRepository,
  type VideoRenderExecutionResult,
  type VideoRenderOutputStoragePort,
  type VideoRenderProviderPort,
  type VideoRenderRepository,
  type VideoRenderWebhookPort,
  type VideoReviewReason,
  type VideoSceneRenderSourcePort,
} from './video-core-contracts';

export * from './video-core-contracts';

const validAiTypes = new Set<VideoAiProcessingType>([
  'SCRIPT_GENERATION',
  'VOICE_SYNTHESIS',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
  'AUTOMATIC_ASSET_SELECTION',
]);
const id = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};
const text = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};
const aiTypes = (values: VideoAiProcessingType[]) => {
  const unique = [...new Set(values)];
  if (unique.length > validAiTypes.size || unique.some((value) => !validAiTypes.has(value)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid aiProcessingTypes');
  return unique;
};

export class CreateVideoProject {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['create']>[0]) {
    if (![25, 30, 60].includes(input.durationSeconds))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid durationSeconds');
    const photoAssetIds = (input.photoAssetIds ?? []).map((value) => id(value, 'photoAssetId'));
    const narrationVoice = input.narrationVoice ?? DEFAULT_VIDEO_NARRATION_VOICE;
    if (!VIDEO_NARRATION_VOICES.includes(narrationVoice))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid narrationVoice');
    const narrationSpeed = input.narrationSpeed ?? DEFAULT_VIDEO_NARRATION_SPEED;
    if (!VIDEO_NARRATION_SPEEDS.includes(narrationSpeed))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid narrationSpeed');
    if (
      photoAssetIds.length > 5 ||
      new Set(photoAssetIds).size !== photoAssetIds.length ||
      (!input.standardComposition && photoAssetIds.length > 0) ||
      (input.type === 'PHOTO_SLIDESHOW' &&
        photoAssetIds.length === 0 &&
        !input.socialImageGenerationRequestId)
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '写真動画は標準動画で1〜5枚の写真を選択してください。',
      );
    const value = await this.repository.create({
      ...input,
      photoAssetIds,
      narrationVoice,
      narrationSpeed,
      socialImageGenerationRequestId: input.socialImageGenerationRequestId
        ? id(input.socialImageGenerationRequestId, 'socialImageGenerationRequestId')
        : null,
      ...(input.id ? { id: id(input.id, 'id') } : {}),
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      groupMembershipId: id(input.groupMembershipId, 'groupMembershipId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      bunshinId: id(input.bunshinId, 'bunshinId'),
      campaignId: input.campaignId ? id(input.campaignId, 'campaignId') : null,
      characterProfileVersionId: input.characterProfileVersionId
        ? id(input.characterProfileVersionId, 'characterProfileVersionId')
        : null,
      title: text(input.title, 'title', 160),
      standardComposition: input.standardComposition,
      aiProcessingTypes: aiTypes(input.aiProcessingTypes),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'video project unavailable');
    return value;
  }
}

export class GetVideoProject {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['findOwned']>[0]) {
    const value = await this.repository.findOwned({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'video project not found');
    return value;
  }
}

export function isSupportedVideoComposition(input: {
  scenes: Array<{ visualType: string; aiProcessingTypes: string[] }>;
  aiProcessingTypes: string[];
}) {
  const supported = new Set(['SCRIPT_GENERATION', 'VIDEO_GENERATION', 'VOICE_SYNTHESIS']);
  return (
    input.aiProcessingTypes.every((type) => supported.has(type)) &&
    input.scenes.every(
      (scene) =>
        ['TEXT_MOTION', 'AI_VIDEO', 'USER_ASSET', 'GENERATED_IMAGE'].includes(scene.visualType) &&
        scene.aiProcessingTypes.every((type) => supported.has(type)),
    )
  );
}

export function assertSupportedVideoComposition(
  input: Parameters<typeof isSupportedVideoComposition>[0],
) {
  if (!isSupportedVideoComposition(input))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      '写真・音声を含む動画は準備中です。企画を作り直し、字幕動画をご利用ください。',
    );
}

export class ReplaceVideoPlan {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['replacePlan']>[0]) {
    const count = input.scenes.length;
    const durationSeconds = input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0) / 1000;
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    if (![25, 30, 60].includes(durationSeconds))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'scene duration total must be 25, 30 or 60 seconds',
      );
    if (
      (durationSeconds === 25 && count !== 5) ||
      (durationSeconds === 30 && (count < 5 || count > 7)) ||
      (durationSeconds === 60 && (count < 8 || count > 12))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid scene count');
    const sceneNumbers = new Set<number>();
    const scenes = input.scenes.map((scene) => {
      if (!Number.isInteger(scene.sceneNo) || scene.sceneNo < 1 || sceneNumbers.has(scene.sceneNo))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid sceneNo');
      sceneNumbers.add(scene.sceneNo);
      if (
        !Number.isInteger(scene.durationMs) ||
        scene.durationMs < 500 ||
        scene.durationMs > 60_000
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid scene duration');
      const types = aiTypes(scene.aiProcessingTypes);
      if (
        input.standardComposition &&
        (scene.visualType === 'AI_VIDEO' || types.includes('VIDEO_GENERATION'))
      )
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'standard composition cannot contain AI video',
        );
      const visualPrompt = scene.visualPrompt?.trim() || null;
      if (
        !input.standardComposition &&
        (scene.visualType === 'AI_VIDEO' || types.includes('VIDEO_GENERATION')) &&
        (!visualPrompt || ![5_000, 10_000].includes(scene.durationMs))
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid AI video scene');
      const narration = text(scene.narration, 'narration', 2_000);
      if (
        input.projectAiProcessingTypes.includes('VOICE_SYNTHESIS') &&
        Array.from(narration).length > Math.floor((scene.durationMs / 1_000) * 3)
      )
        throw new ApplicationError('VALIDATION_ERROR', 'narration exceeds the scene duration');
      return {
        ...scene,
        narration,
        caption: text(scene.caption, 'caption', 240),
        visualPrompt,
        keywords: [...new Set(scene.keywords.map((keyword) => text(keyword, 'keyword', 80)))].slice(
          0,
          20,
        ),
        aiProcessingTypes: types,
      };
    });
    if ([...sceneNumbers].sort((a, b) => a - b).some((value, index) => value !== index + 1))
      throw new ApplicationError('VALIDATION_ERROR', 'scene numbers must be consecutive');
    const aiVideoSceneCount = scenes.filter((scene) => scene.visualType === 'AI_VIDEO').length;
    if (aiVideoSceneCount !== input.aiVideoSceneCount)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid aiVideoSceneCount');
    assertSupportedVideoComposition({ scenes, aiProcessingTypes: input.projectAiProcessingTypes });
    const value = await this.repository.replacePlan({
      ...input,
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      scenes,
      projectAiProcessingTypes: aiTypes(input.projectAiProcessingTypes),
      aiVideoSceneCount,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video project revision conflict');
    return value;
  }
}

export class UpdateVideoSceneDraft {
  constructor(private readonly repository: VideoProjectRepository) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    sceneId: string;
    expectedRevision: number;
    narration: string;
    caption: string;
  }) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    const scope = {
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
    };
    const sceneId = id(input.sceneId, 'sceneId');
    const project = await this.repository.findOwned(scope);
    if (
      !project ||
      project.status !== 'WAITING_APPROVAL' ||
      project.revision !== input.expectedRevision
    )
      throw new ApplicationError('CONFLICT', 'video scene revision is unavailable');
    if (!project.scenes.some((scene) => scene.id === sceneId))
      throw new ApplicationError('NOT_FOUND', 'video scene not found');

    return new ReplaceVideoPlan(this.repository).execute({
      ...scope,
      expectedRevision: input.expectedRevision,
      scenes: project.scenes.map((scene) => ({
        sceneNo: scene.sceneNo,
        durationMs: scene.durationMs,
        narration:
          scene.id === sceneId ? text(input.narration, 'narration', 2_000) : scene.narration,
        caption: scene.id === sceneId ? text(input.caption, 'caption', 240) : scene.caption,
        visualType: scene.visualType,
        visualPrompt: scene.visualPrompt,
        keywords: scene.keywords,
        aiProcessingTypes: scene.aiProcessingTypes,
        locked: scene.locked,
      })),
      projectAiProcessingTypes: project.aiProcessingTypes,
      standardComposition: project.standardComposition,
      aiVideoSceneCount: project.aiVideoSceneCount,
    });
  }
}

export class UpdateVideoNarrationSettings {
  constructor(private readonly repository: VideoProjectRepository) {}

  async execute(input: Parameters<VideoProjectRepository['updateNarrationSettings']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    if (!VIDEO_NARRATION_VOICES.includes(input.voice))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid narration voice');
    if (!VIDEO_NARRATION_SPEEDS.includes(input.speed))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid narration speed');
    const value = await this.repository.updateNarrationSettings({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
      voice: input.voice,
      speed: input.speed,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video narration settings conflict');
    return value;
  }
}

export class ApproveVideoPlan {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['approvePlan']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    const value = await this.repository.approvePlan({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video project approval conflict');
    return value;
  }
}

export class ReviewFinishedVideo {
  constructor(private readonly repository: VideoProjectReviewRepository) {}

  async execute(input: Parameters<VideoProjectReviewRepository['review']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    if (!['ADOPT', 'REVISE'].includes(input.action))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid review action');
    const allowedReasons = new Set<VideoReviewReason>([
      'NARRATION_HARD_TO_HEAR',
      'AI_VOICE_UNNATURAL',
      'CONTENT_MISMATCH',
      'VISUAL_UNNATURAL',
      'TOO_LONG',
      'OTHER',
    ]);
    if (
      input.action === 'REVISE' &&
      (!input.reviewReason || !allowedReasons.has(input.reviewReason))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reviewReason');
    const reviewReason = input.action === 'REVISE' ? input.reviewReason : null;
    const reviewNote =
      input.action === 'REVISE' && input.reviewNote
        ? text(input.reviewNote, 'reviewNote', 500)
        : null;
    const value = await this.repository.review({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
      action: input.action,
      reviewReason,
      reviewNote,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video review conflict');
    return value;
  }
}

export class QueueVideoRender {
  constructor(private readonly repository: VideoRenderRepository) {}
  async execute(input: Parameters<VideoRenderRepository['enqueueApproved']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    const provider = text(input.provider, 'provider', 80);
    const value = await this.repository.enqueueApproved({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
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
      workspaceId: id(input.workspaceId, 'workspaceId'),
      renderId: id(input.renderId, 'renderId'),
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
        externalJobId: text(submitted.externalJobId, 'externalJobId', 255),
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
        errorCode: text(inspected.errorCode, 'errorCode', 80),
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
      outputStorageKey: text(stored.storageKey, 'outputStorageKey', 512),
    });
    if (!succeeded) throw new ApplicationError('CONFLICT', 'video render transition conflict');
    return { status: 'SUCCEEDED', render: succeeded };
  }
}

export class GenerateVideoPlan {
  constructor(
    private readonly projects: VideoProjectRepository,
    private readonly contexts: VideoPlanningContextRepository,
    private readonly generator: VideoPlanGeneratorPort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
  }) {
    const scope = {
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
    };
    const project = await this.projects.findOwned(scope);
    if (!project) throw new ApplicationError('NOT_FOUND', 'video project not found');
    if (project.revision !== input.expectedRevision)
      throw new ApplicationError('CONFLICT', 'video project revision conflict');
    const context = await this.contexts.findAuthorized({
      ...scope,
      bunshinId: project.bunshinId,
      campaignId: project.campaignId,
    });
    if (!context) throw new ApplicationError('FORBIDDEN', 'video planning context unavailable');
    const generated = await this.generator.generate({
      project: {
        title: project.title,
        platform: project.platform,
        type: project.type,
        durationSeconds: project.durationSeconds,
        standardComposition: project.standardComposition,
      },
      context,
    });
    const saved = await new ReplaceVideoPlan(this.projects).execute({
      ...scope,
      expectedRevision: input.expectedRevision,
      scenes: generated.output.scenes.map((scene, index) => ({
        ...scene,
        locked: false,
        ...(project.photoAssetIds?.length
          ? {
              visualType: 'USER_ASSET' as const,
              keywords: [project.photoAssetIds[index % project.photoAssetIds.length]!],
            }
          : {}),
      })),
      projectAiProcessingTypes: [
        ...generated.output.projectAiProcessingTypes,
        ...(project.narrationEnabled ? ['VOICE_SYNTHESIS' as const] : []),
      ],
      standardComposition: project.standardComposition,
      aiVideoSceneCount: generated.output.scenes.filter((scene) => scene.visualType === 'AI_VIDEO')
        .length,
    });
    return { project: saved, generation: generated };
  }
}
