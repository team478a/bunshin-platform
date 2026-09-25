import type {
  VideoSceneGenerationExecutionContext,
  VideoSceneGenerationRecord,
  VideoSceneGenerationRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { reserveVideoMedia, settleVideoSceneBatch } from './video-media-quota';
import { hasActiveVideoProjectEntitlement } from './video-project-entitlement';
import { assetRetentionExpiry } from './video-records';

const videoSceneGenerationRecord = (
  row: Prisma.VideoSceneGenerationGetPayload<object>,
): VideoSceneGenerationRecord => ({
  ...row,
  inputSnapshot: row.inputSnapshot as Record<string, unknown>,
});

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
