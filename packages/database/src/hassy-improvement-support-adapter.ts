import {
  CollectImprovementObservations,
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
} from '@bunshin/application';
import {
  HASSY_SUPPORT_IMPROVEMENT_DEFINITION,
  supportGoalAtOffer,
  summarizeHassySupportOutcomes,
} from '@bunshin/capability-social';
import { sameImprovementScope, type ImprovementScope } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';

/** Scope is resolved by trusted composition, not a client-supplied tenant/brand name. No HTTP binding yet. */
export class PrismaHassySupportImprovementAdapter implements ImprovementObservationAdapter {
  readonly definition = HASSY_SUPPORT_IMPROVEMENT_DEFINITION;
  constructor(
    private readonly client: PrismaClient,
    private readonly configuredScope: ImprovementScope,
  ) {}

  async readObservations(input: ImprovementReadRequest) {
    // Use the common validation before any DB read, including calls outside the collector.
    validateImprovementReadRequest(input);
    if (!sameImprovementScope(input.scope, this.configuredScope))
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    return this.client.$transaction(
      async (tx) => {
        const manager = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.serviceId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!manager) throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
        const rows = await tx.socialActivitySupportIntervention.findMany({
          where: {
            offeredAt: { gte: input.fromInclusive, lt: input.toExclusive },
            barrierCase: {
              workspaceId: input.scope.workspaceId,
              groupId: input.scope.serviceId,
              ...(input.subject
                ? {
                    userId: input.subject.userRef,
                    ...(input.subject.bunshinRef ? { bunshinId: input.subject.bunshinRef } : {}),
                  }
                : {}),
            },
          },
          orderBy: [{ offeredAt: 'asc' }, { id: 'asc' }],
          take: input.limit + 1,
          select: {
            id: true,
            status: true,
            definitionSnapshot: true,
            offeredAt: true,
            acceptedAt: true,
            completedAt: true,
            skippedAt: true,
            updatedAt: true,
            barrierCase: {
              select: {
                id: true,
                workspaceId: true,
                groupId: true,
                userId: true,
                bunshinId: true,
                bunshin: {
                  select: { id: true, workspaceId: true, groupId: true, ownerUserId: true },
                },
              },
            },
          },
        });
        const truncated = rows.length > input.limit;
        const observations = rows.slice(0, input.limit).map((row) => {
          const parent = row.barrierCase;
          if (
            parent.workspaceId !== input.scope.workspaceId ||
            parent.groupId !== input.scope.serviceId ||
            parent.bunshin.id !== parent.bunshinId ||
            parent.bunshin.workspaceId !== parent.workspaceId ||
            parent.bunshin.groupId !== parent.groupId ||
            parent.bunshin.ownerUserId !== parent.userId ||
            (input.subject &&
              (parent.userId !== input.subject.userRef ||
                (input.subject.bunshinRef !== null &&
                  parent.bunshinId !== input.subject.bunshinRef)))
          )
            throw new ApplicationError('VALIDATION_ERROR', 'invalid improvement source scope');
          const byCutoff = (date: Date | null) =>
            date !== null && date >= row.offeredAt && date < input.toExclusive;
          const inconsistent =
            [row.acceptedAt, row.completedAt, row.skippedAt].some(
              (date) => date !== null && date < row.offeredAt,
            ) ||
            (row.completedAt !== null && row.skippedAt !== null) ||
            (row.acceptedAt !== null &&
              row.completedAt !== null &&
              row.acceptedAt > row.completedAt);
          const timestampMissing =
            inconsistent ||
            (row.status === 'ACCEPTED' && row.acceptedAt === null) ||
            (row.status === 'COMPLETED' && row.completedAt === null) ||
            (row.status === 'SKIPPED' && row.skippedAt === null);
          return {
            scope: input.scope,
            source: {
              kind: 'SUPPORT_INTERVENTION',
              id: row.id,
              revision: row.updatedAt.toISOString(),
            },
            occurredAt: row.offeredAt,
            feature: 'BARRIER_SUPPORT',
            action: 'OFFER',
            eventType: 'SUPPORT_COHORT',
            status: row.status,
            category: 'SERVICE_SPECIFIC' as const,
            purpose: 'USER_SUCCESS' as const,
            subtype: 'BARRIER_SUPPORT',
            errorCode: null,
            correlation: { kind: 'EXPLICIT_REFERENCE' as const, key: parent.id },
            releaseSha: null,
            userRef: parent.userId,
            bunshinRef: parent.bunshinId,
            entityRef: row.id,
            metadata: {
              ...supportGoalAtOffer(row.definitionSnapshot),
              acceptedByCutoff: byCutoff(row.acceptedAt),
              completedByCutoff: byCutoff(row.completedAt),
              skippedByCutoff: byCutoff(row.skippedAt),
              timestampMissing,
            },
          };
        });
        return {
          observations,
          coverage: {
            completeness: truncated ? ('PARTIAL' as const) : ('COMPLETE' as const),
            missingCount: truncated ? null : 0,
            truncated,
          },
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }

  async summarize(input: ImprovementReadRequest) {
    const collection = await new CollectImprovementObservations(
      {
        authorize: (request) =>
          Promise.resolve(sameImprovementScope(request.scope, this.configuredScope)),
      },
      this,
    ).execute(input);
    return {
      coverage: collection.coverage,
      buckets: summarizeHassySupportOutcomes(input, collection),
    };
  }
}
