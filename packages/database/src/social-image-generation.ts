import type {
  SocialImageGenerationAuthorizationPort,
  SocialImageGenerationExecutionContext,
  SocialImageGenerationExecutionRepository,
  SocialImageGenerationRequestRecord,
  SocialImageGenerationRequestRepository,
  SocialImagePilotEvidenceRecord,
  SocialImagePilotEvidenceRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';
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

const socialImagePilotEvidenceRecord = (
  row: Prisma.SocialImagePilotEvidenceGetPayload<object>,
): SocialImagePilotEvidenceRecord => ({
  ...row,
  checkKey: row.checkKey,
  action: row.action,
});

const socialImagePilotApprovalChecks = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL',
] as const;

async function socialImagePilotCanGenerate(
  client: PrismaClient | Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    pilotId: string;
    pilotEnrollmentId: string;
    currentRequestId?: string;
  },
) {
  const rows = await client.socialImagePilotEvidence.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      pilotId: input.pilotId,
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    select: { checkKey: true, action: true },
  });
  const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
  if (socialImagePilotApprovalChecks.every((key) => latest.get(key) === 'RECORDED')) return true;
  const preflightReady =
    latest.get('PLAN_APPROVAL') === 'RECORDED' &&
    latest.get('STORAGE_RETENTION') === 'RECORDED' &&
    latest.get('FINAL_APPROVAL') === undefined;
  if (!preflightReady) return false;

  const otherPreflightRequests = await client.socialImageGenerationRequest.count({
    where: {
      pilotEnrollmentId: input.pilotEnrollmentId,
      status: { notIn: ['FAILED', 'CANCELLED'] },
      ...(input.currentRequestId ? { id: { not: input.currentRequestId } } : {}),
    },
  });
  return otherPreflightRequests === 0;
}

export class PrismaSocialImagePilotEvidenceRepository implements SocialImagePilotEvidenceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<SocialImagePilotEvidenceRepository['list']>[0]) {
    const [admin, pilot] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: input.actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.client.socialImageGenerationPilot.findFirst({
        where: {
          id: input.pilotId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
        },
        select: { id: true },
      }),
    ]);
    if (!admin || !pilot) return null;
    const rows = await this.client.socialImagePilotEvidence.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        pilotId: input.pilotId,
      },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(socialImagePilotEvidenceRecord);
  }

  async append(input: Parameters<SocialImagePilotEvidenceRepository['append']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const [admin, pilot] = await Promise.all([
          tx.platformAdmin.findFirst({
            where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.socialImageGenerationPilot.findFirst({
            where: {
              id: input.pilotId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
            },
            select: { id: true },
          }),
        ]);
        if (!admin || !pilot) return null;
        if (input.checkKey === 'FINAL_APPROVAL' && input.action === 'RECORDED') {
          const rows = await tx.socialImagePilotEvidence.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              pilotId: input.pilotId,
            },
            orderBy: { occurredAt: 'asc' },
            select: { checkKey: true, action: true },
          });
          const latest = new Map(rows.map((row) => [row.checkKey, row.action]));
          const required = [
            'PLAN_APPROVAL',
            'STORAGE_RETENTION',
            'MOBILE_E2E',
            'SECURITY_ISOLATION',
            'TEN_THEME_VALIDATION',
          ] as const;
          if (!required.every((key) => latest.get(key) === 'RECORDED')) return null;
        }
        return socialImagePilotEvidenceRecord(
          await tx.socialImagePilotEvidence.create({ data: input }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

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

export class PrismaSocialImageGenerationAuthorizationRepository implements SocialImageGenerationAuthorizationPort {
  constructor(private readonly client: PrismaClient = prisma) {}

  async authorize(input: Parameters<SocialImageGenerationAuthorizationPort['authorize']>[0]) {
    if (input.environment !== 'PRODUCTION')
      return { allowed: false as const, reason: 'NOT_PRODUCTION' as const };
    const membership = await this.client.groupMembership.findFirst({
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
    if (!membership) return { allowed: false as const, reason: 'MEMBERSHIP_UNAVAILABLE' as const };
    const access = await new PrismaGroupFeatureEntitlementRepository(this.client).resolveAccess({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      now: input.now,
    });
    if (!access?.allowed)
      return { allowed: false as const, reason: 'FEATURE_UNAVAILABLE' as const };
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!bunshin) return { allowed: false as const, reason: 'BUNSHIN_UNAVAILABLE' as const };
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        format: { in: ['IMAGE', 'SLIDE'] },
      },
      select: { id: true },
    });
    if (!mission) return { allowed: false as const, reason: 'MISSION_FORMAT_UNAVAILABLE' as const };
    if (input.campaignId) {
      const campaign = await this.client.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ...(input.productPackVersionId
            ? { productPackVersionId: input.productPackVersionId }
            : {}),
          status: 'OPEN',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
          participations: {
            some: {
              participantWorkspaceId: input.workspaceId,
              userId: input.actorUserId,
              bunshinId: input.bunshinId,
              status: 'ACCEPTED',
              consentedAt: { not: null },
            },
          },
        },
        select: { id: true },
      });
      if (!campaign) return { allowed: false as const, reason: 'CAMPAIGN_UNAVAILABLE' as const };
    }
    const enrollment = await this.client.socialImagePilotEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
        pilot: {
          status: 'ACTIVE',
          emergencyStop: false,
          OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
        },
      },
      include: { pilot: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!enrollment) return { allowed: false as const, reason: 'PILOT_UNAVAILABLE' as const };
    if (
      !(await socialImagePilotCanGenerate(this.client, {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        pilotId: enrollment.pilotId,
        pilotEnrollmentId: enrollment.id,
      }))
    )
      return { allowed: false as const, reason: 'PILOT_UNAVAILABLE' as const };
    const dailyFrom = new Date(
      Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()),
    );
    const monthlyFrom = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1));
    const success = {
      status: 'READY_FOR_REVIEW' as const,
      pilotEnrollment: { pilotId: enrollment.pilotId },
    };
    const [dailyUsed, monthlyUsed, memberUsed] = await Promise.all([
      this.client.socialImageGenerationRequest.count({
        where: { ...success, updatedAt: { gte: dailyFrom, lt: input.now } },
      }),
      this.client.socialImageGenerationRequest.count({
        where: { ...success, updatedAt: { gte: monthlyFrom, lt: input.now } },
      }),
      this.client.socialImageGenerationRequest.count({
        where: {
          ...success,
          groupMembershipId: input.groupMembershipId,
          updatedAt: { gte: monthlyFrom, lt: input.now },
        },
      }),
    ]);
    if (
      dailyUsed >= enrollment.pilot.dailyLimit ||
      monthlyUsed >= enrollment.pilot.monthlyLimit ||
      memberUsed >= enrollment.pilot.memberMonthlyLimit
    )
      return { allowed: false as const, reason: 'LIMIT_REACHED' as const };
    return {
      allowed: true as const,
      pilotEnrollmentId: enrollment.id,
      generationContextSnapshotId: null,
    };
  }
}

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
