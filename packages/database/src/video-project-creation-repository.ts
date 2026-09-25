import type { VideoProjectRepository } from '@bunshin/application';
import type { Prisma, PrismaClient } from './client';
import { authorizedSocialImageVideoSources } from './social-image-video-sources';
import { authorizedVideoPhotos } from './video-photos';
import { hasActiveVideoProjectEntitlement } from './video-project-entitlement';
import { videoProjectRecord } from './video-records';

export class PrismaVideoProjectCreationRepository {
  constructor(private readonly client: PrismaClient) {}

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
}
