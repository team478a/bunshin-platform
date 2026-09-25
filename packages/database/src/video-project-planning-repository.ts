import type { VideoProjectRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from './client';
import { authorizedSocialImageVideoSources } from './social-image-video-sources';
import { hasActiveVideoProjectEntitlement } from './video-project-entitlement';
import { videoProjectRecord } from './video-records';

export class PrismaVideoProjectPlanningRepository {
  constructor(private readonly client: PrismaClient) {}

  async findOwned(input: Parameters<VideoProjectRepository['findOwned']>[0]) {
    const now = new Date();
    const row = await this.client.videoProject.findFirst({
      where: {
        id: input.videoProjectId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        group: { status: 'ACTIVE' },
        groupMembership: {
          userId: input.actorUserId,
          status: 'ACTIVE',
        },
      },
      include: { scenes: { orderBy: { sceneNo: 'asc' } } },
    });
    if (!row) return null;
    if (
      !(await hasActiveVideoProjectEntitlement(
        this.client,
        {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          socialImageGenerationRequestId: row.socialImageGenerationRequestId,
        },
        now,
      ))
    )
      return null;
    return videoProjectRecord(row);
  }

  async replacePlan(input: Parameters<VideoProjectRepository['replacePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: { in: ['DRAFT', 'PLANNING', 'WAITING_APPROVAL'] },
          group: { status: 'ACTIVE' },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
          },
        },
        select: {
          id: true,
          groupMembershipId: true,
          durationSeconds: true,
          photoAssetIds: true,
          narrationEnabled: true,
          socialImageGenerationRequestId: true,
        },
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
      const socialImages = project.socialImageGenerationRequestId
        ? await authorizedSocialImageVideoSources(
            tx,
            {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: project.groupMembershipId,
              ownerUserId: input.actorUserId,
              requestId: project.socialImageGenerationRequestId,
            },
            now,
          )
        : [];
      if (
        input.scenes.some((scene, index) =>
          project.photoAssetIds.length > 0
            ? scene.visualType !== 'USER_ASSET' ||
              scene.keywords[0] !== project.photoAssetIds[index % project.photoAssetIds.length]
            : scene.visualType === 'USER_ASSET',
        )
      )
        throw new ApplicationError('VALIDATION_ERROR', 'selected photos do not match the plan');
      if (
        socialImages.length > 0 &&
        input.scenes.some(
          (scene, index) =>
            scene.visualType !== 'GENERATED_IMAGE' || scene.keywords[0] !== socialImages[index]?.id,
        )
      )
        throw new ApplicationError('VALIDATION_ERROR', 'generated images do not match the plan');
      if (!project.narrationEnabled && input.projectAiProcessingTypes.includes('VOICE_SYNTHESIS'))
        throw new ApplicationError('VALIDATION_ERROR', 'narration consent required');
      const totalMs = input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
      if (totalMs !== project.durationSeconds * 1_000) return null;
      await tx.videoScene.deleteMany({ where: { videoProjectId: project.id } });
      await tx.videoScene.createMany({
        data: input.scenes.map((scene) => ({
          videoProjectId: project.id,
          sceneNo: scene.sceneNo,
          durationMs: scene.durationMs,
          narration: scene.narration,
          caption: scene.caption,
          visualType: scene.visualType,
          visualPrompt: scene.visualPrompt,
          keywords: scene.keywords,
          aiProcessingTypes: scene.aiProcessingTypes,
          locked: scene.locked,
        })),
      });
      const row = await tx.videoProject.update({
        where: { id: project.id },
        data: {
          status: 'WAITING_APPROVAL',
          revision: { increment: 1 },
          aiProcessingTypes: input.projectAiProcessingTypes,
          standardComposition: input.standardComposition,
          aiVideoSceneCount: input.aiVideoSceneCount,
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }

  async updateNarrationSettings(
    input: Parameters<VideoProjectRepository['updateNarrationSettings']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: 'WAITING_APPROVAL',
          narrationEnabled: true,
          scenes: { some: {} },
          group: { status: 'ACTIVE' },
          groupMembership: { userId: input.actorUserId, status: 'ACTIVE' },
        },
        select: {
          id: true,
          groupMembershipId: true,
          socialImageGenerationRequestId: true,
        },
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
      const updated = await tx.videoProject.updateMany({
        where: {
          id: project.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: 'WAITING_APPROVAL',
        },
        data: {
          narrationVoice: input.voice,
          narrationSpeed: input.speed,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.videoProject.findUniqueOrThrow({
        where: { id: project.id },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }

  async approvePlan(input: Parameters<VideoProjectRepository['approvePlan']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: 'WAITING_APPROVAL',
          scenes: { some: {} },
          group: { status: 'ACTIVE' },
          groupMembership: {
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
          },
        },
        select: { id: true, groupMembershipId: true, socialImageGenerationRequestId: true },
      });
      if (
        !project ||
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
      const changed = await tx.videoProject.updateMany({
        where: {
          id: project.id,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: 'WAITING_APPROVAL',
          scenes: { some: {} },
        },
        data: { status: 'APPROVED', revision: { increment: 1 } },
      });
      if (changed.count !== 1) return null;
      const row = await tx.videoProject.findUniqueOrThrow({
        where: { id: input.videoProjectId },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }
}
