import type { VideoProjectRepository, VideoProjectReviewRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type Prisma, type PrismaClient, prisma } from './client';
import { authorizedSocialImageVideoSources } from './social-image-video-sources';
import { authorizedVideoPhotos } from './video-photos';
import { hasActiveVideoProjectEntitlement } from './video-project-entitlement';
import { videoProjectRecord } from './video-records';

export class PrismaVideoProjectRepository
  implements VideoProjectRepository, VideoProjectReviewRepository
{
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<VideoProjectRepository['create']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const membership = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!membership) return null;
      if (
        !(await hasActiveVideoProjectEntitlement(
          tx,
          {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            socialImageGenerationRequestId: input.socialImageGenerationRequestId ?? null,
          },
          now,
        ))
      )
        return null;
      const bunshin = await tx.bunshin.findFirst({
        where: {
          id: input.bunshinId,
          workspaceId: input.workspaceId,
          ownerUserId: input.actorUserId,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
      });
      if (!bunshin) return null;
      if (input.socialImageGenerationRequestId) {
        await authorizedSocialImageVideoSources(
          tx,
          {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: input.actorUserId,
            requestId: input.socialImageGenerationRequestId,
          },
          now,
        );
        const existing = await tx.videoProject.findUnique({
          where: { socialImageGenerationRequestId: input.socialImageGenerationRequestId },
          include: { scenes: { orderBy: { sceneNo: 'asc' } } },
        });
        if (existing)
          return existing.ownerUserId === input.actorUserId &&
            existing.workspaceId === input.workspaceId &&
            existing.groupId === input.groupId
            ? videoProjectRecord(existing)
            : null;
      }
      if (input.campaignId) {
        const campaign = await tx.campaign.findFirst({
          where: { id: input.campaignId, workspaceId: input.workspaceId, groupId: input.groupId },
          select: { id: true },
        });
        if (!campaign) return null;
      }
      let characterProfileSnapshot: Prisma.InputJsonValue = {};
      let characterReferenceSnapshot: Prisma.InputJsonValue = [];
      if (!input.standardComposition && !input.characterProfileVersionId) return null;
      if (input.characterProfileVersionId) {
        const characterVersion = await tx.aiCharacterProfileVersion.findFirst({
          where: {
            id: input.characterProfileVersionId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'PUBLISHED',
          },
        });
        if (!characterVersion) return null;
        const activeLicense = await tx.aiCharacterLicenseVersion.findFirst({
          where: {
            id: characterVersion.licenseVersionId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            characterProfileId: characterVersion.characterProfileId,
            commercialUseAllowed: true,
            derivativeUseAllowed: true,
            redistributionAllowed: true,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: { id: true },
        });
        if (!activeLicense) return null;
        const characterProfile = await tx.aiCharacterProfile.findFirst({
          where: {
            id: characterVersion.characterProfileId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            scope: 'SERVICE',
            status: 'ACTIVE',
          },
          select: { id: true, name: true },
        });
        if (!characterProfile) return null;
        const references = await tx.aiCharacterReferenceAsset.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            characterProfileVersionId: characterVersion.id,
            status: 'READY',
          },
          select: { id: true, storageKey: true, mimeType: true, sha256: true },
          orderBy: { createdAt: 'asc' },
        });
        if (references.length === 0) return null;
        characterProfileSnapshot = {
          characterProfileId: characterProfile.id,
          name: characterProfile.name,
          version: characterVersion.version,
          appearance: characterVersion.appearance,
          worldSetting: characterVersion.worldSetting,
          basePrompt: characterVersion.basePrompt,
          negativePrompt: characterVersion.negativePrompt,
          safetyRules: characterVersion.safetyRules as Prisma.InputJsonValue,
          licenseSnapshot: characterVersion.licenseSnapshot as Prisma.InputJsonValue,
          publishedAt: characterVersion.publishedAt?.toISOString() ?? null,
        };
        characterReferenceSnapshot = references;
      }
      await authorizedVideoPhotos(
        tx,
        {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: input.actorUserId,
        },
        input.photoAssetIds ?? [],
        now,
      );
      const row = await tx.videoProject.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: input.actorUserId,
          bunshinId: input.bunshinId,
          campaignId: input.campaignId,
          characterProfileVersionId: input.characterProfileVersionId,
          characterProfileSnapshot,
          characterReferenceSnapshot,
          title: input.title,
          platform: input.platform,
          type: input.type,
          durationSeconds: input.durationSeconds,
          photoAssetIds: input.photoAssetIds ?? [],
          narrationEnabled: input.narrationEnabled ?? false,
          narrationVoice: input.narrationVoice ?? 'marin',
          narrationSpeed: input.narrationSpeed ?? 'STANDARD',
          socialImageGenerationRequestId: input.socialImageGenerationRequestId ?? null,
          standardComposition: input.standardComposition,
          aiProcessingTypes: input.aiProcessingTypes,
          disclosureSnapshot: input.disclosureSnapshot as Prisma.InputJsonValue,
        },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }

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

  async review(input: Parameters<VideoProjectReviewRepository['review']>[0]) {
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const project = await tx.videoProject.findFirst({
        where: {
          id: input.videoProjectId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status:
            input.action === 'ADOPT'
              ? 'READY_FOR_REVIEW'
              : { in: ['READY_FOR_REVIEW', 'COMPLETED'] },
          renderAttempts: { some: { status: 'SUCCEEDED' } },
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
          status:
            input.action === 'ADOPT'
              ? 'READY_FOR_REVIEW'
              : { in: ['READY_FOR_REVIEW', 'COMPLETED'] },
        },
        data:
          input.action === 'ADOPT'
            ? {
                status: 'COMPLETED',
                revision: { increment: 1 },
                reviewDecision: 'ADOPTED',
                reviewReason: null,
                reviewNote: null,
                reviewedAt: now,
              }
            : {
                status: 'WAITING_APPROVAL',
                revision: { increment: 1 },
                reviewDecision: null,
                reviewReason: input.reviewReason,
                reviewNote: input.reviewNote,
                reviewedAt: now,
              },
      });
      if (changed.count !== 1) return null;
      if (input.action === 'REVISE')
        await tx.videoDelivery.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            videoProjectId: input.videoProjectId,
            ownerUserId: input.actorUserId,
            status: { in: ['ASSIGNED', 'VIEWED', 'ACCEPTED'] },
          },
          data: { status: 'REVOKED', notificationSnapshot: null },
        });
      const row = await tx.videoProject.findUniqueOrThrow({
        where: { id: input.videoProjectId },
        include: { scenes: { orderBy: { sceneNo: 'asc' } } },
      });
      return videoProjectRecord(row);
    });
  }
}

export { PrismaVideoDeliveryRepository } from './video-deliveries';
