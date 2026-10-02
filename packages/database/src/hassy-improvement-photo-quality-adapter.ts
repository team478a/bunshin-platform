import {
  CollectImprovementObservations,
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
} from '@bunshin/application';
import {
  HASSY_PHOTO_QUALITY_DEFINITION,
  projectHassyPhotoQuality,
  summarizeHassyPhotoQuality,
} from '@bunshin/capability-social';
import { sameImprovementScope, type ImprovementScope } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';

/** Separate service-admin read; the existing owner-only listQualityAudits contract is unchanged. */
export class PrismaHassyPhotoQualityImprovementAdapter implements ImprovementObservationAdapter {
  readonly definition = HASSY_PHOTO_QUALITY_DEFINITION;
  constructor(
    private readonly client: PrismaClient,
    private readonly configuredScope: ImprovementScope,
  ) {}
  async readObservations(input: ImprovementReadRequest) {
    validateImprovementReadRequest(input);
    if (
      input.scope.adapterKey !== this.definition.key ||
      input.scope.packageKey !== this.definition.packageKey ||
      !sameImprovementScope(input.scope, this.configuredScope)
    )
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
        const rows = await tx.missionContentVariantGeneration.findMany({
          where: {
            workspaceId: input.scope.workspaceId,
            createdAt: { gte: input.fromInclusive, lt: input.toExclusive },
            dailyMission: {
              workspaceId: input.scope.workspaceId,
              bunshin: {
                workspaceId: input.scope.workspaceId,
                groupId: input.scope.serviceId,
                ...(input.subject
                  ? {
                      ownerUserId: input.subject.userRef,
                      ...(input.subject.bunshinRef ? { id: input.subject.bunshinRef } : {}),
                    }
                  : {}),
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: input.limit + 1,
          select: {
            id: true,
            workspaceId: true,
            bunshinId: true,
            dailyMissionId: true,
            actorUserId: true,
            status: true,
            promptVersion: true,
            qualityVerdict: true,
            qualityScore: true,
            qualityIssueCodes: true,
            qualityRepairCount: true,
            createdAt: true,
            updatedAt: true,
            dailyMission: {
              select: {
                id: true,
                workspaceId: true,
                bunshinId: true,
                bunshin: {
                  select: { id: true, workspaceId: true, groupId: true, ownerUserId: true },
                },
              },
            },
            variant: {
              select: {
                id: true,
                workspaceId: true,
                bunshinId: true,
                dailyMissionId: true,
                photoFirstMetadata: {
                  select: {
                    id: true,
                    workspaceId: true,
                    bunshinId: true,
                    dailyMissionId: true,
                    actorUserId: true,
                  },
                },
              },
            },
          },
        });
        const truncated = rows.length > input.limit;
        const observations = rows.slice(0, input.limit).map((row) => {
          const mission = row.dailyMission;
          const bunshin = mission.bunshin;
          const variant = row.variant;
          const photo = variant?.photoFirstMetadata;
          if (
            row.workspaceId !== input.scope.workspaceId ||
            mission.workspaceId !== row.workspaceId ||
            mission.id !== row.dailyMissionId ||
            mission.bunshinId !== row.bunshinId ||
            bunshin.id !== row.bunshinId ||
            bunshin.workspaceId !== row.workspaceId ||
            bunshin.groupId !== input.scope.serviceId ||
            bunshin.ownerUserId !== row.actorUserId ||
            (input.subject &&
              (row.actorUserId !== input.subject.userRef ||
                (input.subject.bunshinRef !== null &&
                  row.bunshinId !== input.subject.bunshinRef))) ||
            (variant &&
              (variant.workspaceId !== row.workspaceId ||
                variant.bunshinId !== row.bunshinId ||
                variant.dailyMissionId !== row.dailyMissionId)) ||
            (photo &&
              (photo.workspaceId !== row.workspaceId ||
                photo.bunshinId !== row.bunshinId ||
                photo.dailyMissionId !== row.dailyMissionId ||
                photo.actorUserId !== row.actorUserId))
          )
            throw new ApplicationError('VALIDATION_ERROR', 'invalid improvement source scope');
          return {
            scope: input.scope,
            source: {
              kind: 'VARIANT_GENERATION',
              id: row.id,
              revision: row.updatedAt.toISOString(),
            },
            occurredAt: row.createdAt,
            feature: 'CONTENT_VARIANT_QUALITY',
            action: 'GENERATE',
            eventType: 'QUALITY_COHORT',
            status: row.status,
            category: 'AI_QUALITY' as const,
            purpose: 'PRODUCT_IMPROVEMENT' as const,
            subtype: 'CONTENT_VARIANT_QUALITY',
            errorCode: null,
            correlation: { kind: 'EXPLICIT_REFERENCE' as const, key: row.dailyMissionId },
            releaseSha: null,
            userRef: row.actorUserId,
            bunshinRef: row.bunshinId,
            entityRef: row.id,
            metadata: projectHassyPhotoQuality({
              hasPhotoMetadata: !!photo,
              status: row.status,
              verdict: row.qualityVerdict,
              score: row.qualityScore,
              issueCodes: row.qualityIssueCodes,
              repairCount: row.qualityRepairCount,
              updatedAt: row.updatedAt,
              cutoff: input.toExclusive,
              promptVersion: row.promptVersion,
            }),
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
    return summarizeHassyPhotoQuality(input, collection);
  }
}
