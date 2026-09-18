import type { ResaleItemRecord, ResaleItemRepository } from '@bunshin/capability-resale';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

type ScopeInput = {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  programEnrollmentId: string;
};

async function enrollmentAccess(
  db: Db,
  input: ScopeInput,
  statuses: Array<'ACTIVE' | 'COMPLETED' | 'EXPIRED'>,
) {
  const [enrollment, actor] = await Promise.all([
    db.programEnrollment.findFirst({
      where: {
        id: input.programEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: { in: statuses },
      },
    }),
    db.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
      },
    }),
  ]);
  if (!enrollment || !actor) return null;
  const manager = ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(actor.serviceRole);
  if (!manager && enrollment.groupMembershipId !== actor.id) return null;
  return enrollment;
}

function record(row: {
  id: string;
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  groupMembershipId: string;
  ownerUserId: string;
  title: string;
  status: ResaleItemRecord['status'];
  reactionState: ResaleItemRecord['reactionState'];
  foundAt: Date;
  listedAt: Date | null;
  reactionObservedAt: Date | null;
  lastImprovementType: string | null;
  lastImprovedAt: Date | null;
  soldAt: Date | null;
  soldPriceYen: number | null;
  shippedAt: Date | null;
  reevaluateAt: Date | null;
  archivedAt: Date | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}): ResaleItemRecord {
  return row;
}

export class PrismaResaleItemRepository implements ResaleItemRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: Parameters<ResaleItemRepository['create']>[0]) {
    try {
      return await this.db.$transaction(async (tx) => {
        const enrollment = await enrollmentAccess(tx, input, ['ACTIVE']);
        if (!enrollment) return null;
        const owner = await tx.groupMembership.findFirst({
          where: {
            id: enrollment.groupMembershipId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            status: 'ACTIVE',
          },
        });
        if (!owner) return null;
        const unique = {
          workspaceId_groupId_programEnrollmentId_idempotencyKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            idempotencyKey: input.idempotencyKey,
          },
        } as const;
        const existing = await tx.resaleItem.findUnique({ where: unique });
        if (existing) {
          if (
            existing.title !== input.title ||
            existing.foundAt.getTime() !== input.foundAt.getTime()
          ) {
            return null;
          }
          return { item: record(existing), created: false };
        }
        const created = await tx.resaleItem.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            groupMembershipId: owner.id,
            ownerUserId: owner.userId,
            idempotencyKey: input.idempotencyKey,
            title: input.title,
            foundAt: input.foundAt,
          },
        });
        return { item: record(created), created: true };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const enrollment = await enrollmentAccess(this.db, input, ['ACTIVE']);
      if (!enrollment) return null;
      const concurrent = await this.db.resaleItem.findUnique({
        where: {
          workspaceId_groupId_programEnrollmentId_idempotencyKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: enrollment.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (
        !concurrent ||
        concurrent.title !== input.title ||
        concurrent.foundAt.getTime() !== input.foundAt.getTime()
      ) {
        return null;
      }
      return { item: record(concurrent), created: false };
    }
  }

  async find(input: Parameters<ResaleItemRepository['find']>[0]) {
    const enrollment = await enrollmentAccess(this.db, input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!enrollment) return null;
    const item = await this.db.resaleItem.findFirst({
      where: {
        id: input.itemId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: enrollment.id,
      },
    });
    return item ? record(item) : null;
  }

  async list(input: Parameters<ResaleItemRepository['list']>[0]) {
    const enrollment = await enrollmentAccess(this.db, input, ['ACTIVE', 'COMPLETED', 'EXPIRED']);
    if (!enrollment) return null;
    const items = await this.db.resaleItem.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: enrollment.id,
        ...(input.includeArchived ? {} : { status: { not: 'ARCHIVED' as const } }),
      },
      orderBy: [{ foundAt: 'asc' }, { id: 'asc' }],
    });
    return items.map(record);
  }

  async update(input: Parameters<ResaleItemRepository['update']>[0]) {
    return this.db.$transaction(async (tx) => {
      const enrollment = await enrollmentAccess(tx, input, ['ACTIVE']);
      if (!enrollment) return null;
      const updated = await tx.resaleItem.updateMany({
        where: {
          id: input.itemId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          programEnrollmentId: enrollment.id,
          revision: input.expectedRevision,
        },
        data: {
          title: input.title,
          status: input.state.status,
          reactionState: input.state.reactionState,
          listedAt: input.state.listedAt,
          reactionObservedAt: input.state.reactionObservedAt,
          lastImprovementType: input.state.lastImprovementType,
          lastImprovedAt: input.state.lastImprovedAt,
          soldAt: input.state.soldAt,
          soldPriceYen: input.state.soldPriceYen,
          shippedAt: input.state.shippedAt,
          reevaluateAt: input.state.reevaluateAt,
          archivedAt: input.state.archivedAt,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      const item = await tx.resaleItem.findUniqueOrThrow({ where: { id: input.itemId } });
      return record(item);
    });
  }
}
