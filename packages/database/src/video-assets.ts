import { randomUUID } from 'node:crypto';
import type { VideoAssetRecord, VideoAssetRepository } from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';
import { assetRetentionExpiry } from './video-records';

const videoAssetRecord = (row: Prisma.VideoAssetGetPayload<object>): VideoAssetRecord => ({
  ...row,
});

export class PrismaVideoAssetRepository implements VideoAssetRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createPending(input: Parameters<VideoAssetRepository['createPending']>[0]) {
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
          group: {
            status: 'ACTIVE',
            featurePolicies: {
              some: {
                featureKey: 'VIDEO_GENERATION',
                status: 'ENABLED',
                OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              },
            },
          },
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        select: { id: true },
      });
      if (!membership) return null;
      if (input.videoProjectId) {
        const project = await tx.videoProject.findFirst({
          where: {
            id: input.videoProjectId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            ownerUserId: input.actorUserId,
            status: { in: ['DRAFT', 'PLANNING', 'WAITING_APPROVAL', 'REVISING'] },
          },
          select: { id: true },
        });
        if (!project) return null;
      }
      const row = await tx.videoAsset.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: input.actorUserId,
          videoProjectId: input.videoProjectId,
          kind: input.kind,
          storageKey: `video-assets/${input.workspaceId}/${input.actorUserId}/${randomUUID()}`,
          originalFilename: input.originalFilename,
          declaredMimeType: input.declaredMimeType,
          declaredSizeBytes: input.declaredSizeBytes,
          rightsConfirmedAt: now,
          usageTerms: input.usageTerms,
          expiresAt: assetRetentionExpiry(now),
        },
      });
      return videoAssetRecord(row);
    });
  }

  async findOwned(input: Parameters<VideoAssetRepository['findOwned']>[0]) {
    const now = new Date();
    const row = await this.client.videoAsset.findFirst({
      where: {
        id: input.assetId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        groupMembership: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
      },
    });
    return row ? videoAssetRecord(row) : null;
  }

  async markReady(input: Parameters<VideoAssetRepository['markReady']>[0]) {
    return this.client.$transaction(async (tx) => {
      const updated = await tx.videoAsset.updateMany({
        where: {
          id: input.assetId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ownerUserId: input.actorUserId,
          status: 'PENDING_UPLOAD',
        },
        data: {
          status: 'READY',
          verifiedMimeType: input.verifiedMimeType,
          verifiedSizeBytes: input.verifiedSizeBytes,
          width: input.width,
          height: input.height,
          durationMs: input.durationMs,
          failureCode: null,
          expiresAt: assetRetentionExpiry(),
        },
      });
      if (updated.count !== 1) return null;
      const row = await tx.videoAsset.findUniqueOrThrow({ where: { id: input.assetId } });
      return videoAssetRecord(row);
    });
  }

  async reject(input: Parameters<VideoAssetRepository['reject']>[0]) {
    await this.client.videoAsset.updateMany({
      where: {
        id: input.assetId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'PENDING_UPLOAD',
      },
      data: { status: 'REJECTED', failureCode: input.failureCode },
    });
  }

  async listReadyOwned(input: Parameters<VideoAssetRepository['listReadyOwned']>[0]) {
    const now = new Date();
    const rows = await this.client.videoAsset.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
        status: 'READY',
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ...(input.videoProjectId
            ? [{ OR: [{ videoProjectId: null }, { videoProjectId: input.videoProjectId }] }]
            : []),
        ],
        group: {
          status: 'ACTIVE',
          featurePolicies: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
        groupMembership: {
          userId: input.actorUserId,
          status: 'ACTIVE',
          featureAssignments: {
            some: {
              featureKey: 'VIDEO_GENERATION',
              status: 'ENABLED',
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(videoAssetRecord);
  }
}
