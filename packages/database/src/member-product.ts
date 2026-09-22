import type {
  MemberProductActivityRepository,
  MemberProductProfileRepository,
} from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaMemberProductProfileRepository implements MemberProductProfileRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<MemberProductProfileRepository['list']>[0]) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const profiles = await this.client.memberProductProfile.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        userId: input.actorUserId,
        archivedAt: null,
        externalTrackingLink: {
          status: 'ACTIVE',
          scopeType: 'MEMBER',
          memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
        },
      },
      include: {
        externalTrackingLink: { select: { system: { select: { name: true } } } },
        productPack: { select: { id: true, name: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return profiles.map((profile) => ({
      id: profile.id,
      externalTrackingLinkId: profile.externalTrackingLinkId,
      externalTrackingSystemName: profile.externalTrackingLink.system.name,
      productPackId: profile.productPack?.status === 'ACTIVE' ? profile.productPack.id : null,
      productPackName: profile.productPack?.status === 'ACTIVE' ? profile.productPack.name : null,
      name: profile.name,
      appealPoint: profile.appealPoint,
      targetAudience: profile.targetAudience,
      updatedAt: profile.updatedAt,
    }));
  }

  async listProductMasters(
    input: Parameters<MemberProductProfileRepository['listProductMasters']>[0],
  ) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const now = new Date();
    return this.client.productPack.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        versions: {
          some: {
            status: 'PUBLISHED',
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
            ],
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async getGenerationContext(
    input: Parameters<MemberProductProfileRepository['getGenerationContext']>[0],
  ) {
    const profile = await this.client.memberProductProfile.findFirst({
      where: {
        id: input.profileId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        archivedAt: null,
        groupMembership: {
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        externalTrackingLink: {
          status: 'ACTIVE',
          deletedAt: null,
          scopeType: 'MEMBER',
          memberIdentity: { status: 'ACTIVE' },
        },
      },
      select: {
        id: true,
        externalTrackingLinkId: true,
        productPackId: true,
        name: true,
        appealPoint: true,
        targetAudience: true,
        productPack: {
          select: {
            workspaceId: true,
            groupId: true,
            name: true,
            status: true,
            versions: {
              where: {
                status: 'PUBLISHED',
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: input.now } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gte: input.now } }] },
                ],
              },
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                summary: true,
                providerName: true,
                targetCustomer: true,
                facts: true,
                suitableFor: true,
                unsuitableFor: true,
                rules: {
                  orderBy: { sortOrder: 'asc' },
                  select: { type: true, value: true, condition: true },
                },
              },
            },
          },
        },
      },
    });
    if (!profile) return null;
    const productPack = profile.productPack;
    const version = productPack?.versions[0];
    const officialProduct =
      productPack?.status === 'ACTIVE' &&
      productPack.workspaceId === input.workspaceId &&
      productPack.groupId === input.groupId &&
      version
        ? {
            name: productPack.name,
            summary: version.summary,
            providerName: version.providerName,
            targetCustomer: version.targetCustomer,
            facts: version.facts,
            suitableFor: version.suitableFor,
            unsuitableFor: version.unsuitableFor,
            requiredDisclosures: version.rules
              .filter((rule) => rule.type === 'REQUIRED_DISCLOSURE')
              .map((rule) => rule.value),
            forbiddenExpressions: version.rules
              .filter((rule) => rule.type === 'FORBIDDEN_EXPRESSION')
              .map((rule) => rule.value),
            conditionalExpressions: version.rules
              .filter((rule) => rule.type === 'CONDITIONAL_EXPRESSION')
              .map((rule) => ({ value: rule.value, condition: rule.condition })),
          }
        : null;
    return {
      id: profile.id,
      externalTrackingLinkId: profile.externalTrackingLinkId,
      productPackId: profile.productPackId,
      name: profile.name,
      appealPoint: profile.appealPoint,
      targetAudience: profile.targetAudience,
      officialProduct,
    };
  }

  async save(input: Parameters<MemberProductProfileRepository['save']>[0]) {
    return this.client.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership) return null;
      const link = await tx.externalTrackingLink.findFirst({
        where: {
          id: input.externalTrackingLinkId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'ACTIVE',
          deletedAt: null,
          scopeType: 'MEMBER',
          memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
        },
        select: { id: true, system: { select: { name: true } } },
      });
      if (!link) return null;
      const productPack = input.productPackId
        ? await tx.productPack.findFirst({
            where: {
              id: input.productPackId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              status: 'ACTIVE',
              versions: {
                some: {
                  status: 'PUBLISHED',
                  AND: [
                    { OR: [{ validFrom: null }, { validFrom: { lte: input.now } }] },
                    { OR: [{ validUntil: null }, { validUntil: { gte: input.now } }] },
                  ],
                },
              },
            },
            select: { id: true, name: true },
          })
        : null;
      if (input.productPackId && !productPack) return null;
      const before = input.profileId
        ? await tx.memberProductProfile.findFirst({
            where: {
              id: input.profileId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
              archivedAt: null,
            },
          })
        : null;
      if (input.profileId && !before) return null;
      const profile = before
        ? await tx.memberProductProfile.update({
            where: { id: before.id },
            data: {
              externalTrackingLinkId: link.id,
              productPackId: productPack?.id ?? null,
              name: input.name,
              appealPoint: input.appealPoint,
              targetAudience: input.targetAudience,
            },
          })
        : await tx.memberProductProfile.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              userId: input.actorUserId,
              externalTrackingLinkId: link.id,
              productPackId: productPack?.id ?? null,
              name: input.name,
              appealPoint: input.appealPoint,
              targetAudience: input.targetAudience,
            },
          });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'MEMBER_PRODUCT_PROFILE',
          resourceId: profile.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before
            ? {
                externalTrackingLinkId: before.externalTrackingLinkId,
                productPackId: before.productPackId,
                name: before.name,
                appealPoint: before.appealPoint,
                targetAudience: before.targetAudience,
              }
            : Prisma.JsonNull,
          afterData: {
            externalTrackingLinkId: profile.externalTrackingLinkId,
            productPackId: profile.productPackId,
            name: profile.name,
            appealPoint: profile.appealPoint,
            targetAudience: profile.targetAudience,
          },
          performedByUserId: input.actorUserId,
          performedAt: input.now,
        },
      });
      return {
        id: profile.id,
        externalTrackingLinkId: profile.externalTrackingLinkId,
        externalTrackingSystemName: link.system.name,
        productPackId: productPack?.id ?? null,
        productPackName: productPack?.name ?? null,
        name: profile.name,
        appealPoint: profile.appealPoint,
        targetAudience: profile.targetAudience,
        updatedAt: profile.updatedAt,
      };
    });
  }

  async archive(input: Parameters<MemberProductProfileRepository['archive']>[0]) {
    return this.client.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership) return null;
      const profile = await tx.memberProductProfile.findFirst({
        where: {
          id: input.profileId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
        },
      });
      if (!profile) return null;
      if (profile.archivedAt) return false;
      await tx.memberProductProfile.update({
        where: { id: profile.id },
        data: { archivedAt: input.now },
      });
      await tx.externalTrackingAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          resourceType: 'MEMBER_PRODUCT_PROFILE',
          resourceId: profile.id,
          action: 'ARCHIVED',
          beforeData: { archivedAt: null },
          afterData: { archivedAt: input.now.toISOString() },
          performedByUserId: input.actorUserId,
          performedAt: input.now,
        },
      });
      return true;
    });
  }
}

export class PrismaMemberProductActivityRepository implements MemberProductActivityRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async recordGeneration(
    input: Parameters<MemberProductActivityRepository['recordGeneration']>[0],
  ) {
    return this.client.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership) return null;
      const [profile, bunshin] = await Promise.all([
        tx.memberProductProfile.findFirst({
          where: {
            id: input.profileId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            groupMembershipId: membership.id,
            userId: input.actorUserId,
            externalTrackingLinkId: input.externalTrackingLinkId,
            productPackId: input.productPackId,
            archivedAt: null,
            externalTrackingLink: {
              status: 'ACTIVE',
              deletedAt: null,
              scopeType: 'MEMBER',
              memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
            },
          },
          select: { id: true },
        }),
        tx.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            ownerUserId: input.actorUserId,
            archivedAt: null,
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
          select: { id: true },
        }),
      ]);
      if (!profile || !bunshin) return null;
      const run = await tx.memberProductContentRun.upsert({
        where: {
          groupMembershipId_operationKey: {
            groupMembershipId: membership.id,
            operationKey: input.operationKey,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
          profileId: profile.id,
          bunshinId: bunshin.id,
          externalTrackingLinkId: input.externalTrackingLinkId,
          productPackId: input.productPackId,
          platform: input.platform,
          candidateCount: input.candidateCount,
          operationKey: input.operationKey,
          createdAt: input.occurredAt,
        },
        update: {},
        select: {
          id: true,
          profileId: true,
          bunshinId: true,
          externalTrackingLinkId: true,
          productPackId: true,
          platform: true,
          candidateCount: true,
          createdAt: true,
        },
      });
      if (
        run.profileId !== profile.id ||
        run.bunshinId !== bunshin.id ||
        run.externalTrackingLinkId !== input.externalTrackingLinkId ||
        run.productPackId !== input.productPackId ||
        run.platform !== input.platform ||
        run.candidateCount !== input.candidateCount
      )
        return null;
      return { id: run.id, createdAt: run.createdAt };
    });
  }

  async recordEvent(input: Parameters<MemberProductActivityRepository['recordEvent']>[0]) {
    return this.client.$transaction(async (tx) => {
      const membership = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
          group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
        },
        select: { id: true },
      });
      if (!membership) return null;
      const run = await tx.memberProductContentRun.findFirst({
        where: {
          id: input.contentRunId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
        },
        select: { id: true, candidateCount: true },
      });
      if (!run || input.candidateIndex >= run.candidateCount) return null;
      const existing = await tx.memberProductContentEvent.findFirst({
        where: {
          contentRunId: run.id,
          OR: [
            { type: input.type, candidateIndex: input.candidateIndex },
            { operationKey: input.operationKey },
          ],
        },
        select: { id: true },
      });
      if (existing) return { recorded: false };
      await tx.memberProductContentEvent.upsert({
        where: {
          contentRunId_type_candidateIndex: {
            contentRunId: run.id,
            type: input.type,
            candidateIndex: input.candidateIndex,
          },
        },
        create: {
          contentRunId: run.id,
          type: input.type,
          candidateIndex: input.candidateIndex,
          operationKey: input.operationKey,
          occurredAt: input.occurredAt,
        },
        update: {},
      });
      return { recorded: true };
    });
  }

  async listMemberSummary(
    input: Parameters<MemberProductActivityRepository['listMemberSummary']>[0],
  ) {
    const membership = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const profiles = await this.client.memberProductProfile.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        userId: input.actorUserId,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        productPack: { select: { name: true } },
        contentRuns: {
          select: {
            createdAt: true,
            events: { select: { type: true, occurredAt: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return profiles.map((profile) => {
      const events = profile.contentRuns.flatMap((run) => run.events);
      const timestamps = [
        ...profile.contentRuns.map((run) => run.createdAt.getTime()),
        ...events.map((event) => event.occurredAt.getTime()),
      ];
      return {
        profileId: profile.id,
        productName: profile.name,
        productPackName: profile.productPack?.name ?? null,
        generatedCount: profile.contentRuns.length,
        copiedCount: events.filter((event) => event.type === 'COPIED').length,
        postedCount: events.filter((event) => event.type === 'POSTED').length,
        trackingUrlUsedCount: profile.contentRuns.length,
        lastActivityAt: timestamps.length ? new Date(Math.max(...timestamps)) : null,
      };
    });
  }

  async listServiceSummary(
    input: Parameters<MemberProductActivityRepository['listServiceSummary']>[0],
  ) {
    const manager = await this.client.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] },
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!manager) return null;
    const runs = await this.client.memberProductContentRun.findMany({
      where: { workspaceId: input.workspaceId, groupId: input.groupId },
      select: {
        profileId: true,
        userId: true,
        productPackId: true,
        createdAt: true,
        profile: { select: { name: true } },
        productPack: { select: { name: true } },
        events: { select: { type: true, occurredAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const summary = new Map<
      string,
      {
        key: string;
        productName: string;
        generatedCount: number;
        copiedCount: number;
        postedCount: number;
        trackingUrlUsedCount: number;
        memberIds: Set<string>;
        lastActivityAt: Date;
      }
    >();
    for (const run of runs) {
      const key = run.productPackId ?? `profile:${run.profileId}`;
      const current = summary.get(key) ?? {
        key,
        productName: run.productPack?.name ?? run.profile.name,
        generatedCount: 0,
        copiedCount: 0,
        postedCount: 0,
        trackingUrlUsedCount: 0,
        memberIds: new Set<string>(),
        lastActivityAt: run.createdAt,
      };
      current.generatedCount += 1;
      current.trackingUrlUsedCount += 1;
      current.memberIds.add(run.userId);
      for (const event of run.events) {
        if (event.type === 'COPIED') current.copiedCount += 1;
        if (event.type === 'POSTED') current.postedCount += 1;
        if (event.occurredAt > current.lastActivityAt) current.lastActivityAt = event.occurredAt;
      }
      summary.set(key, current);
    }
    return [...summary.values()]
      .map(({ memberIds, ...item }) => ({ ...item, memberCount: memberIds.size }))
      .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime());
  }
}
