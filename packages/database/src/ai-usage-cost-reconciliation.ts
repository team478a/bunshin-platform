import type { AiUsageCostReconciliationRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { type PrismaClient, prisma } from './client';

export class PrismaAiUsageCostReconciliationRepository implements AiUsageCostReconciliationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private admin(actorUserId: string) {
    return this.client.platformAdmin.findFirst({
      where: { userId: actorUserId, status: 'ACTIVE' },
      select: { role: true },
    });
  }

  async listUnknownCosts(
    input: Parameters<AiUsageCostReconciliationRepository['listUnknownCosts']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (!admin || !['SUPER_ADMIN', 'OPERATOR'].includes(admin.role)) return null;
    const rows = await this.client.aiUsageEvent.findMany({
      where: {
        provider: input.provider.toLowerCase(),
        estimatedCostUsdMicros: null,
        occurredAt: { gte: input.monthlyFrom, lt: input.now },
      },
      select: {
        id: true,
        provider: true,
        taskType: true,
        model: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        occurredAt: true,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
    return rows.map((row) => ({ ...row }));
  }

  async repairUnknownCosts(
    input: Parameters<AiUsageCostReconciliationRepository['repairUnknownCosts']>[0],
  ) {
    const admin = await this.admin(input.actorUserId);
    if (admin?.role !== 'SUPER_ADMIN') return null;
    const auditReason = `${input.reason} [evidence:${input.evidenceReference}]`;
    if (auditReason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'reconciliation audit reason is too long');
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-provider-cost-reconciliation:${input.provider}`}, 0))`;
      const configuration = await tx.aiProviderConfiguration.findFirst({
        where: { environment: input.environment, provider: input.provider },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (!configuration)
        throw new ApplicationError('NOT_FOUND', 'provider configuration not found');
      let updated = 0;
      let alreadyReconciled = 0;
      for (const update of input.updates) {
        const row = await tx.aiUsageEvent.findUnique({
          where: { id: update.usageEventId },
          select: {
            id: true,
            provider: true,
            occurredAt: true,
            estimatedCostUsdMicros: true,
            pricingVersion: true,
          },
        });
        if (!row) throw new ApplicationError('NOT_FOUND', 'usage event not found');
        if (
          row.provider !== input.provider.toLowerCase() ||
          row.occurredAt < input.monthlyFrom ||
          row.occurredAt >= input.now
        )
          throw new ApplicationError('CONFLICT', 'usage event is outside reconciliation scope');
        const cost = BigInt(update.estimatedCostUsdMicros);
        if (row.estimatedCostUsdMicros !== null) {
          if (row.estimatedCostUsdMicros === cost && row.pricingVersion === update.pricingVersion) {
            alreadyReconciled += 1;
            continue;
          }
          throw new ApplicationError('CONFLICT', 'usage event cost is already different');
        }
        const changed = await tx.aiUsageEvent.updateMany({
          where: {
            id: row.id,
            provider: input.provider.toLowerCase(),
            estimatedCostUsdMicros: null,
            occurredAt: { gte: input.monthlyFrom, lt: input.now },
          },
          data: {
            estimatedCostUsdMicros: cost,
            pricingVersion: update.pricingVersion,
          },
        });
        if (changed.count !== 1)
          throw new ApplicationError('CONFLICT', 'usage event changed during reconciliation');
        updated += 1;
      }
      if (updated > 0)
        await tx.aiProviderConfigurationAudit.create({
          data: {
            configurationId: configuration.id,
            environment: input.environment,
            provider: input.provider,
            actorUserId: input.actorUserId,
            action: 'RECONCILE_USAGE_COST',
            reason: auditReason,
            changedFields: ['aiUsageEventCosts', `count:${updated}`],
          },
        });
      return { scanned: input.updates.length, updated, alreadyReconciled };
    });
  }
}
