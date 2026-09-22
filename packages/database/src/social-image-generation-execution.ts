import type {
  SocialImageGenerationExecutionContext,
  SocialImageGenerationExecutionRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { socialImagePilotCanGenerate } from './social-image-pilot-policy';
import { assetRetentionExpiry } from './video-records';
export class PrismaSocialImageGenerationExecutionRepository implements SocialImageGenerationExecutionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: Parameters<SocialImageGenerationExecutionRepository['claim']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const request = await tx.socialImageGenerationRequest.findFirst({
          where: { id: input.requestId, workspaceId: input.workspaceId },
          include: { pilotEnrollment: { include: { pilot: true } } },
        });
        if (!request || !['QUEUED', 'GENERATING_ASSET', 'COMPOSING'].includes(request.status))
          return { allowed: false as const, reason: 'REQUEST_UNAVAILABLE' as const };
        const pilot = request.pilotEnrollment.pilot;
        const membership = await tx.groupMembership.findFirst({
          where: {
            id: request.groupMembershipId,
            workspaceId: request.workspaceId,
            groupId: request.groupId,
            userId: request.ownerUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            group: {
              status: 'ACTIVE',
              featurePolicies: {
                some: {
                  featureKey: 'SOCIAL.IMAGE_GENERATION',
                  status: 'ENABLED',
                  OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
                  AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
                },
              },
            },
            featureAssignments: {
              some: {
                featureKey: 'SOCIAL.IMAGE_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
              },
            },
          },
          select: { id: true },
        });
        if (
          !membership ||
          request.pilotEnrollment.status !== 'ACTIVE' ||
          request.pilotEnrollment.revokedAt ||
          pilot.status !== 'ACTIVE' ||
          pilot.emergencyStop ||
          (pilot.startsAt && pilot.startsAt > input.now) ||
          (pilot.endsAt && pilot.endsAt <= input.now)
        )
          return { allowed: false as const, reason: 'PILOT_STOPPED' as const };
        if (
          !(await socialImagePilotCanGenerate(tx, {
            workspaceId: request.workspaceId,
            groupId: request.groupId,
            pilotId: pilot.id,
            pilotEnrollmentId: request.pilotEnrollmentId,
            currentRequestId: request.id,
          }))
        )
          return { allowed: false as const, reason: 'PILOT_STOPPED' as const };

        const bunshin = await tx.bunshin.findFirst({
          where: {
            id: request.bunshinId,
            workspaceId: request.workspaceId,
            ownerUserId: request.ownerUserId,
            status: { not: 'ARCHIVED' },
            capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!bunshin) return { allowed: false as const, reason: 'PILOT_STOPPED' as const };
        if (request.campaignId) {
          const campaign = await tx.campaign.findFirst({
            where: {
              id: request.campaignId,
              workspaceId: request.workspaceId,
              groupId: request.groupId,
              status: 'OPEN',
              startsAt: { lte: input.now },
              endsAt: { gt: input.now },
            },
            select: { id: true },
          });
          if (!campaign) return { allowed: false as const, reason: 'PILOT_STOPPED' as const };
        }

        const completed = {
          status: 'READY_FOR_REVIEW' as const,
          pilotEnrollment: { pilotId: pilot.id },
        };
        const [dailyUsed, monthlyUsed, memberMonthlyUsed] = await Promise.all([
          tx.socialImageGenerationRequest.count({
            where: { ...completed, updatedAt: { gte: input.dailyFrom, lt: input.now } },
          }),
          tx.socialImageGenerationRequest.count({
            where: { ...completed, updatedAt: { gte: input.monthlyFrom, lt: input.now } },
          }),
          tx.socialImageGenerationRequest.count({
            where: {
              ...completed,
              groupMembershipId: request.groupMembershipId,
              updatedAt: { gte: input.monthlyFrom, lt: input.now },
            },
          }),
        ]);
        if (dailyUsed >= pilot.dailyLimit)
          return { allowed: false as const, reason: 'DAILY_LIMIT_REACHED' as const };
        if (monthlyUsed >= pilot.monthlyLimit)
          return { allowed: false as const, reason: 'MONTHLY_LIMIT_REACHED' as const };
        if (memberMonthlyUsed >= pilot.memberMonthlyLimit)
          return { allowed: false as const, reason: 'MEMBER_MONTHLY_LIMIT_REACHED' as const };
        if (request.status === 'QUEUED') {
          const claimed = await tx.socialImageGenerationRequest.updateMany({
            where: { id: request.id, workspaceId: request.workspaceId, status: 'QUEUED' },
            data: { status: 'GENERATING_ASSET', revision: { increment: 1 }, errorCode: null },
          });
          if (claimed.count !== 1)
            return { allowed: false as const, reason: 'REQUEST_UNAVAILABLE' as const };
        }
        const context: SocialImageGenerationExecutionContext = {
          requestId: request.id,
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          ownerUserId: request.ownerUserId,
          bunshinId: request.bunshinId,
          dailyMissionId: request.dailyMissionId,
          pilotEnrollmentId: request.pilotEnrollmentId,
          idempotencyKey: request.idempotencyKey,
          referenceImage:
            (request.referenceImage as SocialImageGenerationExecutionContext['referenceImage']) ??
            null,
          layout: request.layout as unknown as SocialImageGenerationExecutionContext['layout'],
          model: pilot.defaultModel,
          quality: pilot.defaultQuality,
        };
        return { allowed: true as const, context };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async moveToComposing(input: { workspaceId: string; requestId: string }) {
    const existing = await this.client.socialImageGenerationRequest.findFirst({
      where: { id: input.requestId, workspaceId: input.workspaceId, status: 'COMPOSING' },
      select: { id: true },
    });
    if (existing) return true;
    const result = await this.client.socialImageGenerationRequest.updateMany({
      where: { id: input.requestId, workspaceId: input.workspaceId, status: 'GENERATING_ASSET' },
      data: { status: 'COMPOSING', revision: { increment: 1 } },
    });
    return result.count === 1;
  }

  async recordQualityReport(
    input: Parameters<SocialImageGenerationExecutionRepository['recordQualityReport']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const result = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          status: 'GENERATING_ASSET',
        },
        data: { qualityReport: input.qualityReport as unknown as Prisma.InputJsonValue },
      });
      return result.count === 1;
    });
  }

  async complete(input: Parameters<SocialImageGenerationExecutionRepository['complete']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (input.media.length < 1 || input.media.length > 7) return false;
      if (input.serviceMediaReservationId) {
        const consumed = await tx.serviceMediaGenerationReservation.updateMany({
          where: {
            id: input.serviceMediaReservationId,
            workspaceId: input.context.workspaceId,
            groupId: input.context.groupId,
            kind: 'IMAGE',
            operationKey: input.context.idempotencyKey,
            status: 'RESERVED',
          },
          data: { status: 'CONSUMED', consumedAt: new Date() },
        });
        if (consumed.count !== 1) return false;
      }
      const changed = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: input.context.requestId,
          workspaceId: input.context.workspaceId,
          groupId: input.context.groupId,
          ownerUserId: input.context.ownerUserId,
          status: 'COMPOSING',
        },
        data: {
          status: 'READY_FOR_REVIEW',
          revision: { increment: 1 },
          errorCode: null,
          qualityReport: input.qualityReport as unknown as Prisma.InputJsonValue,
        },
      });
      if (changed.count !== 1) return false;
      await tx.socialImageGeneratedMedia.createMany({
        data: input.media.map((media) => ({
          id: media.mediaId,
          workspaceId: input.context.workspaceId,
          groupId: input.context.groupId,
          ownerUserId: input.context.ownerUserId,
          dailyMissionId: input.context.dailyMissionId,
          requestId: input.context.requestId,
          pageIndex: media.pageIndex,
          sourceStorageKey: media.sourceStorageKey,
          completedStorageKey: media.completedStorageKey,
          thumbnailStorageKey: media.thumbnailStorageKey,
          width: 1080,
          height: 1350,
          contentHash: media.contentHash,
          expiresAt: assetRetentionExpiry(),
        })),
      });
      return true;
    });
  }

  async markFailed(input: { workspaceId: string; requestId: string; errorCode: string }) {
    return this.client.$transaction(async (tx) => {
      const request = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'GENERATING_ASSET', 'COMPOSING'] },
        },
        select: { ownerUserId: true, groupId: true, idempotencyKey: true },
      });
      if (!request) return null;
      const changed = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          status: { in: ['QUEUED', 'GENERATING_ASSET', 'COMPOSING'] },
        },
        data: { status: 'FAILED', errorCode: input.errorCode, revision: { increment: 1 } },
      });
      if (changed.count !== 1) return null;
      await tx.serviceMediaGenerationReservation.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: request.groupId,
          kind: 'IMAGE',
          operationKey: request.idempotencyKey,
          status: 'RESERVED',
        },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      return request;
    });
  }
}
