import { assertSupportedVideoComposition } from '@bunshin/application';
import type {
  VideoRenderRepository,
  VideoSceneGenerationExecutionContext,
  VideoSceneGenerationRecord,
  VideoSceneGenerationRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
import { authorizedSocialImageVideoSources } from './social-image-video-sources';
import { authorizedVideoPhotos } from './video-photos';
import { finishVideoMedia, reserveVideoMedia, settleVideoSceneBatch } from './video-media-quota';
import { hasActiveVideoProjectEntitlement } from './video-project-entitlement';
import { assetRetentionExpiry, videoProjectRecord, videoRenderRecord } from './video-records';

const videoSceneGenerationRecord = (
  row: Prisma.VideoSceneGenerationGetPayload<object>,
): VideoSceneGenerationRecord => ({
  ...row,
  inputSnapshot: row.inputSnapshot as Record<string, unknown>,
});

export class PrismaVideoMediaQuotaRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async reserve(input: Parameters<typeof reserveVideoMedia>[1]) {
    await this.client.$transaction((tx) => reserveVideoMedia(tx, input));
  }
}

export class PrismaVideoSceneGenerationRepository implements VideoSceneGenerationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async enqueueAiScenes(input: Parameters<VideoSceneGenerationRepository['enqueueAiScenes']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: { in: ['APPROVED', 'QUEUED'] },
          group: { status: 'ACTIVE' },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
          },
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      if (!project) return null;
      if (
        !(await hasActiveVideoProjectEntitlement(
          tx,
          {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: project.groupMembershipId,
            socialImageGenerationRequestId: null,
          },
          now,
        ))
      )
        return null;
      const scenes = project.scenes.filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' ||
          (scene.aiProcessingTypes as unknown as string[]).includes('VIDEO_GENERATION'),
      );
      if (scenes.length === 0) return [];
      await reserveVideoMedia(tx, {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        videoProjectId: project.id,
        projectRevision: project.revision,
      });
      const rows = await Promise.all(
        scenes.map(async (scene) => {
          const estimatedCostUsdMicros = Math.round(
            (scene.durationMs / 1_000) * input.estimatedCostUsdMicrosPerSecond,
          );
          const characterSnapshot = project.characterProfileSnapshot as Record<string, unknown>;
          const characterName = characterSnapshot.name;
          const inputSnapshot: Prisma.InputJsonValue = {
            schemaVersion: 1,
            scene: {
              sceneNo: scene.sceneNo,
              durationMs: scene.durationMs,
              narration: scene.narration,
              caption: scene.caption,
              visualPrompt: scene.visualPrompt,
              keywords: scene.keywords as Prisma.InputJsonValue,
            },
            character: {
              name: typeof characterName === 'string' ? characterName : null,
              referenceImageCount: Array.isArray(project.characterReferenceSnapshot)
                ? project.characterReferenceSnapshot.length
                : 0,
            },
          };
          const existing = await tx.videoSceneGeneration.findUnique({
            where: {
              videoProjectId_projectRevision_videoSceneId_sceneRevision_provider_model: {
                videoProjectId: project.id,
                projectRevision: project.revision,
                videoSceneId: scene.id,
                sceneRevision: scene.revision,
                provider: input.provider,
                model: input.model,
              },
            },
          });
          if (existing) return existing;
          return tx.videoSceneGeneration.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: project.groupMembershipId,
              ownerUserId: input.actorUserId,
              videoProjectId: project.id,
              videoSceneId: scene.id,
              projectRevision: project.revision,
              sceneRevision: scene.revision,
              provider: input.provider,
              model: input.model,
              inputSnapshot,
              estimatedCostUsdMicros,
            },
          });
        }),
      );
      return rows.map(videoSceneGenerationRecord);
    });
  }

  async findForExecution(input: Parameters<VideoSceneGenerationRepository['findForExecution']>[0]) {
    const row = await this.client.videoSceneGeneration.findFirst({
      where: { id: input.generationId, workspaceId: input.workspaceId },
      include: { project: { select: { characterReferenceSnapshot: true } } },
    });
    if (!row) return null;
    const snapshot =
      row.inputSnapshot !== null &&
      typeof row.inputSnapshot === 'object' &&
      !Array.isArray(row.inputSnapshot)
        ? (row.inputSnapshot as Record<string, unknown>)
        : {};
    const scene =
      snapshot.scene !== null &&
      typeof snapshot.scene === 'object' &&
      !Array.isArray(snapshot.scene)
        ? (snapshot.scene as Record<string, unknown>)
        : {};
    const prompt = typeof scene.visualPrompt === 'string' ? scene.visualPrompt.trim() : '';
    const durationMs = typeof scene.durationMs === 'number' ? scene.durationMs : 0;
    if (!prompt || durationMs < 1 || durationMs > 10_000) return null;
    const references = Array.isArray(row.project.characterReferenceSnapshot)
      ? row.project.characterReferenceSnapshot
          .map((value) =>
            value !== null && typeof value === 'object' && !Array.isArray(value)
              ? (value as Record<string, unknown>).storageKey
              : null,
          )
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    return {
      generation: videoSceneGenerationRecord(row),
      prompt,
      durationSeconds: durationMs <= 5_000 ? 5 : 10,
      referenceStorageKeys: references.slice(0, 7),
    } satisfies VideoSceneGenerationExecutionContext;
  }

  async markSubmitted(input: Parameters<VideoSceneGenerationRepository['markSubmitted']>[0]) {
    const changed = await this.client.videoSceneGeneration.updateMany({
      where: { id: input.generationId, workspaceId: input.workspaceId, status: 'QUEUED' },
      data: {
        status: 'SUBMITTED',
        externalJobId: input.externalJobId,
        startedAt: new Date(),
        errorCode: null,
      },
    });
    if (changed.count !== 1) return null;
    const row = await this.client.videoSceneGeneration.findUniqueOrThrow({
      where: { id: input.generationId },
    });
    return videoSceneGenerationRecord(row);
  }

  async markGenerating(input: Parameters<VideoSceneGenerationRepository['markGenerating']>[0]) {
    const changed = await this.client.videoSceneGeneration.updateMany({
      where: {
        id: input.generationId,
        workspaceId: input.workspaceId,
        status: { in: ['SUBMITTED', 'GENERATING'] },
      },
      data: { status: 'GENERATING' },
    });
    if (changed.count !== 1) return null;
    const row = await this.client.videoSceneGeneration.findUniqueOrThrow({
      where: { id: input.generationId },
    });
    return videoSceneGenerationRecord(row);
  }

  async markSucceeded(input: Parameters<VideoSceneGenerationRepository['markSucceeded']>[0]) {
    return this.client.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT p.id FROM video_projects p
        JOIN video_scene_generations g ON g.video_project_id = p.id
        WHERE g.id = ${input.generationId}::uuid AND g.workspace_id = ${input.workspaceId}::uuid
        FOR UPDATE OF p`);
      const changed = await tx.videoSceneGeneration.updateMany({
        where: {
          id: input.generationId,
          workspaceId: input.workspaceId,
          status: { in: ['SUBMITTED', 'GENERATING'] },
        },
        data: {
          status: 'SUCCEEDED',
          outputStorageKey: input.outputStorageKey,
          completedAt: new Date(),
          expiresAt: assetRetentionExpiry(),
          errorCode: null,
        },
      });
      if (changed.count !== 1) return null;
      const row = await tx.videoSceneGeneration.findUniqueOrThrow({
        where: { id: input.generationId },
      });
      await settleVideoSceneBatch(tx, row);
      return videoSceneGenerationRecord(row);
    });
  }

  async markFailed(input: Parameters<VideoSceneGenerationRepository['markFailed']>[0]) {
    return this.client.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT p.id FROM video_projects p
        JOIN video_scene_generations g ON g.video_project_id = p.id
        WHERE g.id = ${input.generationId}::uuid AND g.workspace_id = ${input.workspaceId}::uuid
        FOR UPDATE OF p`);
      const changed = await tx.videoSceneGeneration.updateMany({
        where: {
          id: input.generationId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'SUBMITTED', 'GENERATING'] },
        },
        data: {
          status: 'FAILED',
          errorCode: input.errorCode.slice(0, 80),
          completedAt: new Date(),
        },
      });
      if (changed.count !== 1) return null;
      const row = await tx.videoSceneGeneration.findUniqueOrThrow({
        where: { id: input.generationId },
      });
      await settleVideoSceneBatch(tx, row);
      return videoSceneGenerationRecord(row);
    });
  }
}

export class PrismaVideoRenderRepository implements VideoRenderRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async enqueueApproved(input: Parameters<VideoRenderRepository['enqueueApproved']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: { in: ['APPROVED', 'QUEUED'] },
          group: { status: 'ACTIVE' },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
          },
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      if (!project) return null;
      if (
        !(await hasActiveVideoProjectEntitlement(
          tx,
          {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: project.groupMembershipId,
            socialImageGenerationRequestId: project.socialImageGenerationRequestId,
          },
          now,
        ))
      )
        return null;
      await authorizedVideoPhotos(tx, project, project.photoAssetIds ?? [], now);
      if (project.socialImageGenerationRequestId)
        await authorizedSocialImageVideoSources(
          tx,
          {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: project.groupMembershipId,
            ownerUserId: input.actorUserId,
            requestId: project.socialImageGenerationRequestId,
          },
          now,
        );
      assertSupportedVideoComposition(videoProjectRecord(project));
      const aiScenes = project.scenes.filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' ||
          (scene.aiProcessingTypes as unknown as string[]).includes('VIDEO_GENERATION'),
      );
      if (!project.standardComposition && aiScenes.length > 0) {
        const completedScenes = await tx.videoSceneGeneration.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            ownerUserId: input.actorUserId,
            videoProjectId: project.id,
            projectRevision: project.revision,
            status: 'SUCCEEDED',
            outputStorageKey: { not: null },
          },
          select: { videoSceneId: true, sceneRevision: true },
        });
        const completed = new Set(
          completedScenes.map((scene) => `${scene.videoSceneId}:${scene.sceneRevision}`),
        );
        if (aiScenes.some((scene) => !completed.has(`${scene.id}:${scene.revision}`))) return null;
      }
      const existing = await tx.videoRender.findUnique({
        where: {
          videoProjectId_projectRevision: {
            videoProjectId: project.id,
            projectRevision: input.expectedRevision,
          },
        },
      });
      if (existing) return videoRenderRecord(existing);
      if (project.status !== 'APPROVED') return null;
      await reserveVideoMedia(tx, {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        videoProjectId: project.id,
        projectRevision: project.revision,
      });
      const changed = await tx.videoProject.updateMany({
        where: { id: project.id, revision: input.expectedRevision, status: 'APPROVED' },
        data: { status: 'QUEUED' },
      });
      if (changed.count !== 1) return null;
      const row = await tx.videoRender.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: project.groupMembershipId,
          ownerUserId: input.actorUserId,
          videoProjectId: project.id,
          projectRevision: input.expectedRevision,
          provider: input.provider,
        },
      });
      return videoRenderRecord(row);
    });
  }

  async findForExecution(input: Parameters<VideoRenderRepository['findForExecution']>[0]) {
    const row = await this.client.videoRender.findFirst({
      where: { id: input.renderId, workspaceId: input.workspaceId },
      include: { project: { include: { scenes: { orderBy: { sceneNo: 'asc' } } } } },
    });
    if (!row) return null;
    const aiSceneIds = row.project.scenes
      .filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' ||
          (scene.aiProcessingTypes as unknown as string[]).includes('VIDEO_GENERATION'),
      )
      .map((scene) => ({ id: scene.id, revision: scene.revision }));
    const outputs =
      aiSceneIds.length === 0
        ? []
        : await this.client.videoSceneGeneration.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: row.groupId,
              ownerUserId: row.ownerUserId,
              videoProjectId: row.videoProjectId,
              projectRevision: row.projectRevision,
              status: 'SUCCEEDED',
              outputStorageKey: { not: null },
              OR: aiSceneIds.map((scene) => ({
                videoSceneId: scene.id,
                sceneRevision: scene.revision,
              })),
            },
            select: { videoSceneId: true, outputStorageKey: true },
          });
    const aiSceneSources = outputs.flatMap((output) =>
      output.outputStorageKey
        ? [{ videoSceneId: output.videoSceneId, storageKey: output.outputStorageKey }]
        : [],
    );
    if (!row.project.standardComposition && aiSceneSources.length !== aiSceneIds.length)
      return null;
    const photos =
      row.status === 'QUEUED'
        ? await authorizedVideoPhotos(this.client, row, row.project.photoAssetIds ?? [])
        : [];
    const photoSceneSources =
      row.status === 'QUEUED'
        ? row.project.scenes
            .filter((scene) => scene.visualType === 'USER_ASSET')
            .map((scene) => {
              const photo = photos.find((item) => item.id === (scene.keywords as string[])[0]);
              if (!photo)
                throw new ApplicationError(
                  'VALIDATION_ERROR',
                  '写真を選び直して企画を再作成してください。',
                );
              return { videoSceneId: scene.id, storageKey: photo.storageKey };
            })
        : [];
    const generatedImages =
      row.status === 'QUEUED' && row.project.socialImageGenerationRequestId
        ? await authorizedSocialImageVideoSources(this.client, {
            workspaceId: input.workspaceId,
            groupId: row.groupId,
            groupMembershipId: row.groupMembershipId,
            ownerUserId: row.ownerUserId,
            requestId: row.project.socialImageGenerationRequestId,
          })
        : [];
    const generatedImageSceneSources =
      row.status === 'QUEUED'
        ? row.project.scenes
            .filter((scene) => scene.visualType === 'GENERATED_IMAGE')
            .map((scene) => {
              const image = generatedImages.find(
                (item) => item.id === (scene.keywords as string[])[0],
              );
              if (!image)
                throw new ApplicationError(
                  'VALIDATION_ERROR',
                  '投稿画像を選び直して動画を再作成してください。',
                );
              return { videoSceneId: scene.id, storageKey: image.completedStorageKey };
            })
        : [];
    const savedSnapshot = row.project.disclosureSnapshot;
    const snapshot =
      savedSnapshot && typeof savedSnapshot === 'object' && !Array.isArray(savedSnapshot)
        ? (savedSnapshot as Record<string, unknown>)
        : {};
    const backgroundMusic =
      snapshot.backgroundMusic &&
      typeof snapshot.backgroundMusic === 'object' &&
      !Array.isArray(snapshot.backgroundMusic)
        ? (snapshot.backgroundMusic as Record<string, unknown>)
        : null;
    const backgroundMusicAssetId =
      typeof backgroundMusic?.assetId === 'string' ? backgroundMusic.assetId : null;
    const backgroundMusicVolume =
      typeof backgroundMusic?.volumePercent === 'number' &&
      Number.isInteger(backgroundMusic.volumePercent) &&
      backgroundMusic.volumePercent >= 5 &&
      backgroundMusic.volumePercent <= 30
        ? backgroundMusic.volumePercent
        : 12;
    const backgroundAudio =
      row.status === 'QUEUED' && backgroundMusicAssetId
        ? await this.client.videoAsset.findFirst({
            where: {
              id: backgroundMusicAssetId,
              workspaceId: input.workspaceId,
              groupId: row.groupId,
              kind: 'AUDIO',
              status: 'READY',
              deletedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { storageKey: true },
          })
        : null;
    if (row.status === 'QUEUED' && backgroundMusicAssetId && !backgroundAudio)
      throw new ApplicationError('VALIDATION_ERROR', 'BGMを選び直して動画を再作成してください。');
    return {
      render: videoRenderRecord(row),
      project: videoProjectRecord(row.project),
      aiSceneSources,
      photoSceneSources,
      generatedImageSceneSources,
      ...(backgroundAudio
        ? {
            backgroundAudioSource: {
              storageKey: backgroundAudio.storageKey,
              volumePercent: backgroundMusicVolume,
            },
          }
        : {}),
    };
  }

  async markSubmitted(input: Parameters<VideoRenderRepository['markSubmitted']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: { id: input.renderId, workspaceId: input.workspaceId, status: 'QUEUED' },
        data: {
          status: 'SUBMITTED',
          externalJobId: input.externalJobId,
          startedAt: new Date(),
          errorCode: null,
        },
      });
      if (changed.count !== 1) return null;
      const render = await tx.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
      await tx.videoProject.updateMany({
        where: {
          id: render.videoProjectId,
          workspaceId: input.workspaceId,
          status: 'QUEUED',
        },
        data: { status: 'RENDERING' },
      });
      return videoRenderRecord(render);
    });
  }

  async markRendering(input: Parameters<VideoRenderRepository['markRendering']>[0]) {
    const changed = await this.client.videoRender.updateMany({
      where: {
        id: input.renderId,
        workspaceId: input.workspaceId,
        status: { in: ['SUBMITTED', 'RENDERING'] },
      },
      data: { status: 'RENDERING' },
    });
    if (changed.count !== 1) return null;
    return videoRenderRecord(
      await this.client.videoRender.findUniqueOrThrow({ where: { id: input.renderId } }),
    );
  }

  async markSucceeded(input: Parameters<VideoRenderRepository['markSucceeded']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: {
          id: input.renderId,
          workspaceId: input.workspaceId,
          status: { in: ['SUBMITTED', 'RENDERING'] },
        },
        data: {
          status: 'SUCCEEDED',
          outputStorageKey: input.outputStorageKey,
          completedAt: new Date(),
          expiresAt: assetRetentionExpiry(),
          errorCode: null,
        },
      });
      if (changed.count !== 1) return null;
      const render = await tx.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
      await finishVideoMedia(tx, render, 'CONSUMED');
      await tx.videoProject.updateMany({
        where: { id: render.videoProjectId, workspaceId: input.workspaceId, status: 'RENDERING' },
        data: { status: 'READY_FOR_REVIEW' },
      });
      return videoRenderRecord(render);
    });
  }

  async markFailed(input: Parameters<VideoRenderRepository['markFailed']>[0]) {
    return this.client.$transaction(async (tx) => {
      const changed = await tx.videoRender.updateMany({
        where: {
          id: input.renderId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'SUBMITTED', 'RENDERING'] },
        },
        data: { status: 'FAILED', errorCode: input.errorCode, completedAt: new Date() },
      });
      if (changed.count !== 1) return null;
      const render = await tx.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
      await finishVideoMedia(tx, render, 'RELEASED');
      await tx.videoProject.updateMany({
        where: {
          id: render.videoProjectId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'RENDERING'] },
        },
        data: { status: 'FAILED' },
      });
      return videoRenderRecord(render);
    });
  }
}
