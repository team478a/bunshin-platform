import { commercialMonthPeriod, quoteMauPrice, type MauPricingTier } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { jsonSnapshot, requiredText } from './commercial-billing-support';

export class PrismaCommercialPricingAdminService {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorize(tx: Prisma.TransactionClient, actorUserId: string) {
    const admin = await tx.platformAdmin.findFirst({
      where: {
        userId: actorUserId,
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!admin) throw new Error('SUPER_ADMIN_REQUIRED');
  }

  async saveDraft(input: {
    id?: string;
    expectedRevision?: number;
    actorUserId: string;
    name: string;
    version: string;
    effectiveFrom: Date;
    tiers: readonly MauPricingTier[];
    reason: string;
    acknowledgeDescendingPrices: boolean;
  }) {
    if (input.tiers.length > 100) throw new Error('TOO_MANY_PRICING_TIERS');
    quoteMauPrice(0, input.version, input.tiers);
    const name = requiredText(input.name, 120);
    const version = requiredText(input.version, 80);
    const reason = requiredText(input.reason, 1000);
    if (input.effectiveFrom.toISOString().slice(8) !== '01T00:00:00.000Z')
      throw new Error('month required');
    if (
      input.tiers.some((tier, i) => i > 0 && tier.priceYen < input.tiers[i - 1]!.priceYen) &&
      !input.acknowledgeDescendingPrices
    )
      throw new Error('DESCENDING_PRICE_CONFIRMATION_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.actorUserId);
      if (!input.id) {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${version}, 0))`,
        );
        const replay = await tx.commercialPricingSchedule.findUnique({ where: { version } });
        if (replay) {
          const stored = replay.tiers as unknown as MauPricingTier[];
          if (
            replay.status === 'DRAFT' &&
            replay.createdByUserId === input.actorUserId &&
            replay.name === name &&
            replay.changeReason === reason &&
            replay.effectiveFrom.getTime() === input.effectiveFrom.getTime() &&
            stored.length === input.tiers.length &&
            stored.every(
              (tier, i) =>
                tier.tierKey === input.tiers[i]!.tierKey &&
                tier.upperLimit === input.tiers[i]!.upperLimit &&
                tier.priceYen === input.tiers[i]!.priceYen,
            )
          )
            return replay;
          throw new Error('PRICING_VERSION_ALREADY_EXISTS');
        }
      }
      const data = {
        name,
        version,
        effectiveFrom: input.effectiveFrom,
        changeReason: reason,
        tiers: jsonSnapshot(input.tiers),
      };
      const before = input.id
        ? await tx.commercialPricingSchedule.findUnique({ where: { id: input.id } })
        : null;
      if (
        input.id &&
        (!before || before.status !== 'DRAFT' || before.revision !== input.expectedRevision)
      )
        throw new Error('STALE_PRICING_REVISION');
      if (before) {
        const updated = await tx.commercialPricingSchedule.updateMany({
          where: { id: before.id, status: 'DRAFT', revision: before.revision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (updated.count !== 1) throw new Error('STALE_PRICING_REVISION');
      }
      const after = before
        ? await tx.commercialPricingSchedule.findUniqueOrThrow({ where: { id: before.id } })
        : await tx.commercialPricingSchedule.create({
            data: { ...data, status: 'DRAFT', createdByUserId: input.actorUserId },
          });
      await tx.commercialPricingAudit.create({
        data: {
          scheduleId: after.id,
          actorUserId: input.actorUserId,
          action: before ? 'EDIT' : 'CREATE',
          reason,
          beforeData: before ? jsonSnapshot(before) : Prisma.DbNull,
          afterData: jsonSnapshot(after),
        },
      });
      return after;
    });
  }

  async transition(input: {
    id: string;
    expectedRevision: number;
    action: 'PUBLISH' | 'CANCEL';
    actorUserId: string;
    reason: string;
    now?: Date;
  }) {
    const reason = requiredText(input.reason, 1000);
    const now = input.now ?? new Date();
    const nextMonth = new Date(`${commercialMonthPeriod(now, 1).key}-01T00:00:00.000Z`);
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.actorUserId);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "commercial_pricing_schedules" WHERE "id" = ${input.id}::uuid FOR UPDATE`,
      );
      const before = await tx.commercialPricingSchedule.findUniqueOrThrow({
        where: { id: input.id },
      });
      const target = input.action === 'PUBLISH' ? 'PUBLISHED' : 'CANCELLED';
      // Same actor/reason/action replay is a no-op; never accept an unrelated stale request.
      if (before.status === target && before.revision === input.expectedRevision + 1) {
        const replay = await tx.commercialPricingAudit.findFirst({
          where: {
            scheduleId: before.id,
            actorUserId: input.actorUserId,
            action: input.action,
            reason,
          },
        });
        if (replay) return before;
      }
      if (
        before.revision !== input.expectedRevision ||
        before.effectiveFrom < nextMonth ||
        (input.action === 'PUBLISH' ? before.status !== 'DRAFT' : before.status !== 'PUBLISHED')
      )
        throw new Error('PRICING_TRANSITION_REJECTED');
      if (
        input.action === 'CANCEL' &&
        (await tx.tenantMonthlyUsage.count({
          where: { pricingScheduleId: before.id, status: 'FINALIZED' },
        }))
      )
        throw new Error('PRICING_REFERENCED');
      quoteMauPrice(0, before.version, before.tiers as unknown as MauPricingTier[]);
      const after = await tx.commercialPricingSchedule.update({
        where: { id: before.id },
        data: { status: target, revision: { increment: 1 } },
      });
      await tx.commercialPricingAudit.create({
        data: {
          scheduleId: before.id,
          actorUserId: input.actorUserId,
          action: input.action,
          reason,
          beforeData: jsonSnapshot(before),
          afterData: jsonSnapshot(after),
          occurredAt: now,
        },
      });
      return after;
    });
  }
}
