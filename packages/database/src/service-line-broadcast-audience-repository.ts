import { createHash } from 'node:crypto';
import { ApplicationError } from '@bunshin/shared';
import type {
  ServiceLineBroadcastAudienceRepository,
  ServiceLineBroadcastSegment,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { canManageServiceLineBroadcast } from './service-line-broadcast-scope';
import { PrismaJobRepository } from './automation-jobs';

type Client = PrismaClient | Prisma.TransactionClient;

async function eligibleRecipients(
  client: Client,
  input: { workspaceId: string; groupId: string; segment: ServiceLineBroadcastSegment },
) {
  const segmented = input.segment.industryIds.length > 0 || input.segment.purposes.length > 0;
  return client.groupLineConnection.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      status: 'ACTIVE',
      notificationConsentAt: { not: null },
      friendshipStatus: 'FOLLOWING',
      groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      user: {
        status: 'ACTIVE',
        ...(segmented
          ? {
              registrationProfile: {
                is: {
                  status: 'COMPLETED' as const,
                  ...(input.segment.industryIds.length
                    ? { primaryIndustryId: { in: input.segment.industryIds } }
                    : {}),
                  ...(input.segment.purposes.length
                    ? { primaryPurpose: { in: input.segment.purposes } }
                    : {}),
                },
              },
            }
          : {}),
      },
    },
    select: { groupMembershipId: true, userId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 501,
  });
}

export class PrismaServiceLineBroadcastAudienceRepository implements ServiceLineBroadcastAudienceRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly now = () => new Date(),
  ) {}

  async preview(input: Parameters<ServiceLineBroadcastAudienceRepository['preview']>[0]) {
    if (!(await canManageServiceLineBroadcast(this.client, input))) return null;
    const recipients = await eligibleRecipients(this.client, input);
    return { recipientCount: Math.min(recipients.length, 500), capped: recipients.length > 500 };
  }

  async schedule(input: Parameters<ServiceLineBroadcastAudienceRepository['schedule']>[0]) {
    return this.client
      .$transaction(async (tx) => {
        if (input.operationId)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.operationId}::text, 0))`;
        if (!(await canManageServiceLineBroadcast(tx, input)))
          return { kind: 'ACCESS_DENIED' as const };
        const recordJob = (broadcastId: string, scheduledAt: Date) =>
          new PrismaJobRepository(tx).enqueue({
            environment: input.environment,
            workspaceId: input.workspaceId,
            requestedBy: input.actorUserId,
            correlationId: `service-line-broadcast:${broadcastId}`,
            jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
            payloadReference: `service-line-broadcast:${broadcastId}`,
            idempotencyKey: `service-line-broadcast:${broadcastId}:attempt:1`,
            priority: 40,
            maxAttempts: 3,
            scheduledAt,
          });
        const requestFingerprint = input.operationId
          ? createHash('sha256')
              .update(
                JSON.stringify({
                  contract: 'SERVICE_LINE_BROADCAST_SCHEDULE_V1',
                  operationId: input.operationId,
                  environment: input.environment,
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  actorUserId: input.actorUserId,
                  title: input.title,
                  message: input.message,
                  reason: input.reason,
                  scheduledAt: input.immediate ? null : input.scheduledAt.toISOString(),
                  expectedRecipientCount: input.expectedRecipientCount,
                  segment: {
                    industryIds: [...input.segment.industryIds].sort(),
                    purposes: [...input.segment.purposes].sort(),
                  },
                }),
              )
              .digest('hex')
          : null;
        if (input.operationId) {
          const existing = await tx.serviceLineBroadcast.findFirst({
            where: {
              id: input.operationId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
            },
          });
          if (existing) {
            const audit = await tx.serviceLineBroadcastAuditLog.findFirst({
              where: {
                broadcastId: existing.id,
                workspaceId: input.workspaceId,
                groupId: input.groupId,
                action: 'SCHEDULED',
                performedByUserId: input.actorUserId,
              },
              orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            });
            const recorded = audit?.afterData as
              { requestFingerprint?: unknown; recipients?: unknown } | undefined;
            if (
              existing.createdByUserId !== input.actorUserId ||
              !existing.scheduledAt ||
              recorded?.requestFingerprint !== requestFingerprint ||
              recorded.recipients !== input.expectedRecipientCount
            )
              throw new ApplicationError(
                'CONFLICT',
                'broadcast operation does not match its recorded request',
              );
            if (existing.status === 'SCHEDULED') await recordJob(existing.id, existing.scheduledAt);
            return {
              kind: 'SCHEDULED' as const,
              broadcastId: existing.id,
              recipientCount: input.expectedRecipientCount,
              scheduledAt: existing.scheduledAt,
              replayed: true,
              status: existing.status,
            };
          }
          if (!input.immediate && input.scheduledAt.getTime() < this.now().getTime() - 5_000)
            throw new ApplicationError('VALIDATION_ERROR', 'invalid scheduledAt');
        }
        const scheduledAt = input.immediate ? this.now() : input.scheduledAt;
        const configuration = await tx.groupLineChannelConfiguration.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
            status: 'ACTIVE',
            lastVerifiedAt: { not: null },
            lastErrorCategory: null,
            globallyPaused: false,
          },
          select: { id: true },
        });
        if (!configuration) return { kind: 'CONFIGURATION_UNAVAILABLE' as const };
        const candidates = await eligibleRecipients(tx, input);
        if (!candidates.length) return { kind: 'NO_RECIPIENTS' as const };
        if (candidates.length > 500 || candidates.length !== input.expectedRecipientCount)
          return { kind: 'RECIPIENT_COUNT_CHANGED' as const };
        const segmentCriteria: Prisma.InputJsonObject = {
          industryIds: input.segment.industryIds,
          purposes: input.segment.purposes,
        };

        const row = await tx.serviceLineBroadcast.create({
          data: {
            ...(input.operationId ? { id: input.operationId } : {}),
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            title: input.title,
            message: input.message,
            segmentCriteria,
            status: 'SCHEDULED',
            scheduledAt,
            createdByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId,
          },
          select: { id: true },
        });
        await tx.serviceLineBroadcastRecipient.createMany({
          data: candidates.map((recipient) => ({
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            broadcastId: row.id,
            groupMembershipId: recipient.groupMembershipId,
            userId: recipient.userId,
          })),
        });
        await tx.serviceLineBroadcastAuditLog.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            broadcastId: row.id,
            action: 'SCHEDULED',
            beforeData: {},
            afterData: {
              recipients: candidates.length,
              segment: segmentCriteria,
              environment: input.environment,
              scheduledAt: scheduledAt.toISOString(),
              ...(requestFingerprint ? { requestFingerprint } : {}),
            },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        if (input.operationId) await recordJob(row.id, scheduledAt);
        return {
          kind: 'SCHEDULED' as const,
          broadcastId: row.id,
          recipientCount: candidates.length,
          scheduledAt,
          ...(input.operationId ? { replayed: false, status: 'SCHEDULED' as const } : {}),
        };
      })
      .catch((error: unknown) => {
        if (
          input.operationId &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ApplicationError('CONFLICT', 'broadcast operation is already in use');
        throw error;
      });
  }
}
