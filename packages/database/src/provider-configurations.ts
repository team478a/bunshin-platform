import type {
  AdminEmailConfiguration,
  AdminEmailConfigurationRepository,
  AiProviderConfiguration,
  AiProviderConfigurationRepository,
  AiProviderKey,
  AiProviderRuntimeAdmissionAdminRepository,
  AiProviderStaleAdmissionAlertRepository,
  VideoAiProviderCostPolicyRepository,
} from '@bunshin/application';
import { assertAiProviderRuntimeConfiguration } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { createHash } from 'node:crypto';
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

export class PrismaAiProviderConfigurationRepository
  implements
    AiProviderConfigurationRepository,
    AiProviderRuntimeAdmissionAdminRepository,
    AiProviderStaleAdmissionAlertRepository
{
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

  private async recoverableRuntimeAdmissionIds(
    rows: Array<{
      id: string;
      provider: AiProviderKey;
      operationHash: string;
      admittedAt: Date;
    }>,
  ) {
    const recoverable: string[] = [];
    for (const row of rows) {
      const usage = await this.client.aiUsageEvent.findMany({
        where: {
          provider: row.provider.toLowerCase(),
          estimatedCostUsdMicros: { not: null },
          occurredAt: { gte: row.admittedAt },
        },
        select: { idempotencyKey: true },
        orderBy: { occurredAt: 'asc' },
        take: 1_000,
      });
      if (
        usage.some(
          ({ idempotencyKey }) =>
            createHash('sha256').update(idempotencyKey).digest('hex') === row.operationHash,
        )
      )
        recoverable.push(row.id);
    }
    return recoverable;
  }

  async listOpenRuntimeAdmissions(
    input: Parameters<AiProviderRuntimeAdmissionAdminRepository['listOpenRuntimeAdmissions']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin === null) return null;
    const [groups, scanRows] = await Promise.all([
      this.client.aiProviderCallAdmission.groupBy({
        by: ['provider'],
        where: { environment: input.environment, settledAt: null },
        _count: { _all: true },
        _sum: { reservedCostUsdMicros: true },
        _min: { admittedAt: true },
        orderBy: { provider: 'asc' },
      }),
      this.client.aiProviderCallAdmission.findMany({
        where: { environment: input.environment, settledAt: null },
        select: { id: true, provider: true, operationHash: true, admittedAt: true },
        orderBy: { admittedAt: 'asc' },
        take: 101,
      }),
    ]);
    const recoveryScanTruncated = scanRows.length > 100;
    const recoverableIds = new Set(
      await this.recoverableRuntimeAdmissionIds(scanRows.slice(0, 100)),
    );
    return {
      summaries: groups.map((group) => ({
        provider: group.provider,
        openCount: group._count._all,
        recoverableCount: scanRows.filter(
          (row) => row.provider === group.provider && recoverableIds.has(row.id),
        ).length,
        reservedCostUsdMicros: Number(
          (group._sum.reservedCostUsdMicros ?? 0n) > BigInt(Number.MAX_SAFE_INTEGER)
            ? Number.MAX_SAFE_INTEGER
            : (group._sum.reservedCostUsdMicros ?? 0n),
        ),
        oldestAdmittedAt: group._min.admittedAt ?? new Date(0),
      })),
      recoveryScanTruncated,
      canRecover: admin.role === 'SUPER_ADMIN',
    };
  }

  async recoverRecordedRuntimeAdmissions(
    input: Parameters<
      AiProviderRuntimeAdmissionAdminRepository['recoverRecordedRuntimeAdmissions']
    >[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    const rows = await this.client.aiProviderCallAdmission.findMany({
      where: { environment: input.environment, settledAt: null },
      select: {
        id: true,
        configurationId: true,
        provider: true,
        operationHash: true,
        admittedAt: true,
      },
      orderBy: { admittedAt: 'asc' },
      take: 100,
    });
    const recoverableIds = new Set(await this.recoverableRuntimeAdmissionIds(rows));
    let recovered = 0;
    for (const row of rows) {
      if (!recoverableIds.has(row.id)) continue;
      recovered += await this.client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-provider-call:${input.environment}:${row.provider}`}, 0))`;
        const changed = await tx.aiProviderCallAdmission.updateMany({
          where: {
            id: row.id,
            environment: input.environment,
            provider: row.provider,
            operationHash: row.operationHash,
            settledAt: null,
          },
          data: { settledAt: new Date() },
        });
        if (changed.count === 1)
          await tx.aiProviderConfigurationAudit.create({
            data: {
              configurationId: row.configurationId,
              environment: input.environment,
              provider: row.provider,
              actorUserId: input.actorUserId,
              action: 'RECOVER_RUNTIME_ADMISSION',
              reason: input.reason,
              changedFields: ['runtimeAdmissionSettlement'],
            },
          });
        return changed.count;
      });
    }
    const remainingOpen = await this.client.aiProviderCallAdmission.count({
      where: { environment: input.environment, settledAt: null },
    });
    return { scanned: rows.length, recovered, remainingOpen };
  }

  async listStaleAdmissionsForAlert(
    input: Parameters<AiProviderStaleAdmissionAlertRepository['listStaleAdmissionsForAlert']>[0],
  ) {
    const rows = await this.client.aiProviderCallAdmission.findMany({
      where: {
        environment: input.environment,
        settledAt: null,
        admittedAt: { lte: input.staleBefore },
        OR: [{ lastAlertedAt: null }, { lastAlertedAt: { lte: input.repeatBefore } }],
      },
      select: {
        id: true,
        provider: true,
        reservedCostUsdMicros: true,
        admittedAt: true,
      },
      orderBy: [{ admittedAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    const selected = rows.slice(0, input.limit);
    const summaries = new Map<
      AiProviderKey,
      { provider: AiProviderKey; openCount: number; reservedCost: bigint; oldestAdmittedAt: Date }
    >();
    for (const row of selected) {
      const current = summaries.get(row.provider);
      summaries.set(row.provider, {
        provider: row.provider,
        openCount: (current?.openCount ?? 0) + 1,
        reservedCost: (current?.reservedCost ?? 0n) + row.reservedCostUsdMicros,
        oldestAdmittedAt: current?.oldestAdmittedAt ?? row.admittedAt,
      });
    }
    return {
      admissionIds: selected.map(({ id }) => id),
      summaries: [...summaries.values()]
        .sort((left, right) => left.provider.localeCompare(right.provider))
        .map(({ provider, openCount, reservedCost, oldestAdmittedAt }) => ({
          provider,
          openCount,
          reservedCostUsdMicros: Number(
            reservedCost > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : reservedCost,
          ),
          oldestAdmittedAt,
        })),
      truncated: rows.length > input.limit,
    };
  }

  async recordStaleAdmissionAlert(
    input: Parameters<AiProviderStaleAdmissionAlertRepository['recordStaleAdmissionAlert']>[0],
  ) {
    if (input.admissionIds.length === 0) return 0;
    const result = await this.client.aiProviderCallAdmission.updateMany({
      where: {
        id: { in: input.admissionIds },
        environment: input.environment,
        settledAt: null,
        OR: [{ lastAlertedAt: null }, { lastAlertedAt: { lte: input.repeatBefore } }],
      },
      data: { lastAlertedAt: input.alertedAt },
    });
    return result.count;
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
      if (target.requestCostUsdMicros <= 0)
        throw new ApplicationError('CONFLICT', 'provider request cost is required');
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
    const [daily, monthly, monthlyUnknownCostEvents] = await Promise.all([
      this.client.aiUsageEvent.aggregate({
        where: { provider, occurredAt: { gte: input.dailyFrom, lt: input.now } },
        _sum: { estimatedCostUsdMicros: true },
      }),
      this.client.aiUsageEvent.aggregate({
        where: { provider, occurredAt: { gte: input.monthlyFrom, lt: input.now } },
        _sum: { estimatedCostUsdMicros: true },
      }),
      this.client.aiUsageEvent.count({
        where: {
          provider,
          estimatedCostUsdMicros: null,
          occurredAt: { gte: input.monthlyFrom, lt: input.now },
        },
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
      monthlyUnknownCostEvents,
    };
  }

  async reserveActiveForRuntime(input: {
    environment: Parameters<
      AiProviderConfigurationRepository['getActiveForRuntime']
    >[0]['environment'];
    provider: Parameters<AiProviderConfigurationRepository['getActiveForRuntime']>[0]['provider'];
    operationKey: string;
    reservedCostUsdMicros?: number;
    requestCount?: number;
  }) {
    const operationHash = createHash('sha256').update(input.operationKey).digest('hex');
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-provider-call:${input.environment}:${input.provider}`}, 0))`;
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      if (!clock) throw new ApplicationError('CONFLICT', 'provider admission clock unavailable');
      const row = await tx.aiProviderConfiguration.findFirst({
        where: {
          environment: input.environment,
          provider: input.provider,
          status: 'ACTIVE',
        },
      });
      if (row?.encryptedApiKey == null) return null;
      const existing = await tx.aiProviderCallAdmission.findUnique({
        where: {
          environment_provider_operationHash: {
            environment: input.environment,
            provider: input.provider,
            operationHash,
          },
        },
      });
      if (existing)
        throw new ApplicationError('CONFLICT', 'provider call operation already admitted');
      const dailyFrom = new Date(
        Date.UTC(clock.now.getUTCFullYear(), clock.now.getUTCMonth(), clock.now.getUTCDate()),
      );
      const monthlyFrom = new Date(
        Date.UTC(clock.now.getUTCFullYear(), clock.now.getUTCMonth(), 1),
      );
      const provider = input.provider.toLowerCase();
      const [daily, monthly, monthlyUnknownCostEvents, dailyOpen, monthlyOpen] = await Promise.all([
        tx.aiUsageEvent.aggregate({
          where: { provider, occurredAt: { gte: dailyFrom, lt: clock.now } },
          _sum: { estimatedCostUsdMicros: true },
        }),
        tx.aiUsageEvent.aggregate({
          where: { provider, occurredAt: { gte: monthlyFrom, lt: clock.now } },
          _sum: { estimatedCostUsdMicros: true },
        }),
        tx.aiUsageEvent.count({
          where: {
            provider,
            estimatedCostUsdMicros: null,
            occurredAt: { gte: monthlyFrom, lt: clock.now },
          },
        }),
        tx.aiProviderCallAdmission.aggregate({
          where: {
            environment: input.environment,
            provider: input.provider,
            settledAt: null,
            admittedAt: { gte: dailyFrom, lt: clock.now },
          },
          _sum: { reservedCostUsdMicros: true },
        }),
        tx.aiProviderCallAdmission.aggregate({
          where: {
            environment: input.environment,
            provider: input.provider,
            settledAt: null,
            admittedAt: { gte: monthlyFrom, lt: clock.now },
          },
          _sum: { reservedCostUsdMicros: true },
        }),
      ]);
      const safeNumber = (value: bigint) =>
        Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : value);
      const snapshot = assertAiProviderRuntimeConfiguration(input, {
        configuration: aiProviderConfiguration(row),
        encryptedApiKey: row.encryptedApiKey,
        dailySpentUsdMicros: safeNumber(
          (daily._sum.estimatedCostUsdMicros ?? 0n) + (dailyOpen._sum.reservedCostUsdMicros ?? 0n),
        ),
        monthlySpentUsdMicros: safeNumber(
          (monthly._sum.estimatedCostUsdMicros ?? 0n) +
            (monthlyOpen._sum.reservedCostUsdMicros ?? 0n),
        ),
        monthlyUnknownCostEvents,
      });
      const admission = await tx.aiProviderCallAdmission.create({
        data: {
          configurationId: row.id,
          environment: input.environment,
          provider: input.provider,
          operationHash,
          reservedCostUsdMicros: BigInt(
            input.reservedCostUsdMicros ??
              (snapshot.configuration.requestCostUsdMicros ?? 0) * (input.requestCount ?? 1),
          ),
          admittedAt: clock.now,
        },
      });
      return {
        ...snapshot,
        admission: {
          id: admission.id,
          environment: admission.environment,
          provider: admission.provider,
          operationHash: admission.operationHash,
        },
      };
    });
  }

  async settleRuntimeAdmission(input: {
    id: string;
    environment: Parameters<
      AiProviderConfigurationRepository['getActiveForRuntime']
    >[0]['environment'];
    provider: Parameters<AiProviderConfigurationRepository['getActiveForRuntime']>[0]['provider'];
    operationHash: string;
  }) {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-provider-call:${input.environment}:${input.provider}`}, 0))`;
      const changed = await tx.$executeRaw`
        UPDATE ai_provider_call_admissions SET settled_at=clock_timestamp()
        WHERE id=${input.id}::uuid
          AND environment=${input.environment}::"LineConfigurationEnvironment"
          AND provider=${input.provider}::"AiProviderKey"
          AND operation_hash=${input.operationHash} AND settled_at IS NULL`;
      return changed === 1;
    });
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
