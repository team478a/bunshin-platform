import { ApplicationError } from '@bunshin/shared';

import {
  DEFAULT_VIDEO_NARRATION_SPEED,
  DEFAULT_VIDEO_NARRATION_VOICE,
  VIDEO_NARRATION_SPEEDS,
  VIDEO_NARRATION_VOICES,
  type VideoPlanGeneratorPort,
  type VideoPlanningContextRepository,
  type VideoProjectRepository,
  type VideoProjectReviewRepository,
  type VideoReviewReason,
} from './video-core-contracts';
import {
  assertSupportedVideoComposition,
  validateVideoAiTypes,
  validateVideoId,
  validateVideoText,
} from './video-core-validation';

export * from './video-core-contracts';
export {
  assertSupportedVideoComposition,
  isSupportedVideoComposition,
} from './video-core-validation';
export { ExecuteVideoRenderStep, QueueVideoRender } from './video-render-execution';

export class CreateVideoProject {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['create']>[0]) {
    if (![25, 30, 60].includes(input.durationSeconds))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid durationSeconds');
    const photoAssetIds = (input.photoAssetIds ?? []).map((value) =>
      validateVideoId(value, 'photoAssetId'),
    );
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
        ? validateVideoId(input.socialImageGenerationRequestId, 'socialImageGenerationRequestId')
        : null,
      ...(input.id ? { id: validateVideoId(input.id, 'id') } : {}),
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      groupMembershipId: validateVideoId(input.groupMembershipId, 'groupMembershipId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      bunshinId: validateVideoId(input.bunshinId, 'bunshinId'),
      campaignId: input.campaignId ? validateVideoId(input.campaignId, 'campaignId') : null,
      characterProfileVersionId: input.characterProfileVersionId
        ? validateVideoId(input.characterProfileVersionId, 'characterProfileVersionId')
        : null,
      title: validateVideoText(input.title, 'title', 160),
      standardComposition: input.standardComposition,
      aiProcessingTypes: validateVideoAiTypes(input.aiProcessingTypes),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'video project unavailable');
    return value;
  }
}

export class GetVideoProject {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['findOwned']>[0]) {
    const value = await this.repository.findOwned({
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'video project not found');
    return value;
  }
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
      const types = validateVideoAiTypes(scene.aiProcessingTypes);
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
      const narration = validateVideoText(scene.narration, 'narration', 2_000);
      if (
        input.projectAiProcessingTypes.includes('VOICE_SYNTHESIS') &&
        Array.from(narration).length > Math.floor((scene.durationMs / 1_000) * 3)
      )
        throw new ApplicationError('VALIDATION_ERROR', 'narration exceeds the scene duration');
      return {
        ...scene,
        narration,
        caption: validateVideoText(scene.caption, 'caption', 240),
        visualPrompt,
        keywords: [
          ...new Set(scene.keywords.map((keyword) => validateVideoText(keyword, 'keyword', 80))),
        ].slice(0, 20),
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
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
      scenes,
      projectAiProcessingTypes: validateVideoAiTypes(input.projectAiProcessingTypes),
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
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
    };
    const sceneId = validateVideoId(input.sceneId, 'sceneId');
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
          scene.id === sceneId
            ? validateVideoText(input.narration, 'narration', 2_000)
            : scene.narration,
        caption:
          scene.id === sceneId ? validateVideoText(input.caption, 'caption', 240) : scene.caption,
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
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
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
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
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
        ? validateVideoText(input.reviewNote, 'reviewNote', 500)
        : null;
    const value = await this.repository.review({
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
      action: input.action,
      reviewReason,
      reviewNote,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video review conflict');
    return value;
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
      workspaceId: validateVideoId(input.workspaceId, 'workspaceId'),
      groupId: validateVideoId(input.groupId, 'groupId'),
      actorUserId: validateVideoId(input.actorUserId, 'actorUserId'),
      videoProjectId: validateVideoId(input.videoProjectId, 'videoProjectId'),
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
