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

/** Explicit preparation; no inferred registration dates, payment mode or price classification. */
export class PrismaOemBillingAdminService {
  constructor(private readonly client: PrismaClient = prisma) {}

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
            select: { offeringPeriods: { where: { endsAt: null } } },
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
        where: { endsAt: null, ...this.offeringPolicyFilter(filter) },
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
        include: { productPolicyVersion: true },
      });
      if (!current || current.endsAt) throw new Error('STALE_OFFERING');
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
