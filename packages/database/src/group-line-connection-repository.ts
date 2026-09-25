import type { GroupLineConnectionRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaGroupLineConnectionRepository implements GroupLineConnectionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async connectVerified(input: Parameters<GroupLineConnectionRepository['connectVerified']>[0]) {
    return this.client.$transaction(async (tx) => {
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
      const configuration = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          status: 'ACTIVE',
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
          group: {
            lineRoutingPolicies: {
              some: { environment: input.environment, mode: 'DEDICATED', pilotEnabled: true },
            },
          },
        },
        select: { id: true },
      });
      if (!membership || !configuration) return false;
      const [providerConnection, userConnection] = await Promise.all([
        tx.groupLineConnection.findUnique({
          where: {
            configurationId_providerUserId: {
              configurationId: input.configurationId,
              providerUserId: input.verifiedProviderUserId,
            },
          },
          select: { id: true, userId: true },
        }),
        tx.groupLineConnection.findUnique({
          where: {
            configurationId_userId: {
              configurationId: input.configurationId,
              userId: input.actorUserId,
            },
          },
          select: { id: true },
        }),
      ]);
      if (providerConnection && providerConnection.userId !== input.actorUserId) {
        // A verified LINE login proves control of the notification destination. Move the
        // destination from a stale/duplicate app registration and stop pending delivery
        // to that registration instead of asking the person to register again.
        if (userConnection && userConnection.id !== providerConnection.id)
          await tx.groupLineConnection.delete({ where: { id: userConnection.id } });
        const moved = await tx.groupLineConnection.updateMany({
          where: {
            id: providerConnection.id,
            configurationId: input.configurationId,
            userId: providerConnection.userId,
          },
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: input.groupMembershipId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            notificationConsentAt: input.consentGranted ? new Date() : null,
          },
        });
        if (moved.count !== 1) throw new Error('LINE destination ownership changed');
        await tx.lineMessageDelivery.updateMany({
          where: {
            environment: input.environment,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: providerConnection.userId,
            status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
            sentAt: null,
            cancelledAt: null,
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            lastErrorCategory: 'RECIPIENT_UNAVAILABLE',
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return true;
      }
      await tx.groupLineConnection.upsert({
        where: {
          configurationId_userId: {
            configurationId: input.configurationId,
            userId: input.actorUserId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: input.groupMembershipId,
          userId: input.actorUserId,
          configurationId: input.configurationId,
          providerUserId: input.verifiedProviderUserId,
          notificationConsentAt: input.consentGranted ? new Date() : null,
        },
        update: {
          groupMembershipId: input.groupMembershipId,
          providerUserId: input.verifiedProviderUserId,
          status: 'ACTIVE',
          notificationConsentAt: input.consentGranted ? new Date() : null,
        },
      });
      return true;
    });
  }

  async applyWebhook(input: Parameters<GroupLineConnectionRepository['applyWebhook']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const configuration = await tx.groupLineChannelConfiguration.findFirst({
          where: {
            id: input.configurationId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
            status: 'ACTIVE',
            group: {
              status: 'ACTIVE',
              lineRoutingPolicies: {
                some: { environment: input.environment, mode: 'DEDICATED', pilotEnabled: true },
              },
            },
          },
          select: { id: true },
        });
        if (!configuration) return 'IGNORED' as const;
        const duplicate = await tx.groupLineWebhookEvent.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: input.configurationId,
              providerEventId: input.providerEventId,
            },
          },
          select: { id: true },
        });
        if (duplicate) return 'DUPLICATE' as const;
        let outcome: 'APPLIED' | 'CONNECTION_NOT_FOUND' | 'IGNORED';
        if (input.type === 'OTHER' || input.providerUserId === null) outcome = 'IGNORED';
        else {
          const connection = await tx.groupLineConnection.findFirst({
            where: {
              configurationId: input.configurationId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              providerUserId: input.providerUserId,
              status: 'ACTIVE',
              user: { status: 'ACTIVE' },
              groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
            },
          });
          if (!connection) outcome = 'CONNECTION_NOT_FOUND';
          else if (
            connection.lastWebhookAt &&
            connection.lastWebhookAt.getTime() >= input.occurredAt.getTime()
          )
            outcome = 'IGNORED';
          else {
            const following = input.type === 'FOLLOW';
            await tx.groupLineConnection.update({
              where: { id: connection.id },
              data: {
                friendshipStatus: following ? 'FOLLOWING' : 'UNFOLLOWED',
                ...(following
                  ? { followedAt: input.occurredAt }
                  : { unfollowedAt: input.occurredAt }),
                lastWebhookAt: input.occurredAt,
              },
            });
            if (!following)
              await tx.lineMessageDelivery.updateMany({
                where: {
                  environment: input.environment,
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  userId: connection.userId,
                  status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
                  sentAt: null,
                  cancelledAt: null,
                },
                data: {
                  status: 'CANCELLED',
                  cancelledAt: input.processedAt,
                  lastErrorCategory: 'RECIPIENT_UNAVAILABLE',
                  leaseOwner: null,
                  leaseExpiresAt: null,
                },
              });
            outcome = 'APPLIED';
          }
        }
        await tx.groupLineWebhookEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            configurationId: input.configurationId,
            providerEventId: input.providerEventId,
            type: input.type,
            outcome,
            occurredAt: input.occurredAt,
            processedAt: input.processedAt,
          },
        });
        return outcome;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'DUPLICATE';
      throw error;
    }
  }
}
