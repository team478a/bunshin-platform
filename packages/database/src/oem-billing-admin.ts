import {
  commercialMonthPeriod,
  dateInBusinessTimezone,
  oemOfferingPolicyBlockers,
  parseProgramDefinition,
  OEM_REGISTRATION_BILLING_RULE_VERSION,
  type OemOfferingClassification,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';
import { requiredText, jsonSnapshot } from './commercial-billing-support';
import { oemBillingShadow } from './oem-billing-history';

type ContractWindow = { startsAt: Date; endsAt: Date | null };

const BUSINESS_TIMEZONE_OFFSET_MS = 9 * 60 * 60 * 1_000;

function sameOptionalDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function overlaps(left: ContractWindow, right: ContractWindow): boolean {
  return (
    (left.endsAt === null || right.startsAt < left.endsAt) &&
    (right.endsAt === null || left.startsAt < right.endsAt)
  );
}

function changedContractWindows(before: ContractWindow, after: ContractWindow): ContractWindow[] {
  const changed: ContractWindow[] = [];
  if (before.startsAt.getTime() !== after.startsAt.getTime()) {
    changed.push({
      startsAt: before.startsAt < after.startsAt ? before.startsAt : after.startsAt,
      endsAt: before.startsAt < after.startsAt ? after.startsAt : before.startsAt,
    });
  }
  if (!sameOptionalDate(before.endsAt, after.endsAt)) {
    if (before.endsAt === null || after.endsAt === null) {
      changed.push({ startsAt: before.endsAt ?? after.endsAt!, endsAt: null });
    } else {
      changed.push({
        startsAt: before.endsAt < after.endsAt ? before.endsAt : after.endsAt,
        endsAt: before.endsAt < after.endsAt ? after.endsAt : before.endsAt,
      });
    }
  }
  return changed;
}

function combinedWindow(before: ContractWindow, after: ContractWindow): ContractWindow {
  return {
    startsAt: before.startsAt < after.startsAt ? before.startsAt : after.startsAt,
    endsAt:
      before.endsAt === null || after.endsAt === null
        ? null
        : before.endsAt > after.endsAt
          ? before.endsAt
          : after.endsAt,
  };
}

/** Explicit preparation; no inferred registration dates, payment mode or price classification. */
export class PrismaOemBillingAdminService {
  constructor(private readonly client: PrismaClient = prisma) {}

  async preparationDashboard(input: { workspaceId: string; actorUserId: string; now?: Date }) {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error('INVALID_PREPARATION_TIME');
    const effectiveOn = new Date(`${dateInBusinessTimezone(now)}T00:00:00.000Z`);
    return this.client.$transaction(
      async (tx) => {
        await this.authorizeSuperAdmin(tx, input.actorUserId);
        const workspace = await tx.workspace.findFirst({
          where: { id: input.workspaceId, type: 'ORGANIZATION' },
          select: { id: true, name: true },
        });
        if (!workspace) throw new Error('ORGANIZATION_NOT_FOUND');

        const services = await tx.serviceConfiguration.findMany({
          where: { workspaceId: input.workspaceId },
          select: {
            groupId: true,
            displayName: true,
            slug: true,
            group: { select: { name: true } },
          },
          orderBy: [{ displayName: 'asc' }, { groupId: 'asc' }],
        });
        const groupIds = services.map((service) => service.groupId);
        const [offerings, participants, registrations, contractPeriods, billingPolicy, products] =
          await Promise.all([
            tx.oemOfferingPeriod.findMany({
              where: { workspaceId: input.workspaceId, groupId: { in: groupIds } },
              include: {
                product: { select: { displayName: true, status: true } },
                productPolicyVersion: { select: { version: true, effectiveFrom: true } },
                supersedes: { select: { id: true } },
                supersededBy: { select: { id: true } },
              },
              orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            }),
            tx.groupMembership.findMany({
              where: {
                workspaceId: input.workspaceId,
                groupId: { in: groupIds },
                role: 'PARTICIPANT',
                status: { in: ['ACTIVE', 'SUSPENDED'] },
                consentedAt: { not: null },
              },
              select: {
                id: true,
                groupId: true,
                userId: true,
                status: true,
                consentedAt: true,
                user: { select: { displayName: true } },
              },
              orderBy: [{ groupId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            }),
            tx.oemRegistrationPeriod.findMany({
              where: { workspaceId: input.workspaceId, groupId: { in: groupIds } },
              include: {
                supersedes: { select: { id: true } },
                supersededBy: { select: { id: true } },
              },
              orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            }),
            tx.oemContractPeriod.findMany({
              where: { workspaceId: input.workspaceId },
              include: {
                supersedes: { select: { id: true } },
                supersededBy: { select: { id: true } },
              },
              orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            }),
            tx.oemBillingPolicy.findUnique({ where: { workspaceId: input.workspaceId } }),
            tx.commercialServiceProduct.findMany({
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                key: true,
                displayName: true,
                policyVersions: {
                  where: { effectiveFrom: { lte: effectiveOn } },
                  orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
                  take: 1,
                  select: {
                    id: true,
                    version: true,
                    freeOfferingAllowed: true,
                    requiredCapabilities: true,
                    effectiveFrom: true,
                  },
                },
              },
              orderBy: { key: 'asc' },
            }),
          ]);

        const currentContractPeriods = contractPeriods.filter(
          (contractPeriod) => contractPeriod.supersededBy === null,
        );
        const currentOfferingPeriods = offerings.filter(
          (offering) => offering.supersededBy === null,
        );
        const currentRegistrationPeriods = registrations.filter(
          (registration) => registration.supersededBy === null,
        );

        const currentOfferings = new Map(
          currentOfferingPeriods
            .filter((offering) => offering.endsAt === null)
            .map((offering) => [offering.groupId, offering]),
        );
        const offeringsByGroup = new Map<string, (typeof offerings)[number][]>();
        for (const offering of currentOfferingPeriods) {
          const values = offeringsByGroup.get(offering.groupId) ?? [];
          values.push(offering);
          offeringsByGroup.set(offering.groupId, values);
        }
        const supersededOfferingsByGroup = new Map<string, (typeof offerings)[number][]>();
        for (const offering of offerings.filter((period) => period.supersededBy !== null)) {
          const values = supersededOfferingsByGroup.get(offering.groupId) ?? [];
          values.push(offering);
          supersededOfferingsByGroup.set(offering.groupId, values);
        }
        const registrationsByMembership = new Map<string, (typeof registrations)[number][]>();
        for (const registration of currentRegistrationPeriods) {
          const values = registrationsByMembership.get(registration.groupMembershipId) ?? [];
          values.push(registration);
          registrationsByMembership.set(registration.groupMembershipId, values);
        }
        const supersededRegistrationsByMembership = new Map<
          string,
          (typeof registrations)[number][]
        >();
        for (const registration of registrations.filter((period) => period.supersededBy !== null)) {
          const values =
            supersededRegistrationsByMembership.get(registration.groupMembershipId) ?? [];
          values.push(registration);
          supersededRegistrationsByMembership.set(registration.groupMembershipId, values);
        }
        const participantRows = participants.map((participant) => {
          const history = registrationsByMembership.get(participant.id) ?? [];
          return {
            ...participant,
            currentRegistration: history.find((period) => period.endsAt === null) ?? null,
            latestRegistration: history[0] ?? null,
            registrationHistory: history,
            supersededRegistrationHistory:
              supersededRegistrationsByMembership.get(participant.id) ?? [],
          };
        });
        const serviceRows = services.map((service) => ({
          ...service,
          currentOffering: currentOfferings.get(service.groupId) ?? null,
          offeringHistory: offeringsByGroup.get(service.groupId) ?? [],
          supersededOfferingHistory: supersededOfferingsByGroup.get(service.groupId) ?? [],
        }));
        const missingOfferingCount = serviceRows.filter(
          (service) => service.currentOffering === null,
        ).length;
        const missingRegistrationCount = participantRows.filter(
          (participant) => participant.currentRegistration === null,
        ).length;

        return {
          workspace,
          services: serviceRows,
          participants: participantRows,
          contractPeriods: currentContractPeriods,
          contractPeriodHistory: contractPeriods,
          billingPolicy,
          products: products
            .filter((product) => product.policyVersions.length === 1)
            .map((product) => ({ ...product, currentPolicy: product.policyVersions[0]! })),
          readiness: {
            missingOfferingCount,
            missingRegistrationCount,
            contractHistoryReady: currentContractPeriods.length > 0,
            readyToSchedule:
              services.length > 0 &&
              missingOfferingCount === 0 &&
              missingRegistrationCount === 0 &&
              currentContractPeriods.length > 0 &&
              billingPolicy === null,
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private offeringPolicyFilter(input?: { query?: string; productKey?: string }) {
    const query = input?.query?.trim();
    const productKey = input?.productKey?.trim().toUpperCase();
    if ((query?.length ?? 0) > 120 || (productKey && !/^[A-Z][A-Z0-9_]{1,39}$/.test(productKey)))
      throw new Error('INVALID_OFFERING_POLICY_FILTER');
    return {
      ...(productKey ? { productPolicy: productKey } : {}),
      ...(query
        ? {
            OR: [
              { productPolicy: { contains: query, mode: Prisma.QueryMode.insensitive } },
              { product: { displayName: { contains: query, mode: Prisma.QueryMode.insensitive } } },
              { group: { name: { contains: query, mode: Prisma.QueryMode.insensitive } } },
              {
                group: {
                  workspace: { name: { contains: query, mode: Prisma.QueryMode.insensitive } },
                },
              },
              {
                group: {
                  serviceConfiguration: {
                    is: {
                      OR: [
                        { displayName: { contains: query, mode: Prisma.QueryMode.insensitive } },
                        { slug: { contains: query, mode: Prisma.QueryMode.insensitive } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    } satisfies Prisma.OemOfferingPeriodWhereInput;
  }

  private async assertOfferingPolicyCompatible(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId: string;
      productKey: string;
      classification: OemOfferingClassification;
      freeOfferingAllowed: boolean;
      requiredCapabilities: readonly string[];
    },
  ): Promise<void> {
    const programs = await tx.serviceProgram.findMany({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      select: { programTemplateVersionId: true },
    });
    const versions = await tx.programTemplateVersion.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: programs.map((program) => program.programTemplateVersionId) },
      },
      select: { definition: true },
    });
    const hasAiTraining = versions.some((version) =>
      parseProgramDefinition(version.definition).missions.some(
        (mission) => mission.capability === 'AI_TRAINING',
      ),
    );
    const blocker = oemOfferingPolicyBlockers(
      {
        key: input.productKey,
        freeOfferingAllowed: input.freeOfferingAllowed,
        requiredCapabilities: input.requiredCapabilities,
      },
      input.classification,
      hasAiTraining ? ['AI_TRAINING'] : [],
    )[0];
    if (blocker) throw new Error(blocker);
  }

  private async authorizeSuperAdmin(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ): Promise<void> {
    const admin = await tx.platformAdmin.findFirst({
      where: {
        userId: actorUserId,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!admin) throw new Error('SUPER_ADMIN_REQUIRED');
  }

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

  private async assertNoFinalizedBillingImpact(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    affectedWindows: ContractWindow[],
  ): Promise<void> {
    const finalized = await tx.tenantMonthlyUsage.findMany({
      where: { workspaceId, status: 'FINALIZED' },
      select: { periodStart: true, periodEnd: true },
    });
    if (
      finalized.some((usage) =>
        affectedWindows.some((changed) =>
          overlaps(changed, {
            startsAt: new Date(usage.periodStart.getTime() - BUSINESS_TIMEZONE_OFFSET_MS),
            endsAt: new Date(usage.periodEnd.getTime() - BUSINESS_TIMEZONE_OFFSET_MS),
          }),
        ),
      )
    )
      throw new Error('FINALIZED_BILLING_PERIOD_IMMUTABLE');
  }

  async registerProductPolicy(input: {
    key: string;
    displayName: string;
    freeOfferingAllowed: boolean;
    requiredCapabilities: readonly string[];
    effectiveFrom: Date;
    actorUserId: string;
    reason: string;
  }) {
    const key = input.key.trim().toUpperCase();
    const displayName = requiredText(input.displayName, 120);
    const reason = requiredText(input.reason, 1000);
    const requiredCapabilities = [...new Set(input.requiredCapabilities.map((v) => v.trim()))];
    if (
      !/^[A-Z][A-Z0-9_]{1,39}$/.test(key) ||
      requiredCapabilities.length > 20 ||
      requiredCapabilities.some((v) => !/^[A-Z][A-Z0-9_]{1,79}$/.test(v)) ||
      !Number.isFinite(input.effectiveFrom.getTime()) ||
      input.effectiveFrom.toISOString().slice(10) !== 'T00:00:00.000Z'
    )
      throw new Error('INVALID_PRODUCT_POLICY');
    return this.client.$transaction(async (tx) => {
      await this.authorizeSuperAdmin(tx, input.actorUserId);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'oem-service-product:' + key}))`,
      );
      const existing = await tx.commercialServiceProduct.findUnique({
        where: { key },
        include: { policyVersions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (existing) {
        const policy = existing.policyVersions[0];
        if (
          existing.status === 'ACTIVE' &&
          existing.displayName === displayName &&
          policy?.version === 1 &&
          policy.freeOfferingAllowed === input.freeOfferingAllowed &&
          policy.effectiveFrom.getTime() === input.effectiveFrom.getTime() &&
          policy.reason === reason &&
          policy.createdByUserId === input.actorUserId &&
          policy.requiredCapabilities.length === requiredCapabilities.length &&
          policy.requiredCapabilities.every((v) => requiredCapabilities.includes(v))
        )
          return existing;
        throw new Error('PRODUCT_POLICY_ALREADY_EXISTS');
      }
      return tx.commercialServiceProduct.create({
        data: {
          key,
          displayName,
          status: 'ACTIVE',
          createdByUserId: input.actorUserId,
          policyVersions: {
            create: {
              version: 1,
              freeOfferingAllowed: input.freeOfferingAllowed,
              requiredCapabilities,
              effectiveFrom: input.effectiveFrom,
              createdByUserId: input.actorUserId,
              reason,
            },
          },
        },
        include: { policyVersions: true },
      });
    });
  }

  async listProductPolicies(actorUserId: string) {
    return this.client.$transaction(async (tx) => {
      await this.authorizeSuperAdmin(tx, actorUserId);
      const products = await tx.commercialServiceProduct.findMany({
        include: {
          policyVersions: {
            orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
          },
          _count: {
            select: {
              offeringPeriods: { where: { endsAt: null, supersededBy: { is: null } } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { key: 'asc' }],
      });
      if (products.some((product) => product.policyVersions.length === 0))
        throw new Error('REVIEW_REQUIRED: service product policy version missing');
      return products;
    });
  }

  async listOfferingPolicyMigrations(
    actorUserId: string,
    filter?: { query?: string; productKey?: string },
    limit = 200,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_001)
      throw new Error('INVALID_OFFERING_POLICY_LIMIT');
    return this.client.$transaction(async (tx) => {
      await this.authorizeSuperAdmin(tx, actorUserId);
      const offerings = await tx.oemOfferingPeriod.findMany({
        where: {
          endsAt: null,
          supersededBy: { is: null },
          ...this.offeringPolicyFilter(filter),
        },
        include: {
          productPolicyVersion: true,
          product: {
            include: {
              policyVersions: { orderBy: [{ version: 'asc' }] },
            },
          },
          group: {
            select: {
              name: true,
              workspace: { select: { name: true } },
              serviceConfiguration: { select: { displayName: true, slug: true } },
            },
          },
        },
        orderBy: [{ productPolicy: 'asc' }, { workspaceId: 'asc' }, { groupId: 'asc' }],
        take: limit,
      });
      const programs = await tx.serviceProgram.findMany({
        where: { groupId: { in: [...new Set(offerings.map((offering) => offering.groupId))] } },
        select: { workspaceId: true, groupId: true, programTemplateVersionId: true },
      });
      const versions = await tx.programTemplateVersion.findMany({
        where: {
          id: { in: [...new Set(programs.map((program) => program.programTemplateVersionId))] },
        },
        select: { id: true, definition: true },
      });
      const definitions = new Map(versions.map((version) => [version.id, version.definition]));
      const aiTrainingScopes = new Set<string>();
      const invalidDefinitionScopes = new Set<string>();
      for (const program of programs) {
        const scope = `${program.workspaceId}:${program.groupId}`;
        try {
          if (
            parseProgramDefinition(definitions.get(program.programTemplateVersionId)).missions.some(
              (mission) => mission.capability === 'AI_TRAINING',
            )
          )
            aiTrainingScopes.add(scope);
        } catch {
          invalidDefinitionScopes.add(scope);
        }
      }
      return offerings.map((offering) => {
        const scope = `${offering.workspaceId}:${offering.groupId}`;
        return {
          ...offering,
          targetPolicyReviews: offering.product.policyVersions
            .filter((policy) => policy.version > offering.productPolicyVersion.version)
            .map((policy) => ({
              policyVersionId: policy.id,
              blockers: [
                ...(invalidDefinitionScopes.has(scope)
                  ? (['OEM_PROGRAM_DEFINITION_REVIEW_REQUIRED'] as const)
                  : []),
                ...oemOfferingPolicyBlockers(
                  {
                    key: offering.productPolicy,
                    freeOfferingAllowed: policy.freeOfferingAllowed,
                    requiredCapabilities: policy.requiredCapabilities,
                  },
                  offering.classification as OemOfferingClassification,
                  aiTrainingScopes.has(scope) ? ['AI_TRAINING'] : [],
                ),
              ],
            })),
        };
      });
    });
  }

  async listOfferingPolicyHistory(
    actorUserId: string,
    filter?: { query?: string; productKey?: string },
    limit = 200,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000)
      throw new Error('INVALID_OFFERING_POLICY_LIMIT');
    return this.client.$transaction(async (tx) => {
      await this.authorizeSuperAdmin(tx, actorUserId);
      const periods = await tx.oemOfferingPeriod.findMany({
        where: this.offeringPolicyFilter(filter),
        include: {
          productPolicyVersion: true,
          product: { select: { displayName: true } },
          group: {
            select: {
              name: true,
              workspace: { select: { name: true } },
              serviceConfiguration: { select: { displayName: true, slug: true } },
            },
          },
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const actorIds = [...new Set(periods.map((period) => period.actorUserId))];
      const actors = await tx.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, displayName: true },
      });
      const actorNames = new Map(actors.map((actor) => [actor.id, actor.displayName]));
      return {
        entries: periods.slice(0, limit).map((period) => ({
          ...period,
          actorDisplayName: actorNames.get(period.actorUserId) ?? null,
        })),
        truncated: periods.length > limit,
      };
    });
  }

  async migrateOfferingProductPolicy(input: {
    workspaceId: string;
    offeringId: string;
    expectedCurrentPolicyVersionId: string;
    targetPolicyVersionId: string;
    actorUserId: string;
    reason: string;
    confirmed: boolean;
    now?: Date;
  }) {
    const reason = requiredText(input.reason, 1000);
    const now = input.now ?? new Date();
    const effectiveOn = new Date(`${dateInBusinessTimezone(now)}T00:00:00.000Z`);
    if (!input.confirmed || !Number.isFinite(now.getTime()))
      throw new Error('OFFERING_POLICY_MIGRATION_CONFIRMATION_REQUIRED');
    if (input.expectedCurrentPolicyVersionId === input.targetPolicyVersionId)
      throw new Error('OFFERING_POLICY_MIGRATION_TARGET_REQUIRED');
    return this.client.$transaction(async (tx) => {
      // Use the same workspace lock order as setOffering so both operations serialize.
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "oem_offering_periods" WHERE "id" = ${input.offeringId}::uuid FOR UPDATE`,
      );
      const current = await tx.oemOfferingPeriod.findUnique({
        where: { id: input.offeringId },
        include: { productPolicyVersion: true, supersededBy: { select: { id: true } } },
      });
      if (!current || current.endsAt || current.supersededBy) throw new Error('STALE_OFFERING');
      if (current.workspaceId !== input.workspaceId) throw new Error('OFFERING_WORKSPACE_MISMATCH');
      if (current.productPolicyVersionId !== input.expectedCurrentPolicyVersionId)
        throw new Error('STALE_OFFERING_POLICY');
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'oem-service-product:' + current.productId}))`,
      );
      const target = await tx.commercialServiceProductPolicyVersion.findFirst({
        where: {
          id: input.targetPolicyVersionId,
          productId: current.productId,
          effectiveFrom: { lte: effectiveOn },
          product: { status: 'ACTIVE' },
        },
      });
      if (!target) throw new Error('OFFERING_POLICY_TARGET_NOT_EFFECTIVE');
      if (target.version <= current.productPolicyVersion.version)
        throw new Error('OFFERING_POLICY_VERSION_MUST_ADVANCE');
      await this.assertOfferingPolicyCompatible(tx, {
        workspaceId: current.workspaceId,
        groupId: current.groupId,
        productKey: current.productPolicy,
        classification: current.classification as OemOfferingClassification,
        freeOfferingAllowed: target.freeOfferingAllowed,
        requiredCapabilities: target.requiredCapabilities,
      });
      if (now <= current.startsAt) throw new Error('INVALID_OFFERING_TIME');
      const closed = await tx.oemOfferingPeriod.updateMany({
        where: { id: current.id, endsAt: null },
        data: { endsAt: now },
      });
      if (closed.count !== 1) throw new Error('STALE_OFFERING');
      return tx.oemOfferingPeriod.create({
        data: {
          workspaceId: current.workspaceId,
          groupId: current.groupId,
          productId: current.productId,
          productPolicyVersionId: target.id,
          productPolicy: current.productPolicy,
          classification: current.classification,
          startsAt: now,
          actorUserId: input.actorUserId,
          reason,
        },
      });
    });
  }

  async reviseProductPolicy(input: {
    productId: string;
    expectedLatestPolicyId: string;
    freeOfferingAllowed: boolean;
    requiredCapabilities: readonly string[];
    effectiveFrom: Date;
    actorUserId: string;
    reason: string;
    now?: Date;
  }) {
    const reason = requiredText(input.reason, 1000);
    const requiredCapabilities = [...new Set(input.requiredCapabilities.map((v) => v.trim()))];
    const now = input.now ?? new Date();
    const today = new Date(`${dateInBusinessTimezone(now)}T00:00:00.000Z`);
    if (
      requiredCapabilities.length > 20 ||
      requiredCapabilities.some((v) => !/^[A-Z][A-Z0-9_]{1,79}$/.test(v)) ||
      !Number.isFinite(input.effectiveFrom.getTime()) ||
      input.effectiveFrom.toISOString().slice(10) !== 'T00:00:00.000Z' ||
      input.effectiveFrom < today
    )
      throw new Error('INVALID_PRODUCT_POLICY_REVISION');
    return this.client.$transaction(async (tx) => {
      await this.authorizeSuperAdmin(tx, input.actorUserId);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'oem-service-product:' + input.productId}))`,
      );
      const product = await tx.commercialServiceProduct.findUnique({
        where: { id: input.productId },
        include: { policyVersions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!product) throw new Error('PRODUCT_POLICY_NOT_FOUND');
      if (product.status !== 'ACTIVE') throw new Error('PRODUCT_POLICY_RETIRED');
      const latest = product.policyVersions[0];
      if (!latest || latest.id !== input.expectedLatestPolicyId)
        throw new Error('STALE_PRODUCT_POLICY');
      if (input.effectiveFrom <= latest.effectiveFrom)
        throw new Error('POLICY_EFFECTIVE_DATE_MUST_ADVANCE');
      return tx.commercialServiceProductPolicyVersion.create({
        data: {
          productId: product.id,
          version: latest.version + 1,
          freeOfferingAllowed: input.freeOfferingAllowed,
          requiredCapabilities,
          effectiveFrom: input.effectiveFrom,
          createdByUserId: input.actorUserId,
          reason,
        },
      });
    });
  }

  async retireProduct(input: {
    productId: string;
    expectedLatestPolicyId: string;
    expectedUpdatedAt: Date;
    actorUserId: string;
    reason: string;
    confirmed: boolean;
    now?: Date;
  }) {
    const reason = requiredText(input.reason, 1000);
    const now = input.now ?? new Date();
    if (!input.confirmed || !Number.isFinite(input.expectedUpdatedAt.getTime()))
      throw new Error('PRODUCT_RETIREMENT_CONFIRMATION_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorizeSuperAdmin(tx, input.actorUserId);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'oem-service-product:' + input.productId}))`,
      );
      const product = await tx.commercialServiceProduct.findUnique({
        where: { id: input.productId },
        include: { policyVersions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!product) throw new Error('PRODUCT_POLICY_NOT_FOUND');
      if (
        product.status === 'RETIRED' &&
        product.retiredByUserId === input.actorUserId &&
        product.retiredReason === reason
      )
        return product;
      if (product.status !== 'ACTIVE') throw new Error('PRODUCT_POLICY_RETIRED');
      if (
        product.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() ||
        product.policyVersions[0]?.id !== input.expectedLatestPolicyId
      )
        throw new Error('STALE_PRODUCT_POLICY');
      return tx.commercialServiceProduct.update({
        where: { id: product.id },
        data: {
          status: 'RETIRED',
          retiredByUserId: input.actorUserId,
          retiredReason: reason,
          retiredAt: now,
        },
      });
    });
  }

  async setOffering(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    productPolicy: string;
    classification: OemOfferingClassification;
    expectedCurrentId: string | null;
    reason: string;
    now?: Date;
  }) {
    const reason = requiredText(input.reason, 1000);
    const now = input.now ?? new Date();
    const effectiveOn = new Date(`${dateInBusinessTimezone(now)}T00:00:00.000Z`);
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
      const product = await tx.commercialServiceProduct.findFirst({
        where: { key: input.productPolicy, status: 'ACTIVE' },
        include: {
          policyVersions: {
            where: { effectiveFrom: { lte: effectiveOn } },
            orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
            take: 1,
          },
        },
      });
      const productPolicy = product?.policyVersions[0];
      if (!product || !productPolicy)
        throw new Error('REVIEW_REQUIRED: unknown or future OEM service product policy');
      await this.assertOfferingPolicyCompatible(tx, {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        productKey: product.key,
        classification: input.classification,
        freeOfferingAllowed: productPolicy.freeOfferingAllowed,
        requiredCapabilities: productPolicy.requiredCapabilities,
      });
      const current = await tx.oemOfferingPeriod.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          endsAt: null,
          supersededBy: { is: null },
        },
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
          productId: product.id,
          productPolicyVersionId: productPolicy.id,
          productPolicy: product.key,
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
        where: {
          workspaceId: input.workspaceId,
          endsAt: null,
          supersededBy: { is: null },
        },
      });
      if (groups.some((g) => !offerings.some((o) => o.groupId === g.groupId)))
        throw new Error('REVIEW_REQUIRED: service classification missing');
      const contract = await tx.oemContractPeriod.findFirst({
        where: { workspaceId: input.workspaceId, supersededBy: { is: null } },
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
        where: {
          workspaceId: input.workspaceId,
          endsAt: null,
          supersededBy: { is: null },
        },
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
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "group_memberships" WHERE "id" = ${member.id}::uuid FOR UPDATE`,
      );
      const existing = await tx.oemRegistrationPeriod.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupMembershipId: member.id,
          supersededBy: { is: null },
        },
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

  async correctOfferingPeriod(input: {
    workspaceId: string;
    offeringPeriodId: string;
    expectedStartsAt: Date;
    expectedEndsAt: Date | null;
    expectedClassification: OemOfferingClassification;
    revisedStartsAt: Date;
    revisedEndsAt: Date | null;
    revisedClassification: OemOfferingClassification;
    actorUserId: string;
    reason: string;
    confirmed: boolean;
  }) {
    const reason = requiredText(input.reason, 1000);
    if (
      !input.confirmed ||
      !Number.isFinite(input.expectedStartsAt.getTime()) ||
      !Number.isFinite(input.revisedStartsAt.getTime()) ||
      (input.expectedEndsAt && !Number.isFinite(input.expectedEndsAt.getTime())) ||
      (input.revisedEndsAt &&
        (!Number.isFinite(input.revisedEndsAt.getTime()) ||
          input.revisedEndsAt <= input.revisedStartsAt))
    )
      throw new Error('OFFERING_CORRECTION_CONFIRMATION_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      const current = await tx.oemOfferingPeriod.findFirst({
        where: { id: input.offeringPeriodId, workspaceId: input.workspaceId },
        include: { productPolicyVersion: true, supersededBy: true },
      });
      if (!current) throw new Error('OFFERING_PERIOD_NOT_FOUND');
      if (current.supersededBy) {
        if (
          current.supersededBy.startsAt.getTime() === input.revisedStartsAt.getTime() &&
          sameOptionalDate(current.supersededBy.endsAt, input.revisedEndsAt) &&
          current.supersededBy.classification === input.revisedClassification &&
          current.supersededBy.actorUserId === input.actorUserId &&
          current.supersededBy.reason === reason
        )
          return current.supersededBy;
        throw new Error('STALE_OFFERING_PERIOD');
      }
      if (
        current.startsAt.getTime() !== input.expectedStartsAt.getTime() ||
        !sameOptionalDate(current.endsAt, input.expectedEndsAt) ||
        current.classification !== input.expectedClassification
      )
        throw new Error('STALE_OFFERING_PERIOD');
      if (
        current.startsAt.getTime() === input.revisedStartsAt.getTime() &&
        sameOptionalDate(current.endsAt, input.revisedEndsAt) &&
        current.classification === input.revisedClassification
      )
        throw new Error('OFFERING_CORRECTION_CHANGE_REQUIRED');

      await this.assertOfferingPolicyCompatible(tx, {
        workspaceId: current.workspaceId,
        groupId: current.groupId,
        productKey: current.productPolicy,
        classification: input.revisedClassification,
        freeOfferingAllowed: current.productPolicyVersion.freeOfferingAllowed,
        requiredCapabilities: current.productPolicyVersion.requiredCapabilities,
      });
      const revisedWindow = {
        startsAt: input.revisedStartsAt,
        endsAt: input.revisedEndsAt,
      };
      await this.assertNoFinalizedBillingImpact(
        tx,
        input.workspaceId,
        current.classification === input.revisedClassification
          ? changedContractWindows(current, revisedWindow)
          : [combinedWindow(current, revisedWindow)],
      );
      const otherCurrentPeriods = await tx.oemOfferingPeriod.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupId: current.groupId,
          id: { not: current.id },
          supersededBy: { is: null },
        },
        select: { startsAt: true, endsAt: true },
      });
      if (otherCurrentPeriods.some((period) => overlaps(revisedWindow, period)))
        throw new Error('REVIEW_REQUIRED: overlapping offering period');

      const corrected = await tx.oemOfferingPeriod.create({
        data: {
          workspaceId: current.workspaceId,
          groupId: current.groupId,
          productId: current.productId,
          productPolicyVersionId: current.productPolicyVersionId,
          productPolicy: current.productPolicy,
          classification: input.revisedClassification,
          startsAt: input.revisedStartsAt,
          endsAt: input.revisedEndsAt,
          actorUserId: input.actorUserId,
          reason,
          supersedesId: current.id,
        },
      });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'OEM_OFFERING_PERIOD',
          entityId: corrected.id,
          action: 'CORRECTED',
          beforeData: jsonSnapshot(current),
          afterData: jsonSnapshot(corrected),
        },
      });
      return corrected;
    });
  }

  async correctRegistrationPeriod(input: {
    workspaceId: string;
    registrationPeriodId: string;
    expectedStartsAt: Date;
    expectedEndsAt: Date | null;
    revisedStartsAt: Date;
    revisedEndsAt: Date | null;
    actorUserId: string;
    reason: string;
    confirmed: boolean;
  }) {
    const reason = requiredText(input.reason, 1000);
    if (
      !input.confirmed ||
      !Number.isFinite(input.expectedStartsAt.getTime()) ||
      !Number.isFinite(input.revisedStartsAt.getTime()) ||
      (input.expectedEndsAt && !Number.isFinite(input.expectedEndsAt.getTime())) ||
      (input.revisedEndsAt &&
        (!Number.isFinite(input.revisedEndsAt.getTime()) ||
          input.revisedEndsAt < input.revisedStartsAt))
    )
      throw new Error('REGISTRATION_CORRECTION_CONFIRMATION_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      const candidate = await tx.oemRegistrationPeriod.findFirst({
        where: { id: input.registrationPeriodId, workspaceId: input.workspaceId },
        select: { groupMembershipId: true },
      });
      if (!candidate) throw new Error('REGISTRATION_PERIOD_NOT_FOUND');
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "group_memberships" WHERE "id" = ${candidate.groupMembershipId}::uuid FOR UPDATE`,
      );
      const current = await tx.oemRegistrationPeriod.findFirst({
        where: { id: input.registrationPeriodId, workspaceId: input.workspaceId },
        include: { supersededBy: true },
      });
      if (!current) throw new Error('REGISTRATION_PERIOD_NOT_FOUND');
      if (current.supersededBy) {
        if (
          current.supersededBy.startsAt.getTime() === input.revisedStartsAt.getTime() &&
          sameOptionalDate(current.supersededBy.endsAt, input.revisedEndsAt) &&
          current.supersededBy.registeredByUserId === input.actorUserId &&
          current.supersededBy.reason === reason
        )
          return current.supersededBy;
        throw new Error('STALE_REGISTRATION_PERIOD');
      }
      if (
        current.startsAt.getTime() !== input.expectedStartsAt.getTime() ||
        !sameOptionalDate(current.endsAt, input.expectedEndsAt)
      )
        throw new Error('STALE_REGISTRATION_PERIOD');
      if (
        current.startsAt.getTime() === input.revisedStartsAt.getTime() &&
        sameOptionalDate(current.endsAt, input.revisedEndsAt)
      )
        throw new Error('REGISTRATION_CORRECTION_CHANGE_REQUIRED');

      const revisedWindow = {
        startsAt: input.revisedStartsAt,
        endsAt: input.revisedEndsAt,
      };
      await this.assertNoFinalizedBillingImpact(
        tx,
        input.workspaceId,
        changedContractWindows(current, revisedWindow),
      );
      const otherCurrentPeriods = await tx.oemRegistrationPeriod.findMany({
        where: {
          workspaceId: input.workspaceId,
          groupMembershipId: current.groupMembershipId,
          id: { not: current.id },
          supersededBy: { is: null },
        },
        select: { startsAt: true, endsAt: true },
      });
      if (otherCurrentPeriods.some((period) => overlaps(revisedWindow, period)))
        throw new Error('REVIEW_REQUIRED: overlapping registration period');

      const corrected = await tx.oemRegistrationPeriod.create({
        data: {
          workspaceId: current.workspaceId,
          groupId: current.groupId,
          groupMembershipId: current.groupMembershipId,
          userId: current.userId,
          startsAt: input.revisedStartsAt,
          endsAt: input.revisedEndsAt,
          registeredByUserId: input.actorUserId,
          endedByUserId: input.revisedEndsAt ? input.actorUserId : null,
          reason,
          endReason: input.revisedEndsAt ? reason : null,
          supersedesId: current.id,
        },
      });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'OEM_REGISTRATION_PERIOD',
          entityId: corrected.id,
          action: 'CORRECTED',
          beforeData: jsonSnapshot(current),
          afterData: jsonSnapshot(corrected),
        },
      });
      return corrected;
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
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "workspaces" WHERE "id" = ${input.workspaceId}::uuid FOR UPDATE`,
      );
      const contract = await tx.organizationCommercialContract.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if (!contract) throw new Error('OEM_CONTRACT_REQUIRED');
      const existing = await tx.oemContractPeriod.findFirst({
        where: {
          workspaceId: input.workspaceId,
          startsAt: input.startsAt,
          supersededBy: { is: null },
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
          supersededBy: { is: null },
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

  async correctContractPeriod(input: {
    workspaceId: string;
    contractPeriodId: string;
    expectedStartsAt: Date;
    expectedEndsAt: Date | null;
    revisedStartsAt: Date;
    revisedEndsAt: Date | null;
    actorUserId: string;
    reason: string;
    confirmed: boolean;
  }) {
    const reason = requiredText(input.reason, 1000);
    if (
      !input.confirmed ||
      !Number.isFinite(input.expectedStartsAt.getTime()) ||
      !Number.isFinite(input.revisedStartsAt.getTime()) ||
      (input.expectedEndsAt && !Number.isFinite(input.expectedEndsAt.getTime())) ||
      (input.revisedEndsAt &&
        (!Number.isFinite(input.revisedEndsAt.getTime()) ||
          input.revisedEndsAt <= input.revisedStartsAt))
    )
      throw new Error('CONTRACT_CORRECTION_CONFIRMATION_REQUIRED');
    return this.client.$transaction(async (tx) => {
      await this.authorize(tx, input.workspaceId, input.actorUserId);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "workspaces" WHERE "id" = ${input.workspaceId}::uuid FOR UPDATE`,
      );
      const commercialContract = await tx.organizationCommercialContract.findUnique({
        where: { workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!commercialContract) throw new Error('OEM_CONTRACT_REQUIRED');
      const current = await tx.oemContractPeriod.findFirst({
        where: { id: input.contractPeriodId, workspaceId: input.workspaceId },
        include: { supersededBy: true },
      });
      if (!current) throw new Error('CONTRACT_PERIOD_NOT_FOUND');
      if (current.supersededBy) {
        if (
          current.supersededBy.startsAt.getTime() === input.revisedStartsAt.getTime() &&
          sameOptionalDate(current.supersededBy.endsAt, input.revisedEndsAt) &&
          current.supersededBy.actorUserId === input.actorUserId &&
          current.supersededBy.reason === reason
        )
          return current.supersededBy;
        throw new Error('STALE_CONTRACT_PERIOD');
      }
      if (
        current.startsAt.getTime() !== input.expectedStartsAt.getTime() ||
        !sameOptionalDate(current.endsAt, input.expectedEndsAt)
      )
        throw new Error('STALE_CONTRACT_PERIOD');
      if (
        current.startsAt.getTime() === input.revisedStartsAt.getTime() &&
        sameOptionalDate(current.endsAt, input.revisedEndsAt)
      )
        throw new Error('CONTRACT_CORRECTION_CHANGE_REQUIRED');

      const affectedWindows = changedContractWindows(current, {
        startsAt: input.revisedStartsAt,
        endsAt: input.revisedEndsAt,
      });
      await this.assertNoFinalizedBillingImpact(tx, input.workspaceId, affectedWindows);

      const otherCurrentPeriods = await tx.oemContractPeriod.findMany({
        where: {
          workspaceId: input.workspaceId,
          id: { not: current.id },
          supersededBy: { is: null },
        },
        select: { startsAt: true, endsAt: true },
      });
      if (
        otherCurrentPeriods.some((period) =>
          overlaps({ startsAt: input.revisedStartsAt, endsAt: input.revisedEndsAt }, period),
        )
      )
        throw new Error('REVIEW_REQUIRED: overlapping contract period');

      const corrected = await tx.oemContractPeriod.create({
        data: {
          workspaceId: input.workspaceId,
          startsAt: input.revisedStartsAt,
          endsAt: input.revisedEndsAt,
          actorUserId: input.actorUserId,
          reason,
          supersedesId: current.id,
        },
      });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'OEM_CONTRACT_PERIOD',
          entityId: corrected.id,
          action: 'CORRECTED',
          beforeData: jsonSnapshot(current),
          afterData: jsonSnapshot(corrected),
        },
      });
      return corrected;
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
