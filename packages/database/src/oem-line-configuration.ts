import type {
  GroupLineChannelConfiguration,
  GroupLineConfigurationRepository,
  GroupLineConnectionRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function groupLineConfiguration(
  row: Prisma.GroupLineChannelConfigurationGetPayload<object>,
): GroupLineChannelConfiguration {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    environment: row.environment,
    version: row.version,
    status: row.status,
    webhookRoutingKey: row.webhookRoutingKey,
    loginChannelId: row.loginChannelId,
    loginSecretMask: row.loginSecretMask,
    messagingChannelId: row.messagingChannelId,
    messagingSecretMask: row.messagingSecretMask,
    accessTokenMask: row.accessTokenMask,
    liffId: row.liffId,
    globallyPaused: row.globallyPaused,
    quotaWarningPercent: row.quotaWarningPercent,
    quotaLowPriorityStop: row.quotaLowPriorityStop,
    keyVersion: row.keyVersion,
    lastVerifiedAt: row.lastVerifiedAt,
    lastErrorCategory: row.lastErrorCategory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaGroupLineConfigurationRepository implements GroupLineConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async access(actorUserId: string, workspaceId: string, groupId: string) {
    const [admin, manager] = await Promise.all([
      this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE' },
        select: { role: true },
      }),
      this.client.groupMembership.findFirst({
        where: {
          userId: actorUserId,
          workspaceId,
          groupId,
          OR: [
            { role: 'MANAGER' },
            {
              serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
              group: { serviceConfiguration: { isNot: null } },
            },
          ],
          status: 'ACTIVE',
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      }),
    ]);
    return { admin, manager };
  }

  async list(input: Parameters<GroupLineConfigurationRepository['list']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (!access.admin && !access.manager) return null;
    const policy = await this.client.groupLineRoutingPolicy.findUnique({
      where: {
        workspaceId_groupId_environment: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
        },
      },
    });
    const rows = await this.client.groupLineChannelConfiguration.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        environment: input.environment,
      },
      orderBy: { version: 'desc' },
    });
    return {
      mode: policy?.mode ?? 'SHARED',
      pilotEnabled: policy?.pilotEnabled ?? false,
      configurations: rows.map(groupLineConfiguration),
    };
  }

  async createVersion(input: Parameters<GroupLineConfigurationRepository['createVersion']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (access.admin?.role !== 'SUPER_ADMIN' && !access.manager) return null;
    return this.client.$transaction(async (tx) => {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { dedicatedLineEnabled: true, suspended: true },
      });
      if (entitlement && (!entitlement.dedicatedLineEnabled || entitlement.suspended))
        throw new ApplicationError('FORBIDDEN', 'dedicated LINE is not included in the contract');
      const policy = await tx.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
      });
      if (!policy || policy.mode !== 'DEDICATED' || !policy.pilotEnabled)
        throw new ApplicationError('CONFLICT', 'dedicated LINE pilot is not enabled');
      const latest = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
        },
        orderBy: { version: 'desc' },
      });
      const row = await tx.groupLineChannelConfiguration.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          loginChannelId: input.loginChannelId,
          encryptedLoginSecret: input.secrets.loginSecret,
          loginSecretMask: input.secrets.loginSecretMask,
          messagingChannelId: input.messagingChannelId,
          encryptedMessagingSecret: input.secrets.messagingSecret,
          messagingSecretMask: input.secrets.messagingSecretMask,
          encryptedAccessToken: input.secrets.accessToken,
          accessTokenMask: input.secrets.accessTokenMask,
          liffId: input.liffId,
          globallyPaused: true,
          quotaWarningPercent: input.quotaWarningPercent,
          quotaLowPriorityStop: input.quotaLowPriorityStop,
          keyVersion: input.secrets.keyVersion,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          afterData: { version: row.version, status: row.status },
        },
      });
      return groupLineConfiguration(row);
    });
  }

  async getForTest(input: Parameters<GroupLineConfigurationRepository['getForTest']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (
      (!access.admin || !['SUPER_ADMIN', 'OPERATOR'].includes(access.admin.role)) &&
      !access.manager
    )
      return null;
    const row = await this.client.groupLineChannelConfiguration.findFirst({
      where: {
        id: input.configurationId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        environment: input.environment,
      },
    });
    return row
      ? {
          configuration: groupLineConfiguration(row),
          loginSecret: row.encryptedLoginSecret,
          messagingSecret: row.encryptedMessagingSecret,
          accessToken: row.encryptedAccessToken,
        }
      : null;
  }

  async recordTest(input: Parameters<GroupLineConfigurationRepository['recordTest']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (
      (!access.admin || !['SUPER_ADMIN', 'OPERATOR'].includes(access.admin.role)) &&
      !access.manager
    )
      throw new ApplicationError('FORBIDDEN', 'admin required');
    await this.client.$transaction(async (tx) => {
      const target = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
        },
      });
      if (!target) throw new ApplicationError('NOT_FOUND', 'configuration not found');
      await tx.groupLineChannelConfiguration.update({
        where: { id: target.id },
        data: {
          lastVerifiedAt: input.success ? new Date() : target.lastVerifiedAt,
          lastErrorCategory: input.errorCategory,
          status: input.success ? 'DRAFT' : 'ERROR',
        },
      });
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: target.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面から接続テストを実行',
          afterData: { success: input.success, errorCategory: input.errorCategory },
        },
      });
    });
  }

  async activate(input: Parameters<GroupLineConfigurationRepository['activate']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (access.admin?.role !== 'SUPER_ADMIN' && !access.manager) return null;
    return this.client.$transaction(async (tx) => {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { dedicatedLineEnabled: true, suspended: true },
      });
      if (entitlement && (!entitlement.dedicatedLineEnabled || entitlement.suspended)) return null;
      const target = await tx.groupLineChannelConfiguration.findFirst({
        where: {
          id: input.configurationId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          lastVerifiedAt: { not: null },
          lastErrorCategory: null,
        },
      });
      if (!target) return null;
      await tx.groupLineChannelConfiguration.updateMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          status: 'ACTIVE',
        },
        data: { status: 'DISABLED', globallyPaused: true },
      });
      const row = await tx.groupLineChannelConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', globallyPaused: false },
      });
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          beforeData: { status: target.status, globallyPaused: target.globallyPaused },
          afterData: { status: row.status, globallyPaused: row.globallyPaused },
        },
      });
      return groupLineConfiguration(row);
    });
  }

  async setPolicy(input: Parameters<GroupLineConfigurationRepository['setPolicy']>[0]) {
    const access = await this.access(input.actorUserId, input.workspaceId, input.groupId);
    if (access.admin?.role !== 'SUPER_ADMIN' && !access.manager) return null;
    return this.client.$transaction(async (tx) => {
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { dedicatedLineEnabled: true, suspended: true },
      });
      if (
        input.mode === 'DEDICATED' &&
        entitlement &&
        (!entitlement.dedicatedLineEnabled || entitlement.suspended)
      )
        return null;
      const group = await tx.group.findFirst({
        where: { id: input.groupId, workspaceId: input.workspaceId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!group) return null;
      const before = await tx.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
      });
      const policy = await tx.groupLineRoutingPolicy.upsert({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          mode: input.mode,
          pilotEnabled: input.pilotEnabled,
          reason: input.reason,
          updatedByUserId: input.actorUserId,
        },
        update: {
          mode: input.mode,
          pilotEnabled: input.pilotEnabled,
          reason: input.reason,
          updatedByUserId: input.actorUserId,
        },
      });
      if (input.mode !== 'DEDICATED') {
        await tx.groupLineChannelConfiguration.updateMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            environment: input.environment,
            status: 'ACTIVE',
          },
          data: { status: 'DISABLED', globallyPaused: true },
        });
      }
      await tx.groupLineConfigurationAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'SET_POLICY',
          reason: input.reason,
          ...(before
            ? { beforeData: { mode: before.mode, pilotEnabled: before.pilotEnabled } }
            : {}),
          afterData: { mode: policy.mode, pilotEnabled: policy.pilotEnabled },
        },
      });
      return { mode: policy.mode, pilotEnabled: policy.pilotEnabled };
    });
  }
}

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
