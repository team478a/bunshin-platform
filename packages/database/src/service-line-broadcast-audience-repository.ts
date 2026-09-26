import type {
  ServiceLineBroadcastAudienceRepository,
  ServiceLineBroadcastSegment,
} from '@bunshin/application';
import { type Prisma, type PrismaClient, prisma } from './client';

type Client = PrismaClient | Prisma.TransactionClient;

async function canManage(
  client: Client,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  },
) {
  return client.groupMembership.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      userId: input.actorUserId,
      status: 'ACTIVE',
      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        serviceConfiguration: { isNot: null },
      },
    },
    select: { id: true },
  });
}

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
  constructor(private readonly client: PrismaClient = prisma) {}

  async preview(input: Parameters<ServiceLineBroadcastAudienceRepository['preview']>[0]) {
    if (!(await canManage(this.client, input))) return null;
    const recipients = await eligibleRecipients(this.client, input);
    return { recipientCount: Math.min(recipients.length, 500), capped: recipients.length > 500 };
  }

  async schedule(input: Parameters<ServiceLineBroadcastAudienceRepository['schedule']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await canManage(tx, input))) return { kind: 'ACCESS_DENIED' as const };
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
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          title: input.title,
          message: input.message,
          segmentCriteria,
          status: 'SCHEDULED',
          scheduledAt: input.scheduledAt,
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
            scheduledAt: input.scheduledAt.toISOString(),
          },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return {
        kind: 'SCHEDULED' as const,
        broadcastId: row.id,
        recipientCount: candidates.length,
        scheduledAt: input.scheduledAt,
      };
    });
  }
}
