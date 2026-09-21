import type {
  LineChannelConfiguration,
  LineConfigurationEnvironment,
  LineConfigurationRepository,
  LineRichMenu,
  LineRichMenuRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

function lineConfiguration(
  row: Prisma.LineChannelConfigurationGetPayload<object>,
  exposeMask = true,
): LineChannelConfiguration {
  return {
    id: row.id,
    environment: row.environment,
    version: row.version,
    status: row.status,
    loginChannelId: row.loginChannelId,
    loginSecretMask: exposeMask ? row.loginSecretMask : '登録済み',
    messagingChannelId: row.messagingChannelId,
    messagingSecretMask: exposeMask ? row.messagingSecretMask : '登録済み',
    accessTokenMask: exposeMask ? row.accessTokenMask : '登録済み',
    liffId: row.liffId,
    defaultNotificationTime: row.defaultNotificationTime,
    defaultTimezone: row.defaultTimezone,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
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

type LineRichMenuRow = Prisma.LineRichMenuGetPayload<{ include: { areas: true } }>;
function lineRichMenu(row: LineRichMenuRow): LineRichMenu {
  return {
    id: row.id,
    environment: row.environment,
    version: row.version,
    name: row.name,
    description: row.description,
    status: row.status,
    imageObjectKey: row.imageObjectKey,
    imageSha256: row.imageSha256,
    imageContentType: row.imageContentType,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    lineRichMenuId: row.lineRichMenuId,
    lastSyncedAt: row.lastSyncedAt,
    lastErrorCategory: row.lastErrorCategory,
    areas: row.areas
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ action, x, y, width, height, sortOrder }) => ({
        action,
        x,
        y,
        width,
        height,
        sortOrder,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaLineRichMenuRepository implements LineRichMenuRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
  }

  async listForAdmin(input: Parameters<LineRichMenuRepository['listForAdmin']>[0]) {
    if ((await this.admin(input.actorUserId)) === null) return null;
    const rows = await this.client.lineRichMenu.findMany({
      where: { environment: input.environment },
      include: { areas: true },
      orderBy: { version: 'desc' },
    });
    return rows.map(lineRichMenu);
  }

  async getForPublish(input: Parameters<LineRichMenuRepository['getForPublish']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (
      admin === null ||
      (input.operation === 'PUBLISH' && admin.role !== 'SUPER_ADMIN') ||
      (input.operation === 'DISABLE' && !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
    )
      return null;
    const row = await this.client.lineRichMenu.findFirst({
      where: { id: input.richMenuId, environment: input.environment },
      include: { areas: true },
    });
    return row === null ? null : lineRichMenu(row);
  }

  async createDraft(input: Parameters<LineRichMenuRepository['createDraft']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    return this.client.$transaction(
      async (tx) => {
        const latest = await tx.lineRichMenu.findFirst({
          where: { environment: input.environment },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const row = await tx.lineRichMenu.create({
          data: {
            environment: input.environment,
            version: (latest?.version ?? 0) + 1,
            name: input.name,
            description: input.description,
            imageObjectKey: input.imageObjectKey,
            imageSha256: input.imageSha256,
            imageContentType: input.imageContentType,
            imageWidth: input.imageWidth,
            imageHeight: input.imageHeight,
            areas: { create: input.areas },
          },
          include: { areas: true },
        });
        await tx.lineRichMenuAudit.create({
          data: {
            richMenuId: row.id,
            environment: input.environment,
            actorUserId: input.actorUserId,
            action: 'CREATE_DRAFT',
            reason: input.reason,
            metadata: { version: row.version, imageSha256: row.imageSha256 },
          },
        });
        return lineRichMenu(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markVerified(input: Parameters<LineRichMenuRepository['markVerified']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineRichMenu.findFirst({
        where: {
          id: input.richMenuId,
          environment: input.environment,
          status: { in: ['DRAFT', 'ERROR'] },
        },
      });
      if (target === null) return null;
      const row = await tx.lineRichMenu.update({
        where: { id: target.id },
        data: { status: 'VERIFIED', lastErrorCategory: null },
        include: { areas: true },
      });
      await tx.lineRichMenuAudit.create({
        data: {
          richMenuId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'VERIFY',
          reason: input.reason,
          metadata: { fromStatus: target.status, toStatus: row.status },
        },
      });
      return lineRichMenu(row);
    });
  }

  async activate(input: Parameters<LineRichMenuRepository['activate']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineRichMenu.findFirst({
        where: {
          id: input.richMenuId,
          environment: input.environment,
          status: { in: ['VERIFIED', 'ACTIVE'] },
        },
      });
      if (target === null) return null;
      await tx.lineRichMenu.updateMany({
        where: {
          environment: input.environment,
          status: 'ACTIVE',
          id: { not: target.id },
        },
        data: { status: 'DISABLED' },
      });
      const row = await tx.lineRichMenu.update({
        where: { id: target.id },
        data: {
          status: 'ACTIVE',
          lineRichMenuId: input.lineRichMenuId,
          lastSyncedAt: input.syncedAt,
          lastErrorCategory: null,
        },
        include: { areas: true },
      });
      await tx.lineRichMenuAudit.create({
        data: {
          richMenuId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          metadata: { lineRichMenuId: input.lineRichMenuId, version: row.version },
        },
      });
      return lineRichMenu(row);
    });
  }

  async disable(input: Parameters<LineRichMenuRepository['disable']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineRichMenu.findFirst({
        where: { id: input.richMenuId, environment: input.environment, status: 'ACTIVE' },
      });
      if (target === null) return null;
      const row = await tx.lineRichMenu.update({
        where: { id: target.id },
        data: { status: 'DISABLED', lastSyncedAt: input.syncedAt },
        include: { areas: true },
      });
      await tx.lineRichMenuAudit.create({
        data: {
          richMenuId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'DISABLE',
          reason: input.reason,
          metadata: { lineRichMenuId: row.lineRichMenuId, version: row.version },
        },
      });
      return lineRichMenu(row);
    });
  }
}

export class PrismaLineConfigurationRepository implements LineConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
  }

  async listForAdmin(input: { actorUserId: string; environment: LineConfigurationEnvironment }) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null) return null;
    const rows = await this.client.lineChannelConfiguration.findMany({
      where: { environment: input.environment },
      orderBy: { version: 'desc' },
    });
    return rows.map((row) =>
      lineConfiguration(row, ['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)),
    );
  }

  async createVersion(input: Parameters<LineConfigurationRepository['createVersion']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const latest = await tx.lineChannelConfiguration.findFirst({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      });
      const row = await tx.lineChannelConfiguration.create({
        data: {
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
          defaultNotificationTime: input.defaultNotificationTime,
          defaultTimezone: input.defaultTimezone,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          globallyPaused: input.globallyPaused,
          quotaWarningPercent: input.quotaWarningPercent,
          quotaLowPriorityStop: input.quotaLowPriorityStop,
          keyVersion: input.secrets.keyVersion,
        },
      });
      await tx.lineConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          changedFields: ['credentials', 'notificationDefaults', 'quotaPolicy'],
        },
      });
      return lineConfiguration(row);
    });
  }

  async activate(input: Parameters<LineConfigurationRepository['activate']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.lineChannelConfiguration.findFirst({
        where: { id: input.configurationId, environment: input.environment },
      });
      if (target === null) return null;
      if (target.lastVerifiedAt === null || target.lastErrorCategory !== null)
        throw new ApplicationError('CONFLICT', 'successful connection test required');
      await tx.lineChannelConfiguration.updateMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        data: { status: 'DISABLED' },
      });
      const row = await tx.lineChannelConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
      await tx.lineConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          changedFields: ['status'],
        },
      });
      return lineConfiguration(row);
    });
  }

  async getForConnectionTest(
    input: Parameters<LineConfigurationRepository['getForConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const row = await this.client.lineChannelConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (row === null) return null;
    return {
      configuration: lineConfiguration(row),
      loginSecret: row.encryptedLoginSecret,
      messagingSecret: row.encryptedMessagingSecret,
      accessToken: row.encryptedAccessToken,
    };
  }

  async recordConnectionTest(
    input: Parameters<LineConfigurationRepository['recordConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
      throw new ApplicationError('FORBIDDEN', 'admin required');
    await this.client.$transaction([
      this.client.lineChannelConfiguration.update({
        where: { id: input.configurationId },
        data: {
          ...(input.success ? { lastVerifiedAt: new Date() } : {}),
          lastErrorCategory: input.errorCategory,
          ...(input.success ? {} : { status: 'ERROR' }),
        },
      }),
      this.client.lineConfigurationAudit.create({
        data: {
          configurationId: input.configurationId,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面から接続テストを実行',
          changedFields: ['lastVerifiedAt', 'lastErrorCategory'],
        },
      }),
    ]);
  }
}
