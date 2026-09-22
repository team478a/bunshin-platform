import type {
  BadgeAwardRecord,
  BadgeCoreRepository,
  BadgeDefinitionRecord,
  BadgeProcessingEventRecord,
  BadgeProgressRecord,
  BadgeVersionRecord,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';

const badgeDefinitionRecord = (
  row: Prisma.BadgeDefinitionGetPayload<object>,
): BadgeDefinitionRecord => ({
  id: row.id,
  ownerType: row.ownerType,
  workspaceId: row.workspaceId,
  groupId: row.groupId,
  code: row.code,
  category: row.category,
  status: row.status,
  currentVersion: row.currentVersion,
});
const badgeVersionRecord = (row: Prisma.BadgeVersionGetPayload<object>): BadgeVersionRecord => ({
  id: row.id,
  definitionId: row.definitionId,
  version: row.version,
  title: row.title,
  description: row.description,
  imageKey: row.imageKey,
  lockedImageKey: row.lockedImageKey,
  altText: row.altText,
  backgroundColor: row.backgroundColor,
  conditionType: row.conditionType,
  conditionConfig: row.conditionConfig as Record<string, unknown>,
  visibilityPolicy: row.visibilityPolicy,
  rewardPolicy: row.rewardPolicy as Record<string, unknown>,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  publishedAt: row.publishedAt,
});
const badgeProgressRecord = (row: Prisma.BadgeProgressGetPayload<object>): BadgeProgressRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  badgeVersionId: row.badgeVersionId,
  groupId: row.groupId,
  currentValue: row.currentValue,
  targetValue: row.targetValue,
  streakState: row.streakState as Record<string, unknown> | null,
  status: row.status,
  lastEventAt: row.lastEventAt,
  revision: row.revision,
});
const badgeAwardRecord = (row: Prisma.BadgeAwardGetPayload<object>): BadgeAwardRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  badgeVersionId: row.badgeVersionId,
  groupId: row.groupId,
  sourceBunshinId: row.sourceBunshinId,
  awardedAt: row.awardedAt,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  evidenceHash: row.evidenceHash,
  idempotencyKey: row.idempotencyKey,
  status: row.status,
});
const badgeProcessingEventRecord = (
  row: Prisma.BadgeProcessingEventGetPayload<object>,
): BadgeProcessingEventRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  eventType: row.eventType,
  sourceEventId: row.sourceEventId,
  status: row.status,
  failureCode: row.failureCode,
  processedAt: row.processedAt,
});

export class PrismaBadgeCoreRepository implements BadgeCoreRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private activeMember(
    tx: Prisma.TransactionClient | PrismaClient,
    workspaceId: string,
    userId: string,
  ) {
    return tx.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
  }

  private async canManageDefinition(
    tx: Prisma.TransactionClient | PrismaClient,
    input: {
      actorUserId: string;
      ownerType: 'SYSTEM' | 'GROUP';
      workspaceId: string | null;
      groupId: string | null;
    },
  ) {
    if (input.ownerType === 'SYSTEM')
      return tx.platformAdmin.findFirst({
        where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
    if (!input.workspaceId || !input.groupId) return null;
    return tx.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        role: 'MANAGER',
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
  }

  async createDefinition(input: Parameters<BadgeCoreRepository['createDefinition']>[0]) {
    if (!(await this.canManageDefinition(this.client, input))) return null;
    try {
      return badgeDefinitionRecord(
        await this.client.$transaction(async (tx) => {
          const definition = await tx.badgeDefinition.create({
            data: {
              ownerType: input.ownerType,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              code: input.code,
              category: input.category,
            },
          });
          await tx.badgeAdminAuditLog.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              badgeDefinitionId: definition.id,
              action: 'DEFINITION_CREATED',
              afterData: { code: definition.code, category: definition.category },
              reason: input.reason,
              performedByUserId: input.actorUserId,
            },
          });
          return definition;
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'badge definition already exists');
      throw error;
    }
  }

  async createVersion(input: Parameters<BadgeCoreRepository['createVersion']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const definition = await tx.badgeDefinition.findUnique({
          where: { id: input.definitionId },
        });
        if (
          !definition ||
          definition.status === 'SUPERSEDED' ||
          !(await this.canManageDefinition(tx, {
            actorUserId: input.actorUserId,
            ownerType: definition.ownerType,
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
          }))
        )
          return null;
        const version = definition.currentVersion + 1;
        const row = await tx.badgeVersion.create({
          data: {
            definitionId: definition.id,
            version,
            title: input.title,
            description: input.description,
            imageKey: input.imageKey,
            lockedImageKey: input.lockedImageKey,
            altText: input.altText,
            backgroundColor: input.backgroundColor,
            conditionType: input.conditionType,
            conditionConfig: input.conditionConfig as Prisma.InputJsonValue,
            visibilityPolicy: input.visibilityPolicy,
            rewardPolicy: input.rewardPolicy as Prisma.InputJsonValue,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
        });
        await tx.badgeDefinition.update({
          where: { id: definition.id },
          data: { currentVersion: version },
        });
        await tx.badgeAdminAuditLog.create({
          data: {
            workspaceId: definition.workspaceId,
            groupId: definition.groupId,
            badgeDefinitionId: definition.id,
            badgeVersionId: row.id,
            action: 'VERSION_CREATED',
            afterData: { version, conditionType: row.conditionType },
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return badgeVersionRecord(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async publishVersion(input: Parameters<BadgeCoreRepository['publishVersion']>[0]) {
    return this.client.$transaction(async (tx) => {
      const definition = await tx.badgeDefinition.findUnique({
        where: { id: input.definitionId },
      });
      if (definition?.ownerType === 'GROUP') return null;
      if (
        !definition ||
        !(await this.canManageDefinition(tx, {
          actorUserId: input.actorUserId,
          ownerType: definition.ownerType,
          workspaceId: definition.workspaceId,
          groupId: definition.groupId,
        }))
      )
        return null;
      const version = await tx.badgeVersion.findFirst({
        where: { id: input.badgeVersionId, definitionId: definition.id, publishedAt: null },
      });
      if (!version || version.version !== definition.currentVersion) return null;
      const row = await tx.badgeVersion.update({
        where: { id: version.id },
        data: { publishedAt: input.publishedAt },
      });
      await tx.badgeDefinition.update({
        where: { id: definition.id },
        data: { status: 'ACTIVE' },
      });
      await tx.badgeAdminAuditLog.create({
        data: {
          workspaceId: definition.workspaceId,
          groupId: definition.groupId,
          badgeDefinitionId: definition.id,
          badgeVersionId: row.id,
          action: 'VERSION_PUBLISHED',
          afterData: { version: row.version, publishedAt: input.publishedAt.toISOString() },
          reason: input.reason,
          performedByUserId: input.actorUserId,
        },
      });
      return badgeVersionRecord(row);
    });
  }

  private async eligibleVersion(
    tx: Prisma.TransactionClient | PrismaClient,
    input: { workspaceId: string; userId: string; badgeVersionId: string; groupId: string | null },
  ) {
    if (!(await this.activeMember(tx, input.workspaceId, input.userId))) return null;
    const version = await tx.badgeVersion.findFirst({
      where: {
        id: input.badgeVersionId,
        publishedAt: { not: null },
      },
    });
    if (!version) return null;
    const definition = await tx.badgeDefinition.findFirst({
      where: {
        id: version.definitionId,
        status: 'ACTIVE',
        OR: [
          { ownerType: 'SYSTEM', workspaceId: null, groupId: null },
          {
            ownerType: 'GROUP',
            workspaceId: input.workspaceId,
            groupId: input.groupId,
          },
        ],
      },
    });
    if (!definition) return null;
    if (definition.ownerType === 'GROUP') {
      const member = await tx.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: definition.groupId!,
          userId: input.userId,
          status: 'ACTIVE',
          group: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!member || input.groupId !== definition.groupId) return null;
    } else if (input.groupId !== null) return null;
    return version;
  }

  async saveProgress(input: Parameters<BadgeCoreRepository['saveProgress']>[0]) {
    if (!(await this.eligibleVersion(this.client, input))) return null;
    return badgeProgressRecord(
      await this.client.badgeProgress.upsert({
        where: {
          workspaceId_userId_badgeVersionId: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            badgeVersionId: input.badgeVersionId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          badgeVersionId: input.badgeVersionId,
          groupId: input.groupId,
          currentValue: input.currentValue,
          targetValue: input.targetValue,
          streakState:
            input.streakState === null
              ? Prisma.JsonNull
              : (input.streakState as Prisma.InputJsonValue),
          status: input.status,
          lastEventAt: input.lastEventAt,
        },
        update: {
          currentValue: input.currentValue,
          targetValue: input.targetValue,
          streakState:
            input.streakState === null
              ? Prisma.JsonNull
              : (input.streakState as Prisma.InputJsonValue),
          status: input.status,
          lastEventAt: input.lastEventAt,
          revision: { increment: 1 },
        },
      }),
    );
  }

  async award(input: Parameters<BadgeCoreRepository['award']>[0]) {
    if (!(await this.eligibleVersion(this.client, input))) return null;
    if (input.sourceBunshinId) {
      const bunshin = await this.client.bunshin.findFirst({
        where: {
          id: input.sourceBunshinId,
          workspaceId: input.workspaceId,
          ownerUserId: input.userId,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
      });
      if (!bunshin) return null;
    }
    return this.client.$transaction(async (tx) => {
      const existing = await tx.badgeAward.findFirst({
        where: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          OR: [{ idempotencyKey: input.idempotencyKey }, { badgeVersionId: input.badgeVersionId }],
        },
      });
      if (existing) {
        if (
          existing.badgeVersionId !== input.badgeVersionId ||
          existing.sourceType !== input.sourceType ||
          existing.sourceId !== input.sourceId ||
          existing.evidenceHash !== input.evidenceHash
        )
          throw new ApplicationError('CONFLICT', 'badge award idempotency mismatch');
        return badgeAwardRecord(existing);
      }
      const row = await tx.badgeAward.create({ data: input });
      await tx.badgeProgress.upsert({
        where: {
          workspaceId_userId_badgeVersionId: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            badgeVersionId: input.badgeVersionId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          badgeVersionId: input.badgeVersionId,
          groupId: input.groupId,
          currentValue: 1,
          targetValue: 1,
          status: 'AWARDED',
          lastEventAt: input.awardedAt,
        },
        update: { status: 'AWARDED', lastEventAt: input.awardedAt, revision: { increment: 1 } },
      });
      return badgeAwardRecord(row);
    });
  }

  async recordProcessingEvent(input: Parameters<BadgeCoreRepository['recordProcessingEvent']>[0]) {
    if (!(await this.activeMember(this.client, input.workspaceId, input.userId))) return null;
    const existing = await this.client.badgeProcessingEvent.findUnique({
      where: {
        workspaceId_eventType_sourceEventId: {
          workspaceId: input.workspaceId,
          eventType: input.eventType,
          sourceEventId: input.sourceEventId,
        },
      },
    });
    if (existing && existing.userId !== input.userId)
      throw new ApplicationError('CONFLICT', 'badge event scope mismatch');
    return badgeProcessingEventRecord(
      await this.client.badgeProcessingEvent.upsert({
        where: {
          workspaceId_eventType_sourceEventId: {
            workspaceId: input.workspaceId,
            eventType: input.eventType,
            sourceEventId: input.sourceEventId,
          },
        },
        create: input,
        update: {
          status: input.status,
          failureCode: input.failureCode,
          processedAt: input.processedAt,
        },
      }),
    );
  }
}
