import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SOCIAL_PUBLICATION_JOB_TYPE, type JobEnvironment } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { PrismaJobRepository } from './automation-jobs';
import { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';
import { isMemberUsageScopePermitted } from './member-usage-authorization';
import type { SocialAccountConnectionOwner } from './social-account-connections';

const MAX_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000;
const APPROVAL_GRACE_MS = 15 * 60 * 1000;
const publicFields = {
  id: true,
  status: true,
  scheduledAt: true,
  externalPostId: true,
  failureCategory: true,
  publishedAt: true,
} as const;

export interface ApproveSocialPublicationInput extends SocialAccountConnectionOwner {
  actorUserId: string;
  socialProfileId: string;
  dailyMissionId: string;
  contentVariantId: string;
  connectionId: string;
  mediaId: string;
  caption: string;
  scheduledAt: Date;
  idempotencyKey: string;
  correlationId: string;
  environment: JobEnvironment;
}

const ownerWhere = (input: SocialAccountConnectionOwner) => ({
  workspaceId: input.workspaceId,
  groupId: input.serviceId,
  groupMembershipId: input.groupMembershipId,
  userId: input.userId,
});

function approvalHash(value: Record<string, string | number>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unavailable(): never {
  throw new ApplicationError('FORBIDDEN', 'social publication unavailable');
}

/** Persistence and authorization boundary for one-image Instagram publication intents. */
export class PrismaSocialPublicationIntents {
  constructor(private readonly client: PrismaClient) {}

  async approve(input: ApproveSocialPublicationInput) {
    if (input.actorUserId !== input.userId) unavailable();
    const now = new Date();
    const caption = input.caption.trim();
    const scheduledAt = input.scheduledAt;
    if (
      !caption ||
      [...caption].length > 2200 ||
      !input.idempotencyKey.trim() ||
      input.idempotencyKey.length > 200 ||
      !Number.isFinite(scheduledAt.getTime()) ||
      scheduledAt.getTime() < now.getTime() - 30_000 ||
      scheduledAt.getTime() > now.getTime() + MAX_SCHEDULE_MS
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid social publication approval');

    return this.serializable(async (tx) => {
      await this.requireAuthorized(tx, input, now);
      const [profile, connection, variant, selection, media] = await Promise.all([
        tx.socialProfile.findFirst({
          where: {
            id: input.socialProfileId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            platform: 'INSTAGRAM',
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
        tx.socialAccountConnection.findFirst({
          where: {
            ...ownerWhere(input),
            id: input.connectionId,
            platform: 'INSTAGRAM',
            status: 'CONNECTED',
            tokenExpiresAt: { gt: now },
            encryptedToken: { not: null },
            grants: { some: { bunshinId: input.bunshinId } },
          },
          select: { id: true },
        }),
        tx.missionContentVariant.findFirst({
          where: {
            id: input.contentVariantId,
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
            dailyMission: { socialProfileId: input.socialProfileId, postRecord: null },
          },
          select: { id: true, sequence: true },
        }),
        tx.missionContentVariantSelection.findFirst({
          where: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
          orderBy: [{ selectedAt: 'desc' }, { id: 'desc' }],
          select: { variantId: true },
        }),
        tx.socialImageGeneratedMedia.findFirst({
          where: {
            id: input.mediaId,
            workspaceId: input.workspaceId,
            groupId: input.serviceId,
            ownerUserId: input.userId,
            dailyMissionId: input.dailyMissionId,
            status: 'READY',
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            request: { bunshinId: input.bunshinId },
          },
          select: { id: true, contentHash: true },
        }),
      ]);
      if (!profile || !connection || !variant || selection?.variantId !== variant.id || !media)
        unavailable();

      const hash = approvalHash({
        workspaceId: input.workspaceId,
        serviceId: input.serviceId,
        ownerUserId: input.userId,
        bunshinId: input.bunshinId,
        socialProfileId: input.socialProfileId,
        dailyMissionId: input.dailyMissionId,
        contentVariantId: variant.id,
        contentRevision: variant.sequence,
        connectionId: connection.id,
        mediaId: media.id,
        mediaContentHash: media.contentHash,
        caption,
        scheduledAt: scheduledAt.toISOString(),
        idempotencyKey: input.idempotencyKey,
      });
      const existing = await tx.socialPublicationIntent.findUnique({
        where: {
          workspaceId_bunshinId_dailyMissionId: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
        },
      });
      if (existing && existing.approvalHash !== hash && existing.status !== 'FAILED')
        throw new ApplicationError('CONFLICT', 'publication already approved');
      const id = existing?.id ?? randomUUID();
      const approvalExpiresAt = new Date(scheduledAt.getTime() + APPROVAL_GRACE_MS);
      const intent = await tx.socialPublicationIntent.upsert({
        where: {
          workspaceId_bunshinId_dailyMissionId: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: input.dailyMissionId,
          },
        },
        create: {
          id,
          workspaceId: input.workspaceId,
          groupId: input.serviceId,
          groupMembershipId: input.groupMembershipId,
          ownerUserId: input.userId,
          bunshinId: input.bunshinId,
          socialProfileId: input.socialProfileId,
          dailyMissionId: input.dailyMissionId,
          contentVariantId: variant.id,
          contentRevision: variant.sequence,
          connectionId: connection.id,
          mediaId: media.id,
          mediaContentHash: media.contentHash,
          platform: 'INSTAGRAM',
          caption,
          status: 'APPROVED',
          idempotencyKey: input.idempotencyKey,
          approvalHash: hash,
          approvedByUserId: input.userId,
          approvedAt: now,
          approvalExpiresAt,
          scheduledAt,
        },
        update:
          existing?.status === 'FAILED'
            ? {
                groupMembershipId: input.groupMembershipId,
                socialProfileId: input.socialProfileId,
                contentVariantId: variant.id,
                contentRevision: variant.sequence,
                connectionId: connection.id,
                mediaId: media.id,
                mediaContentHash: media.contentHash,
                caption,
                status: 'APPROVED',
                idempotencyKey: input.idempotencyKey,
                approvalHash: hash,
                approvedAt: now,
                approvalExpiresAt,
                scheduledAt,
                containerId: null,
                failureCategory: null,
                lastAttemptAt: null,
              }
            : {},
        select: publicFields,
      });
      await new PrismaJobRepository(tx).enqueue({
        environment: input.environment,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        capabilityType: 'SOCIAL',
        jobType: SOCIAL_PUBLICATION_JOB_TYPE,
        payloadReference: `social-publication:${id}`,
        idempotencyKey: `social-publication:${id}:${hash}`,
        correlationId: input.correlationId,
        requestedBy: input.userId,
        scheduledAt,
        maxAttempts: 5,
      });
      return intent;
    });
  }

  async get(actorUserId: string, owner: SocialAccountConnectionOwner, intentId: string) {
    if (actorUserId !== owner.userId) unavailable();
    await this.requireAuthorized(this.client, owner, new Date());
    const value = await this.client.socialPublicationIntent.findFirst({
      where: {
        id: intentId,
        workspaceId: owner.workspaceId,
        groupId: owner.serviceId,
        groupMembershipId: owner.groupMembershipId,
        ownerUserId: owner.userId,
        bunshinId: owner.bunshinId,
      },
      select: publicFields,
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'social publication unavailable');
    return value;
  }

  async claim(input: { workspaceId: string; intentId: string; actorUserId: string }) {
    const now = new Date();
    return this.serializable(async (tx) => {
      const intent = await tx.socialPublicationIntent.findFirst({
        where: { id: input.intentId, workspaceId: input.workspaceId },
      });
      if (!intent || intent.ownerUserId !== input.actorUserId) unavailable();
      if (intent.status === 'PUBLISHED' || intent.status === 'UNKNOWN')
        return { terminal: true as const, status: intent.status };
      if (intent.status === 'FAILED')
        throw new ApplicationError('CONFLICT', 'social publication failed');
      const owner: SocialAccountConnectionOwner = {
        workspaceId: intent.workspaceId,
        serviceId: intent.groupId,
        groupMembershipId: intent.groupMembershipId,
        userId: intent.ownerUserId,
        bunshinId: intent.bunshinId,
      };
      await this.requireAuthorized(tx, owner, now);
      const [profile, connection, variant, selection, media] = await Promise.all([
        tx.socialProfile.findFirst({
          where: {
            id: intent.socialProfileId,
            workspaceId: intent.workspaceId,
            bunshinId: intent.bunshinId,
            platform: 'INSTAGRAM',
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
        tx.socialAccountConnection.findFirst({
          where: {
            ...ownerWhere(owner),
            id: intent.connectionId,
            platform: 'INSTAGRAM',
            status: 'CONNECTED',
            tokenExpiresAt: { gt: now },
            encryptedToken: { not: null },
            grants: { some: { bunshinId: intent.bunshinId } },
          },
          select: { id: true, externalAccountId: true },
        }),
        tx.missionContentVariant.findFirst({
          where: {
            id: intent.contentVariantId,
            workspaceId: intent.workspaceId,
            bunshinId: intent.bunshinId,
            dailyMissionId: intent.dailyMissionId,
            sequence: intent.contentRevision,
            dailyMission: { postRecord: null },
          },
          select: { id: true },
        }),
        tx.missionContentVariantSelection.findFirst({
          where: {
            workspaceId: intent.workspaceId,
            bunshinId: intent.bunshinId,
            dailyMissionId: intent.dailyMissionId,
          },
          orderBy: [{ selectedAt: 'desc' }, { id: 'desc' }],
          select: { variantId: true },
        }),
        tx.socialImageGeneratedMedia.findFirst({
          where: {
            id: intent.mediaId,
            workspaceId: intent.workspaceId,
            groupId: intent.groupId,
            ownerUserId: intent.ownerUserId,
            dailyMissionId: intent.dailyMissionId,
            contentHash: intent.mediaContentHash,
            status: 'READY',
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            request: { bunshinId: intent.bunshinId },
          },
          select: { id: true, requestId: true, completedStorageKey: true },
        }),
      ]);
      if (
        intent.approvalExpiresAt <= now ||
        !profile ||
        !connection ||
        !variant ||
        selection?.variantId !== variant.id ||
        !media
      )
        unavailable();
      await tx.socialPublicationIntent.update({
        where: { id: intent.id },
        data: { status: 'PROCESSING', lastAttemptAt: now },
      });
      return { terminal: false as const, intent, owner, connection, media };
    });
  }

  async recordContainer(intentId: string, containerId: string) {
    return this.serializable(async (tx) => {
      const value = await tx.socialPublicationIntent.findUnique({ where: { id: intentId } });
      if (!value || value.status !== 'PROCESSING') unavailable();
      if (value.containerId && value.containerId !== containerId)
        throw new ApplicationError('CONFLICT', 'publication container already exists');
      return tx.socialPublicationIntent.update({
        where: { id: intentId },
        data: { containerId },
        select: { containerId: true },
      });
    });
  }

  /** Persist UNKNOWN before media_publish so a lost response can never trigger an automatic resend. */
  async beginAmbiguousPublish(intentId: string, containerId: string) {
    const changed = await this.client.socialPublicationIntent.updateMany({
      where: { id: intentId, status: 'PROCESSING', containerId },
      data: { status: 'UNKNOWN', failureCategory: 'AWAITING_PUBLISH_RESULT' },
    });
    if (changed.count !== 1)
      throw new ApplicationError('CONFLICT', 'publication is not publishable');
  }

  async complete(intentId: string, externalPostId: string) {
    const now = new Date();
    return this.serializable(async (tx) => {
      const intent = await tx.socialPublicationIntent.findUnique({ where: { id: intentId } });
      if (!intent || (intent.status !== 'UNKNOWN' && intent.status !== 'PUBLISHED')) unavailable();
      if (intent.status === 'PUBLISHED') {
        if (intent.externalPostId !== externalPostId)
          throw new ApplicationError('CONFLICT', 'publication result mismatch');
        return;
      }
      const existingPost = await tx.postRecord.findUnique({
        where: { dailyMissionId: intent.dailyMissionId },
        select: { source: true, externalPostId: true },
      });
      if (
        existingPost &&
        (existingPost.source !== 'OFFICIAL_API' || existingPost.externalPostId !== externalPostId)
      )
        throw new ApplicationError('CONFLICT', 'daily mission already has another post result');
      if (!existingPost)
        await tx.postRecord.create({
          data: {
            id: randomUUID(),
            workspaceId: intent.workspaceId,
            bunshinId: intent.bunshinId,
            dailyMissionId: intent.dailyMissionId,
            actorUserId: intent.ownerUserId,
            platform: 'INSTAGRAM',
            postedAt: now,
            externalPostId,
            source: 'OFFICIAL_API',
            idempotencyKey: `social-publication:${intent.id}`,
          },
        });
      await tx.socialPublicationIntent.update({
        where: { id: intentId },
        data: { status: 'PUBLISHED', externalPostId, failureCategory: null, publishedAt: now },
      });
    });
  }

  async markFailed(input: { workspaceId: string; intentId: string; errorCategory: string }) {
    await this.client.socialPublicationIntent.updateMany({
      where: {
        id: input.intentId,
        workspaceId: input.workspaceId,
        status: { in: ['APPROVED', 'PROCESSING'] },
      },
      data: { status: 'FAILED', failureCategory: input.errorCategory },
    });
  }

  async getUnknownForReconciliation(
    actorUserId: string,
    owner: SocialAccountConnectionOwner,
    intentId: string,
  ) {
    if (actorUserId !== owner.userId) unavailable();
    const now = new Date();
    await this.requireAuthorized(this.client, owner, now);
    const intent = await this.client.socialPublicationIntent.findFirst({
      where: {
        id: intentId,
        workspaceId: owner.workspaceId,
        groupId: owner.serviceId,
        groupMembershipId: owner.groupMembershipId,
        ownerUserId: owner.userId,
        bunshinId: owner.bunshinId,
        status: 'UNKNOWN',
        containerId: { not: null },
      },
      select: { id: true, connectionId: true, containerId: true, mediaId: true },
    });
    if (!intent?.containerId)
      throw new ApplicationError('NOT_FOUND', 'unknown publication unavailable');
    const media = await this.client.socialImageGeneratedMedia.findFirst({
      where: {
        id: intent.mediaId,
        workspaceId: owner.workspaceId,
        groupId: owner.serviceId,
        ownerUserId: owner.userId,
      },
      select: { completedStorageKey: true },
    });
    if (!media) throw new ApplicationError('NOT_FOUND', 'unknown publication media unavailable');
    return {
      ...intent,
      containerId: intent.containerId,
      completedStorageKey: media.completedStorageKey,
    };
  }

  async recordReconciliation(intentId: string, containerStatus: string) {
    const categories: Record<string, string> = {
      PUBLISHED: 'EXTERNAL_CONTAINER_PUBLISHED_ID_UNRESOLVED',
      FINISHED: 'EXTERNAL_CONTAINER_FINISHED_NOT_RESENT',
      IN_PROGRESS: 'EXTERNAL_CONTAINER_PROCESSING',
      ERROR: 'EXTERNAL_CONTAINER_ERROR',
      EXPIRED: 'EXTERNAL_CONTAINER_EXPIRED',
    };
    const failureCategory = categories[containerStatus];
    if (!failureCategory)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation status');
    const changed = await this.client.socialPublicationIntent.updateMany({
      where: { id: intentId, status: 'UNKNOWN' },
      data: { failureCategory, lastAttemptAt: new Date() },
    });
    if (changed.count !== 1)
      throw new ApplicationError('CONFLICT', 'publication is not reconcilable');
    return { status: 'UNKNOWN' as const, containerStatus };
  }

  private async requireAuthorized(
    tx: Prisma.TransactionClient | PrismaClient,
    owner: SocialAccountConnectionOwner,
    now: Date,
  ) {
    const access = await new PrismaGroupFeatureEntitlementRepository(
      this.client,
    ).resolveAccessInTransaction(tx, {
      workspaceId: owner.workspaceId,
      groupId: owner.serviceId,
      actorUserId: owner.userId,
      featureKey: 'SOCIAL',
      now,
    });
    const [usage, bunshin] = await Promise.all([
      isMemberUsageScopePermitted(tx, owner, now),
      tx.bunshin.findFirst({
        where: {
          id: owner.bunshinId,
          workspaceId: owner.workspaceId,
          groupId: owner.serviceId,
          ownerUserId: owner.userId,
          status: 'ACTIVE',
          capabilityAssignments: {
            some: { capabilityType: 'SOCIAL', status: 'ACTIVE', activatedAt: { lte: now } },
          },
        },
        select: { id: true },
      }),
    ]);
    if (!access?.allowed || !usage || !bunshin) unavailable();
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002');
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new ApplicationError('INTERNAL_ERROR', 'social publication transaction failed');
  }
}
