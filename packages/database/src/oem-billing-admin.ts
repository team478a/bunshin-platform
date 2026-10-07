import {
  assertOemOffering,
  commercialMonthPeriod,
  parseProgramDefinition,
  OEM_REGISTRATION_BILLING_RULE_VERSION,
  type OemOfferingClassification,
  type OemProductPolicy,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { requiredText, jsonSnapshot } from './commercial-billing-support';
import { oemBillingShadow } from './oem-billing-history';

/** Explicit preparation; no inferred registration dates, payment mode or price classification. */
export class PrismaOemBillingAdminService {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorize(tx: Prisma.TransactionClient, workspaceId: string, actorUserId: string) {
    const [admin, workspace] = await Promise.all([
      tx.platformAdmin.findFirst({
        where: {
          userId: actorUserId,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
        },
        select: { id: true },
      }),
      tx.workspace.findFirst({
        where: { id: workspaceId, type: 'ORGANIZATION' },
        select: { id: true },
      }),
    ]);
    if (!admin || !workspace) throw new Error('SUPER_ADMIN_OR_ORGANIZATION_REQUIRED');
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
    );
  }

  async setOffering(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    productPolicy: OemProductPolicy;
    classification: OemOfferingClassification;
    expectedCurrentId: string | null;
    reason: string;
    now?: Date;
  }) {
    assertOemOffering(input.productPolicy, input.classification);
    const reason = requiredText(input.reason, 1000);
    const now = input.now ?? new Date();
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      const group = await tx.group.findFirst({
        where: {
          id: input.groupId,
          workspaceId: input.workspaceId,
          serviceConfiguration: { isNot: null },
        },
        select: { id: true },
      });
      if (!group) throw new Error('SERVICE_NOT_FOUND');
      const programs = await tx.serviceProgram.findMany({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { programTemplateVersionId: true },
      });
      const versions = await tx.programTemplateVersion.findMany({
        where: {
          workspaceId: input.workspaceId,
          id: { in: programs.map((p) => p.programTemplateVersionId) },
        },
        select: { definition: true },
      });
      const training = versions.some((v) =>
        parseProgramDefinition(v.definition).missions.some((m) => m.capability === 'AI_TRAINING'),
      );
      if (training && input.productPolicy !== 'MANABERU_STYLE')
        throw new Error('AI_TRAINING_PRODUCT_POLICY_REQUIRED');
      const current = await tx.oemOfferingPeriod.findFirst({
        where: { workspaceId: input.workspaceId, groupId: input.groupId, endsAt: null },
      });
      if ((current?.id ?? null) !== input.expectedCurrentId) throw new Error('STALE_OFFERING');
      if (current?.productPolicy && current.productPolicy !== input.productPolicy)
        throw new Error('PRODUCT_POLICY_IMMUTABLE');
      if (current?.classification === input.classification) return current;
      if (current) {
        if (now <= current.startsAt) throw new Error('INVALID_OFFERING_TIME');
        await tx.oemOfferingPeriod.update({ where: { id: current.id }, data: { endsAt: now } });
      }
      return tx.oemOfferingPeriod.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          productPolicy: input.productPolicy,
          classification: input.classification,
          startsAt: now,
          actorUserId: input.actorUserId,
          reason,
        },
      });
    });
  }

  async scheduleCutover(input: {
    workspaceId: string;
    actorUserId: string;
    effectiveFrom: Date;
    reason: string;
    historyReviewed: boolean;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const next = new Date(`${commercialMonthPeriod(now, 1).key}-01T00:00:00.000Z`);
    const reason = requiredText(input.reason, 1000);
    if (
      !input.historyReviewed ||
      !Number.isFinite(input.effectiveFrom.getTime()) ||
      input.effectiveFrom < next ||
      input.effectiveFrom.toISOString().slice(8) !== '01T00:00:00.000Z'
    )
      throw new Error('FUTURE_MONTH_AND_HISTORY_REVIEW_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      const groups = await tx.serviceConfiguration.findMany({
        where: { workspaceId: input.workspaceId },
        select: { groupId: true },
      });
      const offerings = await tx.oemOfferingPeriod.findMany({
        where: { workspaceId: input.workspaceId, endsAt: null },
      });
      if (groups.some((g) => !offerings.some((o) => o.groupId === g.groupId)))
        throw new Error('REVIEW_REQUIRED: service classification missing');
      const contract = await tx.oemContractPeriod.findFirst({
        where: { workspaceId: input.workspaceId },
      });
      if (!contract) throw new Error('REVIEW_REQUIRED: contract history missing');
      // Existing participants require individually reviewed initial registration records.
      const participants = await tx.groupMembership.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: { in: groups.map((g) => g.groupId) },
          role: 'PARTICIPANT',
          status: { in: ['ACTIVE', 'SUSPENDED'] },
          consentedAt: { not: null },
        },
        select: { id: true },
      });
      const registrations = await tx.oemRegistrationPeriod.findMany({
        where: { workspaceId: input.workspaceId, endsAt: null },
        select: { groupMembershipId: true },
      });
      if (participants.some((m) => !registrations.some((r) => r.groupMembershipId === m.id)))
        throw new Error('REVIEW_REQUIRED: initial registration history missing');
      const policy = await tx.oemBillingPolicy.create({
        data: {
          workspaceId: input.workspaceId,
          effectiveFrom: input.effectiveFrom,
          ruleVersion: OEM_REGISTRATION_BILLING_RULE_VERSION,
          historyReadyAt: now,
          actorUserId: input.actorUserId,
          reason,
        },
      });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'BILLING_POLICY',
          entityId: input.workspaceId,
          action: 'CUTOVER_SCHEDULED',
          afterData: jsonSnapshot(policy),
        },
      });
      return policy;
    });
  }

  async reviewInitialRegistration(input: {
    workspaceId: string;
    groupMembershipId: string;
    actorUserId: string;
    registeredAt: Date;
    reason: string;
    now?: Date;
  }) {
    const reason = requiredText(input.reason, 1000);
    const now = input.now ?? new Date();
    if (!Number.isFinite(input.registeredAt.getTime()) || input.registeredAt > now)
      throw new Error('REVIEWED_REGISTRATION_DATE_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      const member = await tx.groupMembership.findFirst({
        where: {
          id: input.groupMembershipId,
          workspaceId: input.workspaceId,
          consentedAt: { not: null },
          status: { in: ['ACTIVE', 'SUSPENDED'] },
        },
      });
      if (!member) throw new Error('CONSENTED_REGISTERED_MEMBER_REQUIRED');
      const existing = await tx.oemRegistrationPeriod.findFirst({
        where: { workspaceId: input.workspaceId, groupMembershipId: member.id },
      });
      if (existing) {
        if (
          existing.startsAt.getTime() === input.registeredAt.getTime() &&
          existing.registeredByUserId === input.actorUserId &&
          existing.reason === reason
        )
          return existing;
        throw new Error('REGISTRATION_HISTORY_ALREADY_EXISTS');
      }
      return tx.oemRegistrationPeriod.create({
        data: {
          workspaceId: member.workspaceId,
          groupId: member.groupId,
          groupMembershipId: member.id,
          userId: member.userId,
          startsAt: input.registeredAt,
          registeredByUserId: input.actorUserId,
          reason,
        },
      });
    });
  }

  async reviewContractPeriod(input: {
    workspaceId: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date | null;
    reason: string;
  }) {
    const reason = requiredText(input.reason, 1000);
    if (
      !Number.isFinite(input.startsAt.getTime()) ||
      (input.endsAt && (!Number.isFinite(input.endsAt.getTime()) || input.endsAt <= input.startsAt))
    )
      throw new Error('INVALID_CONTRACT_PERIOD');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      const contract = await tx.organizationCommercialContract.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if (!contract) throw new Error('OEM_CONTRACT_REQUIRED');
      const existing = await tx.oemContractPeriod.findUnique({
        where: {
          workspaceId_startsAt: { workspaceId: input.workspaceId, startsAt: input.startsAt },
        },
      });
      if (
        existing &&
        existing.endsAt?.getTime() === input.endsAt?.getTime() &&
        existing.actorUserId === input.actorUserId &&
        existing.reason === reason
      )
        return existing;
      const overlap = await tx.oemContractPeriod.findFirst({
        where: {
          workspaceId: input.workspaceId,
          ...(input.endsAt ? { startsAt: { lt: input.endsAt } } : {}),
          OR: [{ endsAt: null }, { endsAt: { gt: input.startsAt } }],
        },
      });
      if (overlap) throw new Error('REVIEW_REQUIRED: overlapping contract period');
      return tx.oemContractPeriod.create({
        data: {
          workspaceId: input.workspaceId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          actorUserId: input.actorUserId,
          reason,
        },
      });
    });
  }

  async shadow(input: { workspaceId: string; actorUserId: string; month: Date }) {
    // Read-only transaction, intentionally no audit/event/invoice writes.
    return this.client.$transaction(
      async (tx) => {
        const admin = await tx.platformAdmin.findFirst({
          where: {
            userId: input.actorUserId,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            user: { status: 'ACTIVE' },
          },
          select: { id: true },
        });
        if (!admin) throw new Error('SUPER_ADMIN_REQUIRED');
        const period = commercialMonthPeriod(input.month);
        const actual = await tx.serviceUsageEvent.groupBy({
          by: ['userId'],
          where: {
            workspaceId: input.workspaceId,
            occurredAt: { gte: period.start, lt: period.end },
          },
        });
        return {
          month: period.key,
          mau: actual.length,
          ...(await oemBillingShadow(tx, input.workspaceId, period)),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
