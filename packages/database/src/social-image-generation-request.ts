import type {
  SocialImageGenerationRequestRecord,
  SocialImageGenerationRequestRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { assetRetentionExpiry } from './video-records';
const socialImageGenerationRequestRecord = (
  row: Prisma.SocialImageGenerationRequestGetPayload<object>,
): SocialImageGenerationRequestRecord => ({
  ...row,
  status: row.status,
  referenceImage:
    (row.referenceImage as SocialImageGenerationRequestRecord['referenceImage']) ?? null,
  qualityReport:
    (row.qualityReport as unknown as SocialImageGenerationRequestRecord['qualityReport']) ?? null,
  templateKey: row.templateKey as SocialImageGenerationRequestRecord['templateKey'],
  layout: row.layout as unknown as SocialImageGenerationRequestRecord['layout'],
});

export class PrismaSocialImageGenerationRequestRepository implements SocialImageGenerationRequestRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async activeScope(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId: string;
      groupMembershipId: string;
      actorUserId: string;
      pilotEnrollmentId: string;
    },
    now = new Date(),
  ) {
    const membership = await tx.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'SOCIAL.IMAGE_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        featureAssignments: {
          some: {
            featureKey: 'SOCIAL.IMAGE_GENERATION',
            status: 'ENABLED',
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
          },
        },
      },
      select: { id: true },
    });
    if (!membership) return false;
    const enrollment = await tx.socialImagePilotEnrollment.findFirst({
      where: {
        id: input.pilotEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
        pilot: {
          status: 'ACTIVE',
          emergencyStop: false,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
      },
      select: { id: true },
    });
    return Boolean(enrollment);
  }

  async create(input: Parameters<SocialImageGenerationRequestRepository['create']>[0]) {
    const lookup = {
      workspaceId_groupId_ownerUserId_idempotencyKey: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    } as const;
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.activeScope(tx, input))) return null;
        const existing = await tx.socialImageGenerationRequest.findUnique({ where: lookup });
        if (existing) return socialImageGenerationRequestRecord(existing);
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
        const mission = await tx.dailyMission.findFirst({
          where: {
            id: input.dailyMissionId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            format: { in: ['IMAGE', 'SLIDE'] },
          },
          select: { id: true },
        });
        if (!mission) return null;
        if (input.campaignId) {
          const campaign = await tx.campaign.findFirst({
            where: {
              id: input.campaignId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
            },
            select: { id: true, productPackVersionId: true },
          });
          if (!campaign || campaign.productPackVersionId !== input.productPackVersionId)
            return null;
        } else if (input.productPackVersionId) {
          const product = await tx.productPackVersion.findFirst({
            where: {
              id: input.productPackVersionId,
              status: 'PUBLISHED',
              productPack: {
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                status: 'ACTIVE',
              },
            },
            select: { id: true },
          });
          if (!product) return null;
        }
        if (input.generationContextSnapshotId) {
          const snapshot = await tx.generationContextSnapshot.findFirst({
            where: {
              id: input.generationContextSnapshotId,
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: input.dailyMissionId,
            },
            select: { id: true },
          });
          if (!snapshot) return null;
        }
        const row = await tx.socialImageGenerationRequest.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: input.actorUserId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            campaignId: input.campaignId,
            productPackVersionId: input.productPackVersionId,
            generationContextSnapshotId: input.generationContextSnapshotId,
            pilotEnrollmentId: input.pilotEnrollmentId,
            templateKey: input.layout.templateKey,
            referenceImage: input.referenceImage ?? Prisma.DbNull,
            layout: input.layout as unknown as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return socialImageGenerationRequestRecord(row);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.socialImageGenerationRequest.findUnique({ where: lookup });
      return existing ? socialImageGenerationRequestRecord(existing) : null;
    }
  }

  async findOwned(input: Parameters<SocialImageGenerationRequestRepository['findOwned']>[0]) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
        },
      });
      if (!row) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          actorUserId: row.ownerUserId,
          pilotEnrollmentId: row.pilotEnrollmentId,
        }))
      )
        return null;
      return socialImageGenerationRequestRecord(row);
    });
  }

  async transition(input: Parameters<SocialImageGenerationRequestRepository['transition']>[0]) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
        },
      });
      if (!row) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: row.workspaceId,
          groupId: row.groupId,
          groupMembershipId: row.groupMembershipId,
          actorUserId: row.ownerUserId,
          pilotEnrollmentId: row.pilotEnrollmentId,
        }))
      )
        return null;
      const changed = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          revision: input.expectedRevision,
          status: input.fromStatus,
        },
        data: {
          status: input.toStatus,
          errorCode: input.errorCode,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) return null;
      return socialImageGenerationRequestRecord(
        await tx.socialImageGenerationRequest.findUniqueOrThrow({
          where: { id: input.requestId },
        }),
      );
    });
  }

  async findMediaOwned(
    input: Parameters<SocialImageGenerationRequestRepository['findMediaOwned']>[0],
  ) {
    return (await this.listMediaOwned(input))[0] ?? null;
  }

  async listMediaOwned(
    input: Parameters<SocialImageGenerationRequestRepository['listMediaOwned']>[0],
  ) {
    const request = await this.findOwned(input);
    if (!request || request.status !== 'READY_FOR_REVIEW') return [];
    const media = await this.client.socialImageGeneratedMedia.findMany({
      where: {
        requestId: request.id,
        workspaceId: request.workspaceId,
        groupId: request.groupId,
        ownerUserId: request.ownerUserId,
        status: { in: ['READY', 'ADOPTED', 'REJECTED'] },
      },
      orderBy: [{ pageIndex: 'asc' }, { createdAt: 'desc' }],
    });
    return media.map((item) => ({ ...item, width: 1080 as const, height: 1350 as const }));
  }

  async setMediaStatus(
    input: Parameters<SocialImageGenerationRequestRepository['setMediaStatus']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const request = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          status: 'READY_FOR_REVIEW',
        },
      });
      if (!request) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          groupMembershipId: request.groupMembershipId,
          actorUserId: request.ownerUserId,
          pilotEnrollmentId: request.pilotEnrollmentId,
        }))
      )
        return null;
      const target = await tx.socialImageGeneratedMedia.findFirst({
        where: {
          id: input.mediaId,
          requestId: request.id,
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          ownerUserId: request.ownerUserId,
          status: { in: ['READY', 'ADOPTED', 'REJECTED'] },
        },
      });
      if (!target) return null;
      if (input.status === 'ADOPTED') {
        await tx.socialImageGeneratedMedia.updateMany({
          where: {
            workspaceId: request.workspaceId,
            dailyMissionId: request.dailyMissionId,
            status: 'ADOPTED',
            id: { not: target.id },
          },
          data: { status: 'READY', reviewReason: null, reviewNote: null },
        });
        const adopted = await tx.socialImageGeneratedMedia.update({
          where: { id: target.id },
          data: { status: 'ADOPTED', reviewReason: null, reviewNote: null },
        });
        return {
          ...adopted,
          width: 1080 as const,
          height: 1350 as const,
        };
      }
      await tx.socialImageGeneratedMedia.updateMany({
        where: {
          requestId: request.id,
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          ownerUserId: request.ownerUserId,
          status: { in: ['READY', 'ADOPTED', 'REJECTED'] },
        },
        data: {
          status: input.status,
          reviewReason: input.reviewReason,
          reviewNote: input.reviewNote,
        },
      });
      return {
        ...target,
        status: input.status,
        width: 1080 as const,
        height: 1350 as const,
      };
    });
  }

  async replaceMediaPage(
    input: Parameters<SocialImageGenerationRequestRepository['replaceMediaPage']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const request = await tx.socialImageGenerationRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          status: 'READY_FOR_REVIEW',
          revision: input.expectedRevision,
        },
      });
      if (!request) return null;
      if (
        !(await this.activeScope(tx, {
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          groupMembershipId: request.groupMembershipId,
          actorUserId: request.ownerUserId,
          pilotEnrollmentId: request.pilotEnrollmentId,
        }))
      )
        return null;
      const current = await tx.socialImageGeneratedMedia.findFirst({
        where: {
          id: input.currentMediaId,
          requestId: request.id,
          pageIndex: input.pageIndex,
          status: 'READY',
        },
      });
      if (!current) return null;
      const updated = await tx.socialImageGenerationRequest.updateMany({
        where: {
          id: request.id,
          revision: input.expectedRevision,
          status: 'READY_FOR_REVIEW',
        },
        data: {
          layout: input.layout as unknown as Prisma.InputJsonValue,
          templateKey: input.layout.templateKey,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      await tx.socialImageGeneratedMedia.delete({ where: { id: current.id } });
      const replacement = await tx.socialImageGeneratedMedia.create({
        data: {
          id: input.replacement.mediaId,
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          ownerUserId: request.ownerUserId,
          dailyMissionId: request.dailyMissionId,
          requestId: request.id,
          pageIndex: input.pageIndex,
          sourceStorageKey: input.replacement.sourceStorageKey,
          completedStorageKey: input.replacement.completedStorageKey,
          thumbnailStorageKey: input.replacement.thumbnailStorageKey,
          width: 1080,
          height: 1350,
          contentHash: input.replacement.contentHash,
          expiresAt: assetRetentionExpiry(),
        },
      });
      return { ...replacement, width: 1080 as const, height: 1350 as const };
    });
  }
}
