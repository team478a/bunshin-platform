import {
  CollectImprovementObservations,
  validateImprovementReadRequest,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION,
  projectImprovementFeedbackObservation,
  summarizeImprovementFeedback,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
} from '@bunshin/application';
import { sameImprovementScope, type ImprovementScope } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';

function snapshotRequest(input: ImprovementReadRequest): ImprovementReadRequest {
  validateImprovementReadRequest(input);
  return {
    ...input,
    scope: { ...input.scope },
    subject: input.subject ? { ...input.subject } : null,
    fromInclusive: new Date(input.fromInclusive),
    toExclusive: new Date(input.toExclusive),
  };
}

/** Internal read only. This grants neither a public API nor cross-service operator access. */
export class PrismaImprovementFeedbackObservationAdapter implements ImprovementObservationAdapter {
  readonly definition = IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION;
  private readonly configuredScope: ImprovementScope;
  constructor(
    private readonly client: PrismaClient,
    configuredScope: ImprovementScope,
  ) {
    this.configuredScope = { ...configuredScope };
  }
  async readObservations(input: ImprovementReadRequest) {
    const request = snapshotRequest(input);
    if (
      request.scope.adapterKey !== this.definition.key ||
      request.scope.packageKey !== this.definition.packageKey ||
      !sameImprovementScope(request.scope, this.configuredScope)
    )
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    return this.client.$transaction(
      async (tx) => {
        const manager = await tx.groupMembership.findFirst({
          where: {
            workspaceId: request.scope.workspaceId,
            groupId: request.scope.serviceId,
            userId: request.actorUserId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
            group: {
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
              serviceConfiguration: { isNot: null },
            },
          },
          select: { id: true },
        });
        if (!manager) throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
        const rows = await tx.improvementFeedback.findMany({
          where: {
            workspaceId: request.scope.workspaceId,
            serviceId: request.scope.serviceId,
            packageKey: request.scope.packageKey,
            createdAt: { gte: request.fromInclusive, lt: request.toExclusive },
            ...(request.subject
              ? {
                  actorUserId: request.subject.userRef,
                  ...(request.subject.bunshinRef !== null
                    ? { bunshinId: request.subject.bunshinRef }
                    : {}),
                }
              : {}),
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: request.limit + 1,
          select: {
            id: true,
            workspaceId: true,
            serviceId: true,
            packageKey: true,
            actorUserId: true,
            bunshinId: true,
            createdAt: true,
            category: true,
            surface: true,
            impact: true,
            bunshin: { select: { id: true, workspaceId: true, groupId: true, ownerUserId: true } },
          },
        });
        const truncated = rows.length > request.limit;
        const observations = rows.slice(0, request.limit).map((row) => {
          if (
            row.workspaceId !== request.scope.workspaceId ||
            row.serviceId !== request.scope.serviceId ||
            row.packageKey !== request.scope.packageKey ||
            row.bunshin.id !== row.bunshinId ||
            row.bunshin.workspaceId !== row.workspaceId ||
            row.bunshin.groupId !== row.serviceId ||
            row.bunshin.ownerUserId !== row.actorUserId ||
            row.createdAt < request.fromInclusive ||
            row.createdAt >= request.toExclusive ||
            (request.subject &&
              (row.actorUserId !== request.subject.userRef ||
                (request.subject.bunshinRef !== null &&
                  row.bunshinId !== request.subject.bunshinRef)))
          )
            throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback observation scope');
          return projectImprovementFeedbackObservation(request.scope, row);
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
    const request = snapshotRequest(input);
    const collection = await new CollectImprovementObservations(
      {
        authorize: (request) =>
          Promise.resolve(sameImprovementScope(request.scope, this.configuredScope)),
      },
      this,
    ).execute(request);
    return summarizeImprovementFeedback(request, collection);
  }
}
