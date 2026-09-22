import type { LineConnection, LineConnectionRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

function lineConnection(row: Prisma.LineConnectionGetPayload<object>): LineConnection {
  return {
    id: row.id,
    environment: row.environment,
    workspaceId: row.workspaceId,
    userId: row.userId,
    status: row.status,
    friendshipStatus: row.friendshipStatus,
    notificationConsentAt: row.notificationConsentAt,
    followedAt: row.followedAt,
    unfollowedAt: row.unfollowedAt,
    lastWebhookAt: row.lastWebhookAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaLineConnectionRepository implements LineConnectionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async connect(input: Parameters<LineConnectionRepository['connect']>[0]) {
    const identity = await this.client.authIdentity.findFirst({
      where: {
        provider: 'LINE',
        providerUserId: input.providerUserId,
        userId: input.actorUserId,
        user: {
          status: 'ACTIVE',
          memberships: {
            some: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          },
        },
      },
      select: { id: true },
    });
    if (!identity) return null;
    const row = await this.client.lineConnection.upsert({
      where: {
        environment_workspaceId_userId: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
        },
      },
      create: {
        environment: input.environment,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        providerUserId: input.providerUserId,
        notificationConsentAt: input.consentGranted ? new Date() : null,
      },
      update: {
        providerUserId: input.providerUserId,
        status: 'ACTIVE',
        notificationConsentAt: input.consentGranted ? new Date() : null,
      },
    });
    return lineConnection(row);
  }

  async disconnect(input: Parameters<LineConnectionRepository['disconnect']>[0]) {
    return this.client.$transaction(async (tx) => {
      const connection = await tx.lineConnection.updateMany({
        where: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
            memberships: {
              some: { workspaceId: input.workspaceId, status: 'ACTIVE' },
            },
          },
        },
        data: {
          status: 'DISCONNECTED',
          notificationConsentAt: null,
        },
      });
      if (connection.count !== 1) return false;
      await tx.lineMessageDelivery.updateMany({
        where: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
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
    });
  }

  async applyWebhook(input: Parameters<LineConnectionRepository['applyWebhook']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const duplicate = await tx.lineWebhookEvent.findUnique({
          where: {
            environment_providerEventId: {
              environment: input.environment,
              providerEventId: input.providerEventId,
            },
          },
          select: { id: true },
        });
        if (duplicate) return 'DUPLICATE' as const;

        let outcome: 'APPLIED' | 'IDENTITY_NOT_FOUND' | 'CONNECTION_NOT_FOUND' | 'IGNORED';
        let workspaceId: string | null = null;
        if (input.type === 'OTHER' || input.providerUserId === null) {
          outcome = 'IGNORED';
        } else {
          const identity = await tx.authIdentity.findUnique({
            where: {
              provider_providerUserId: {
                provider: 'LINE',
                providerUserId: input.providerUserId,
              },
            },
            include: { user: { select: { status: true } } },
          });
          if (!identity || identity.user.status !== 'ACTIVE') {
            outcome = 'IDENTITY_NOT_FOUND';
          } else {
            const connections = await tx.lineConnection.findMany({
              where: {
                environment: input.environment,
                providerUserId: input.providerUserId,
                userId: identity.userId,
                status: 'ACTIVE',
              },
              select: { workspaceId: true },
            });
            if (connections.length === 0) {
              outcome = 'CONNECTION_NOT_FOUND';
            } else {
              const following = input.type === 'FOLLOW';
              await tx.lineConnection.updateMany({
                where: {
                  environment: input.environment,
                  providerUserId: input.providerUserId,
                  userId: identity.userId,
                  status: 'ACTIVE',
                },
                data: {
                  friendshipStatus: following ? 'FOLLOWING' : 'UNFOLLOWED',
                  ...(following
                    ? { followedAt: input.occurredAt }
                    : { unfollowedAt: input.occurredAt }),
                  lastWebhookAt: input.occurredAt,
                },
              });
              if (!following) {
                await tx.lineMessageDelivery.updateMany({
                  where: {
                    environment: input.environment,
                    userId: identity.userId,
                    workspaceId: { in: connections.map((connection) => connection.workspaceId) },
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
              }
              outcome = 'APPLIED';
              workspaceId = connections.length === 1 ? connections[0]!.workspaceId : null;
            }
          }
        }
        await tx.lineWebhookEvent.create({
          data: {
            environment: input.environment,
            providerEventId: input.providerEventId,
            type: input.type,
            outcome,
            occurredAt: input.occurredAt,
            processedAt: input.processedAt,
            workspaceId,
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

  async resolve(input: Parameters<LineConnectionRepository['resolve']>[0]) {
    if (input.groupId) {
      const row = await this.client.groupLineConnection.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.userId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          configuration: {
            environment: input.environment,
            status: 'ACTIVE',
            globallyPaused: false,
            lastVerifiedAt: { not: null },
            lastErrorCategory: null,
          },
          group: {
            status: 'ACTIVE',
            lineRoutingPolicies: {
              some: {
                environment: input.environment,
                mode: 'DEDICATED',
                pilotEnabled: true,
              },
            },
          },
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            ...(input.bunshinId
              ? {
                  bunshins: {
                    some: {
                      id: input.bunshinId,
                      status: { not: 'ARCHIVED' as const },
                      lineNotificationPreferences: {
                        some: {
                          userId: input.userId,
                          enabled: true,
                          notificationConsentAt: { not: null },
                        },
                      },
                    },
                  },
                }
              : {}),
          },
        },
        select: { providerUserId: true },
      });
      return row?.providerUserId ?? null;
    }
    if (!input.bunshinId) {
      const row = await this.client.lineConnection.findFirst({
        where: {
          environment: input.environment,
          workspaceId: input.workspaceId,
          userId: input.userId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          user: {
            status: 'ACTIVE',
            memberships: { some: { workspaceId: input.workspaceId, status: 'ACTIVE' } },
          },
          workspace: { status: 'ACTIVE' },
        },
        select: { providerUserId: true },
      });
      return row?.providerUserId ?? null;
    }
    const row = await this.client.lineConnection.findFirst({
      where: {
        environment: input.environment,
        workspaceId: input.workspaceId,
        userId: input.userId,
        status: 'ACTIVE',
        friendshipStatus: 'FOLLOWING',
        notificationConsentAt: { not: null },
        user: {
          status: 'ACTIVE',
          memberships: {
            some: { workspaceId: input.workspaceId, status: 'ACTIVE' },
          },
        },
        workspace: { status: 'ACTIVE' },
      },
      select: {
        providerUserId: true,
        workspace: {
          select: {
            bunshins: {
              where: {
                id: input.bunshinId,
                status: { not: 'ARCHIVED' },
                lineNotificationPreferences: {
                  some: {
                    userId: input.userId,
                    enabled: true,
                    notificationConsentAt: { not: null },
                  },
                },
              },
              select: { id: true },
            },
          },
        },
      },
    });
    return row && (!input.bunshinId || row.workspace.bunshins.length === 1)
      ? row.providerUserId
      : null;
  }
}
