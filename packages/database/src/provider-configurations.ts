import type {
  AdminEmailConfiguration,
  AdminEmailConfigurationRepository,
  AiProviderConfiguration,
  AiProviderConfigurationRepository,
  VideoAiProviderCostPolicyRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type Prisma, type PrismaClient, prisma } from './client';

function aiProviderConfiguration(
  row: Prisma.AiProviderConfigurationGetPayload<object>,
  exposeMask = true,
): AiProviderConfiguration {
  return {
    id: row.id,
    environment: row.environment,
    provider: row.provider,
    version: row.version,
    status: row.status,
    apiKeyConfigured: row.encryptedApiKey !== null,
    apiKeyMask: exposeMask ? row.apiKeyMask : row.encryptedApiKey === null ? null : '登録済み',
    model: row.model,
    dailyBudgetUsdMicros: row.dailyBudgetUsdMicros,
    monthlyBudgetUsdMicros: row.monthlyBudgetUsdMicros,
    requestCostUsdMicros: row.requestCostUsdMicros,
    globallyPaused: row.globallyPaused,
    keyVersion: row.keyVersion,
    lastVerifiedAt: row.lastVerifiedAt,
    lastErrorCategory: row.lastErrorCategory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function adminEmailConfiguration(
  row: Prisma.AdminEmailConfigurationGetPayload<object>,
): AdminEmailConfiguration {
  return {
    ...row,
    recipientEmails: Array.isArray(row.recipientEmails)
      ? row.recipientEmails.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

export class PrismaAiProviderConfigurationRepository implements AiProviderConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
    });
  }

  async listForAdmin(input: Parameters<AiProviderConfigurationRepository['listForAdmin']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null) return null;
    const rows = await this.client.aiProviderConfiguration.findMany({
      where: { environment: input.environment },
      orderBy: [{ provider: 'asc' }, { version: 'desc' }],
    });
    return rows.map((row) =>
      aiProviderConfiguration(row, ['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)),
    );
  }

  async createVersion(input: Parameters<AiProviderConfigurationRepository['createVersion']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const latest = await tx.aiProviderConfiguration.findFirst({
        where: { environment: input.environment, provider: input.provider },
        orderBy: { version: 'desc' },
      });
      const row = await tx.aiProviderConfiguration.create({
        data: {
          environment: input.environment,
          provider: input.provider,
          version: (latest?.version ?? 0) + 1,
          encryptedApiKey: input.apiKey?.encryptedValue ?? null,
          apiKeyMask: input.apiKey?.mask ?? null,
          keyVersion: input.apiKey?.keyVersion ?? 1,
          model: input.model,
          dailyBudgetUsdMicros: input.dailyBudgetUsdMicros,
          monthlyBudgetUsdMicros: input.monthlyBudgetUsdMicros,
          requestCostUsdMicros: input.requestCostUsdMicros ?? 0,
          globallyPaused: true,
        },
      });
      await tx.aiProviderConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          provider: input.provider,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          changedFields: [
            ...(input.apiKey === null ? [] : ['credentials']),
            'model',
            'budgetPolicy',
            'globallyPaused',
          ],
        },
      });
      return aiProviderConfiguration(row);
    });
  }

  async getForConnectionTest(
    input: Parameters<AiProviderConfigurationRepository['getForConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const row = await this.client.aiProviderConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (row?.encryptedApiKey == null) return null;
    return { configuration: aiProviderConfiguration(row), encryptedApiKey: row.encryptedApiKey };
  }

  async recordConnectionTest(
    input: Parameters<AiProviderConfigurationRepository['recordConnectionTest']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
      throw new ApplicationError('FORBIDDEN', 'admin required');
    const target = await this.client.aiProviderConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (target === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    await this.client.$transaction([
      this.client.aiProviderConfiguration.update({
        where: { id: target.id },
        data: {
          ...(input.success
            ? { lastVerifiedAt: new Date(), status: 'DRAFT' }
            : { status: 'ERROR' }),
          lastErrorCategory: input.errorCategory,
        },
      }),
      this.client.aiProviderConfigurationAudit.create({
        data: {
          configurationId: target.id,
          environment: input.environment,
          provider: target.provider,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面から接続テストを実行',
          changedFields: ['lastVerifiedAt', 'lastErrorCategory', 'status'],
        },
      }),
    ]);
  }

  async activate(input: Parameters<AiProviderConfigurationRepository['activate']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.aiProviderConfiguration.findFirst({
        where: { id: input.configurationId, environment: input.environment },
      });
      if (target === null) return null;
      if (
        target.encryptedApiKey === null ||
        target.lastVerifiedAt === null ||
        target.lastErrorCategory
      )
        throw new ApplicationError('CONFLICT', 'successful connection test required');
      await tx.aiProviderConfiguration.updateMany({
        where: { environment: input.environment, provider: target.provider, status: 'ACTIVE' },
        data: { status: 'DISABLED', globallyPaused: true },
      });
      const row = await tx.aiProviderConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', globallyPaused: false },
      });
      await tx.aiProviderConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          provider: row.provider,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          changedFields: ['status', 'globallyPaused'],
        },
      });
      return aiProviderConfiguration(row);
    });
  }

  async pause(input: Parameters<AiProviderConfigurationRepository['pause']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN' && admin?.role !== 'OPERATOR') return null;
    const target = await this.client.aiProviderConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (target === null) return null;
    const row = await this.client.aiProviderConfiguration.update({
      where: { id: target.id },
      data: { globallyPaused: true },
    });
    await this.client.aiProviderConfigurationAudit.create({
      data: {
        configurationId: row.id,
        environment: input.environment,
        provider: row.provider,
        actorUserId: input.actorUserId,
        action: 'PAUSE',
        reason: input.reason,
        changedFields: ['globallyPaused'],
      },
    });
    return aiProviderConfiguration(row);
  }

  async getActiveForRuntime(
    input: Parameters<AiProviderConfigurationRepository['getActiveForRuntime']>[0],
  ) {
    const row = await this.client.aiProviderConfiguration.findFirst({
      where: {
        environment: input.environment,
        provider: input.provider,
        status: 'ACTIVE',
      },
    });
    if (row?.encryptedApiKey == null) return null;
    const provider = input.provider.toLowerCase();
    const [daily, monthly] = await Promise.all([
      this.client.aiUsageEvent.aggregate({
        where: { provider, occurredAt: { gte: input.dailyFrom, lt: input.now } },
        _sum: { estimatedCostUsdMicros: true },
      }),
      this.client.aiUsageEvent.aggregate({
        where: { provider, occurredAt: { gte: input.monthlyFrom, lt: input.now } },
        _sum: { estimatedCostUsdMicros: true },
      }),
    ]);
    const safeNumber = (value: bigint | null) =>
      value === null
        ? 0
        : Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : value);
    return {
      configuration: aiProviderConfiguration(row),
      encryptedApiKey: row.encryptedApiKey,
      dailySpentUsdMicros: safeNumber(daily._sum.estimatedCostUsdMicros),
      monthlySpentUsdMicros: safeNumber(monthly._sum.estimatedCostUsdMicros),
    };
  }
}

/**
 * Keeps video-generation budget reservation separate from general AI text usage.
 * The estimated amount is deliberately retained for every queued request so a failed
 * provider response cannot silently make the available budget look larger than it is.
 */
export class PrismaVideoAiProviderCostPolicyRepository implements VideoAiProviderCostPolicyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActive(input: Parameters<VideoAiProviderCostPolicyRepository['findActive']>[0]) {
    const configuration = await this.client.aiProviderConfiguration.findFirst({
      where: {
        environment: input.environment,
        provider: input.provider,
        model: input.model,
        status: 'ACTIVE',
        globallyPaused: false,
        encryptedApiKey: { not: null },
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    });
    if (!configuration) return null;
    const total = async (from: Date) => {
      const value = await this.client.videoSceneGeneration.aggregate({
        where: {
          provider: input.provider,
          model: input.model,
          createdAt: { gte: from, lt: input.now },
        },
        _sum: { estimatedCostUsdMicros: true },
      });
      return value._sum.estimatedCostUsdMicros ?? 0;
    };
    const [dailySpentUsdMicros, monthlySpentUsdMicros] = await Promise.all([
      total(input.dailyFrom),
      total(input.monthlyFrom),
    ]);
    return {
      policy: {
        provider: input.provider,
        model: input.model,
        globallyPaused: configuration.globallyPaused,
        dailyBudgetUsdMicros: configuration.dailyBudgetUsdMicros,
        monthlyBudgetUsdMicros: configuration.monthlyBudgetUsdMicros,
        maxSceneCostUsdMicros: configuration.requestCostUsdMicros,
      },
      dailySpentUsdMicros,
      monthlySpentUsdMicros,
    };
  }
}

export class PrismaAdminEmailConfigurationRepository implements AdminEmailConfigurationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private admin(userId: string) {
    return this.client.platformAdmin.findFirst({ where: { userId, status: 'ACTIVE' } });
  }
  async list(input: Parameters<AdminEmailConfigurationRepository['list']>[0]) {
    if (!(await this.admin(input.actorUserId))) return null;
    return (
      await this.client.adminEmailConfiguration.findMany({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      })
    ).map(adminEmailConfiguration);
  }
  async create(input: Parameters<AdminEmailConfigurationRepository['create']>[0]) {
    if ((await this.admin(input.actorUserId))?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const latest = await tx.adminEmailConfiguration.findFirst({
        where: { environment: input.environment },
        orderBy: { version: 'desc' },
      });
      const row = await tx.adminEmailConfiguration.create({
        data: {
          environment: input.environment,
          version: (latest?.version ?? 0) + 1,
          encryptedApiKey: input.apiKey.encryptedValue,
          apiKeyMask: input.apiKey.mask,
          keyVersion: input.apiKey.keyVersion,
          fromEmail: input.fromEmail,
          recipientEmails: input.recipientEmails,
        },
      });
      await tx.adminEmailConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CREATE_VERSION',
          reason: input.reason,
          changedFields: ['credentials', 'fromEmail', 'recipientEmails'],
        },
      });
      return adminEmailConfiguration(row);
    });
  }
  async forTest(input: Parameters<AdminEmailConfigurationRepository['forTest']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const row = await this.client.adminEmailConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    return row
      ? { configuration: adminEmailConfiguration(row), encryptedApiKey: row.encryptedApiKey }
      : null;
  }
  async recordTest(input: Parameters<AdminEmailConfigurationRepository['recordTest']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role))
      throw new ApplicationError('FORBIDDEN', 'admin required');
    const target = await this.client.adminEmailConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (!target) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    await this.client.$transaction([
      this.client.adminEmailConfiguration.update({
        where: { id: target.id },
        data: {
          status: input.success ? 'DRAFT' : 'ERROR',
          lastVerifiedAt: input.success ? new Date() : target.lastVerifiedAt,
          lastErrorCategory: input.errorCategory,
        },
      }),
      this.client.adminEmailConfigurationAudit.create({
        data: {
          configurationId: target.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'CONNECTION_TEST',
          reason: '管理画面からテストメールを送信',
          changedFields: ['lastVerifiedAt', 'lastErrorCategory', 'status'],
        },
      }),
    ]);
  }
  async activate(input: Parameters<AdminEmailConfigurationRepository['activate']>[0]) {
    if ((await this.admin(input.actorUserId))?.role !== 'SUPER_ADMIN') return null;
    return this.client.$transaction(async (tx) => {
      const target = await tx.adminEmailConfiguration.findFirst({
        where: { id: input.configurationId, environment: input.environment },
      });
      if (!target) return null;
      if (!target.lastVerifiedAt || target.lastErrorCategory)
        throw new ApplicationError('CONFLICT', 'successful connection test required');
      await tx.adminEmailConfiguration.updateMany({
        where: { environment: input.environment, status: 'ACTIVE' },
        data: { status: 'DISABLED', globallyPaused: true },
      });
      const row = await tx.adminEmailConfiguration.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', globallyPaused: false },
      });
      await tx.adminEmailConfigurationAudit.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          actorUserId: input.actorUserId,
          action: 'ACTIVATE',
          reason: input.reason,
          changedFields: ['status', 'globallyPaused'],
        },
      });
      return adminEmailConfiguration(row);
    });
  }
  async pause(input: Parameters<AdminEmailConfigurationRepository['pause']>[0]) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const target = await this.client.adminEmailConfiguration.findFirst({
      where: { id: input.configurationId, environment: input.environment },
    });
    if (!target) return null;
    const row = await this.client.adminEmailConfiguration.update({
      where: { id: target.id },
      data: { globallyPaused: true },
    });
    await this.client.adminEmailConfigurationAudit.create({
      data: {
        configurationId: row.id,
        environment: input.environment,
        actorUserId: input.actorUserId,
        action: 'PAUSE',
        reason: input.reason,
        changedFields: ['globallyPaused'],
      },
    });
    return adminEmailConfiguration(row);
  }
  async active(input: Parameters<AdminEmailConfigurationRepository['active']>[0]) {
    const row = await this.client.adminEmailConfiguration.findFirst({
      where: {
        environment: input.environment,
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    });
    return row
      ? { configuration: adminEmailConfiguration(row), encryptedApiKey: row.encryptedApiKey }
      : null;
  }
  async hasConfiguration(
    input: Parameters<AdminEmailConfigurationRepository['hasConfiguration']>[0],
  ) {
    return (
      (await this.client.adminEmailConfiguration.count({
        where: { environment: input.environment },
      })) > 0
    );
  }
}
