import {
  commercialMonthPeriod,
  COMMERCIAL_USAGE_EVENT_TYPES,
  type CommercialUsageEventType,
  type MauPricingTier,
  quoteMauPrice,
  quoteOemMauPrice,
} from '@bunshin/application';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from './index';

export interface RecordCommercialUsageInput {
  workspaceId: string;
  groupId: string;
  userId: string;
  eventType: CommercialUsageEventType;
  source: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt?: Date;
}

export type RecordCommercialUsageResult = 'RECORDED' | 'DUPLICATE' | 'NOT_BILLABLE';

export interface CommercialUsageSummary {
  month: string;
  mau: number;
  pricing: ReturnType<typeof quoteOemMauPrice>;
  eventCounts: Array<{ eventType: string; count: number }>;
}

export interface CommercialUsageDashboard {
  workspace: { id: string; name: string; oemEnabled: boolean };
  current: CommercialUsageSummary;
  history: Array<{
    month: string;
    mau: number;
    tierKey: string;
    priceYen: number | null;
    pricingVersion: string;
    status: 'OPEN' | 'FINALIZED';
    finalizedAt: Date | null;
  }>;
}

export interface CommercialProfitabilityRow {
  workspaceId: string;
  workspaceName: string;
  month: string;
  mau: number;
  revenueYen: number | null;
  pricingTierKey: string;
  aiCostUsdMicros: number;
  pricedAiCalls: number;
  unpricedAiCalls: number;
}

function snapshotDate(monthKey: string): Date {
  return new Date(`${monthKey}-01T00:00:00.000Z`);
}

function nextSnapshotDate(monthKey: string): Date {
  const [year = 0, month = 0] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1));
}

function validateText(value: string, maximum: number, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`invalid ${label}`);
  return normalized;
}

export class PrismaCommercialUsageService {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listPricingSchedules() {
    return this.client.commercialPricingSchedule.findMany({ orderBy: { effectiveFrom: 'desc' } });
  }

  async createPricingSchedule(input: {
    version: string;
    effectiveFrom: Date;
    tiers: MauPricingTier[];
    createdByUserId: string;
    now?: Date;
  }) {
    quoteMauPrice(0, input.version, input.tiers);
    const nextMonth = snapshotDate(commercialMonthPeriod(input.now ?? new Date(), 1).key);
    if (
      Number.isNaN(input.effectiveFrom.getTime()) ||
      input.effectiveFrom.getUTCDate() !== 1 ||
      input.effectiveFrom < nextMonth
    )
      throw new Error('pricing schedule must start in a future month');
    return this.client.commercialPricingSchedule.create({
      data: {
        version: input.version,
        effectiveFrom: input.effectiveFrom,
        createdByUserId: input.createdByUserId,
        tiers: input.tiers as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async quote(mau: number, periodStart: Date) {
    const schedule = await this.client.commercialPricingSchedule.findFirst({
      where: { effectiveFrom: { lte: periodStart } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!schedule) return quoteOemMauPrice(mau);
    return quoteMauPrice(mau, schedule.version, schedule.tiers as unknown as MauPricingTier[]);
  }

  async record(input: RecordCommercialUsageInput): Promise<RecordCommercialUsageResult> {
    if (!(COMMERCIAL_USAGE_EVENT_TYPES as readonly string[]).includes(input.eventType))
      throw new Error('invalid commercial usage event type');
    const source = validateText(input.source, 80, 'source');
    const idempotencyKey = validateText(input.idempotencyKey, 240, 'idempotency key');
    const occurredAt = input.occurredAt ?? new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new Error('invalid occurredAt');

    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.userId,
        status: 'ACTIVE',
        role: 'PARTICIPANT',
        serviceRole: 'PARTICIPANT',
        user: { status: 'ACTIVE' },
        group: { status: 'ACTIVE', workspace: { type: 'ORGANIZATION', status: 'ACTIVE' } },
      },
      select: {
        id: true,
        user: {
          select: {
            platformAdmin: { select: { status: true } },
            memberships: {
              where: {
                workspaceId: input.workspaceId,
                status: 'ACTIVE',
                role: { in: ['OWNER', 'ADMIN'] },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (
      !membership ||
      membership.user.platformAdmin?.status === 'ACTIVE' ||
      membership.user.memberships.length > 0
    )
      return 'NOT_BILLABLE';

    try {
      await this.client.$transaction([
        this.client.serviceUsageEvent.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            userId: input.userId,
            eventType: input.eventType,
            source,
            idempotencyKey,
            metadata: input.metadata ?? {},
            occurredAt,
          },
        }),
        this.client.groupMembership.updateMany({
          where: {
            id: membership.id,
            OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: occurredAt } }],
          },
          data: { lastUsedAt: occurredAt },
        }),
      ]);
      return 'RECORDED';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'DUPLICATE';
      throw error;
    }
  }

  async dashboard(workspaceId: string, now = new Date()): Promise<CommercialUsageDashboard | null> {
    const period = commercialMonthPeriod(now);
    const [workspace, users, eventCounts, history] = await Promise.all([
      this.client.workspace.findFirst({
        where: { id: workspaceId, type: 'ORGANIZATION' },
        select: {
          id: true,
          name: true,
          organizationEntitlement: { select: { oemEnabled: true } },
        },
      }),
      this.client.serviceUsageEvent.groupBy({
        by: ['userId'],
        where: { workspaceId, occurredAt: { gte: period.start, lt: period.end } },
      }),
      this.client.serviceUsageEvent.groupBy({
        by: ['eventType'],
        where: { workspaceId, occurredAt: { gte: period.start, lt: period.end } },
        _count: { _all: true },
      }),
      this.client.tenantMonthlyUsage.findMany({
        where: { workspaceId },
        orderBy: { periodStart: 'desc' },
        take: 24,
      }),
    ]);
    if (!workspace) return null;
    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        oemEnabled: workspace.organizationEntitlement?.oemEnabled ?? false,
      },
      current: {
        month: period.key,
        mau: users.length,
        pricing: await this.quote(users.length, snapshotDate(period.key)),
        eventCounts: eventCounts.map((row) => ({
          eventType: row.eventType,
          count: row._count._all,
        })),
      },
      history: history.map((row) => ({
        month: row.periodStart.toISOString().slice(0, 7),
        mau: row.mau,
        tierKey: row.pricingTierKey,
        priceYen: row.calculatedPriceYen,
        pricingVersion: row.pricingVersion,
        status: row.status,
        finalizedAt: row.finalizedAt,
      })),
    };
  }

  async profitabilityDashboard(now = new Date()): Promise<CommercialProfitabilityRow[]> {
    const period = commercialMonthPeriod(now);
    const organizations = await this.client.workspace.findMany({
      where: {
        type: 'ORGANIZATION',
        status: 'ACTIVE',
        organizationEntitlement: { is: { oemEnabled: true, suspended: false } },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    return Promise.all(
      organizations.map(async (organization) => {
        const [users, pricedAi, unpricedAiCalls] = await Promise.all([
          this.client.serviceUsageEvent.groupBy({
            by: ['userId'],
            where: {
              workspaceId: organization.id,
              occurredAt: { gte: period.start, lt: period.end },
            },
          }),
          this.client.aiUsageEvent.aggregate({
            where: {
              workspaceId: organization.id,
              occurredAt: { gte: period.start, lt: period.end },
              estimatedCostUsdMicros: { not: null },
            },
            _count: { _all: true },
            _sum: { estimatedCostUsdMicros: true },
          }),
          this.client.aiUsageEvent.count({
            where: {
              workspaceId: organization.id,
              occurredAt: { gte: period.start, lt: period.end },
              estimatedCostUsdMicros: null,
            },
          }),
        ]);
        const pricing = quoteOemMauPrice(users.length);
        const aiCost = pricedAi._sum.estimatedCostUsdMicros ?? 0n;
        if (aiCost > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('AI cost is too large');
        return {
          workspaceId: organization.id,
          workspaceName: organization.name,
          month: period.key,
          mau: users.length,
          revenueYen: pricing.priceYen,
          pricingTierKey: pricing.tierKey,
          aiCostUsdMicros: Number(aiCost),
          pricedAiCalls: pricedAi._count._all,
          unpricedAiCalls,
        };
      }),
    );
  }

  async finalizePreviousMonth(workspaceId: string, now = new Date()) {
    const period = commercialMonthPeriod(now, -1);
    const periodStart = snapshotDate(period.key);
    const existing = await this.client.tenantMonthlyUsage.findUnique({
      where: { workspaceId_periodStart: { workspaceId, periodStart } },
    });
    if (existing?.status === 'FINALIZED') return existing;

    const organization = await this.client.workspace.findFirst({
      where: {
        id: workspaceId,
        type: 'ORGANIZATION',
        status: 'ACTIVE',
        organizationEntitlement: {
          is: {
            oemEnabled: true,
            suspended: false,
            OR: [{ startsAt: null }, { startsAt: { lt: period.end } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: period.start } }] }],
          },
        },
      },
      select: { id: true },
    });
    if (!organization) throw new Error('organization not found');
    const users = await this.client.serviceUsageEvent.groupBy({
      by: ['userId'],
      where: { workspaceId, occurredAt: { gte: period.start, lt: period.end } },
    });
    const pricing = await this.quote(users.length, periodStart);
    const finalizedAt = new Date();
    return this.client.tenantMonthlyUsage.upsert({
      where: { workspaceId_periodStart: { workspaceId, periodStart } },
      create: {
        workspaceId,
        periodStart,
        periodEnd: nextSnapshotDate(period.key),
        timeZone: period.timeZone,
        mau: users.length,
        pricingTierKey: pricing.tierKey,
        calculatedPriceYen: pricing.priceYen,
        pricingVersion: pricing.pricingVersion,
        status: 'FINALIZED',
        calculatedAt: finalizedAt,
        finalizedAt,
      },
      update: {
        mau: users.length,
        pricingTierKey: pricing.tierKey,
        calculatedPriceYen: pricing.priceYen,
        pricingVersion: pricing.pricingVersion,
        status: 'FINALIZED',
        calculatedAt: finalizedAt,
        finalizedAt,
      },
    });
  }

  async finalizeAllPreviousMonths(now = new Date()) {
    const period = commercialMonthPeriod(now, -1);
    const organizations = await this.client.workspace.findMany({
      where: {
        type: 'ORGANIZATION',
        status: 'ACTIVE',
        organizationEntitlement: {
          is: {
            oemEnabled: true,
            suspended: false,
            OR: [{ startsAt: null }, { startsAt: { lt: period.end } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: period.start } }] }],
          },
        },
      },
      select: { id: true },
    });
    const finalized = [];
    for (const organization of organizations) {
      finalized.push(await this.finalizePreviousMonth(organization.id, now));
    }
    return { organizations: organizations.length, finalized: finalized.length };
  }
}
