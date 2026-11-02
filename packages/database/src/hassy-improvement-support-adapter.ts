import {
  CollectImprovementObservations,
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
} from '@bunshin/application';
import {
  SOCIAL_SUPPORT_EXPOSURE_DEFINITION,
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

  readObservations(input: ImprovementReadRequest) {
    return this.read(input, false).then((result) => result.outcomes);
  }
  readExposureObservations(input: ImprovementReadRequest) {
    return this.read(input, true).then((result) => result.exposure);
  }
  /** Request-local composition can reuse one authorized source snapshot for both projections. */
  readPairedObservations(input: ImprovementReadRequest) {
    return this.read(input, false);
  }
  private async read(input: ImprovementReadRequest, exposure: boolean) {
    input = structuredClone(input);
    const definition = exposure ? SOCIAL_SUPPORT_EXPOSURE_DEFINITION : this.definition;
    // Use the common validation before any DB read, including calls outside the collector.
    validateImprovementReadRequest(input);
    if (
      !sameImprovementScope(input.scope, this.configuredScope) ||
      input.scope.adapterKey !== definition.key ||
      input.scope.packageKey !== definition.packageKey
    )
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
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
            firstDisplayedAt: true,
            firstDetailsViewedAt: true,
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
        const pairs = rows.slice(0, input.limit).map((row) => {
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
          const firstDisplayedAt = row.firstDisplayedAt ?? null;
          const firstDetailsViewedAt = row.firstDetailsViewedAt ?? null;
          const trackingKnown =
            row.definitionSnapshot !== null &&
            typeof row.definitionSnapshot === 'object' &&
            !Array.isArray(row.definitionSnapshot) &&
            row.definitionSnapshot['exposureTracking'] ===
              SOCIAL_SUPPORT_EXPOSURE_DEFINITION.version;
          const exposureUncertain =
            !trackingKnown ||
            (firstDisplayedAt !== null && firstDisplayedAt < row.offeredAt) ||
            (firstDetailsViewedAt !== null &&
              (firstDisplayedAt === null || firstDetailsViewedAt < firstDisplayedAt));
          const displayed = byCutoff(firstDisplayedAt),
            detailsViewed = byCutoff(firstDetailsViewedAt);
          const observation = {
            scope: { ...input.scope, adapterKey: HASSY_SUPPORT_IMPROVEMENT_DEFINITION.key },
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
          return {
            outcomes: observation,
            exposure: {
              ...observation,
              scope: { ...input.scope, adapterKey: SOCIAL_SUPPORT_EXPOSURE_DEFINITION.key },
              eventType: 'SUPPORT_EXPOSURE',
              subtype: 'SUPPORT_EXPOSURE',
              metadata: {
                displayedByCutoff: displayed,
                detailsViewedByCutoff: detailsViewed,
                uncertain: exposureUncertain,
                pattern: `P${Number(displayed) + Number(detailsViewed) * 2}`,
              },
            },
          };
        });
        const coverage = {
          completeness: truncated ? ('PARTIAL' as const) : ('COMPLETE' as const),
          missingCount: truncated ? null : 0,
          truncated,
        };
        return {
          outcomes: { observations: pairs.map((pair) => pair.outcomes), coverage: { ...coverage } },
          exposure: { observations: pairs.map((pair) => pair.exposure), coverage: { ...coverage } },
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
