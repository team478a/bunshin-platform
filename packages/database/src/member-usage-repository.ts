import type {
  MemberUsageAuthorizationPort,
  MemberUsageRequest,
  MemberUsageSourceRepository,
  MemberUsageSources,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { latestServiceLegalDocuments } from './service-legal-latest';

export const MEMBER_USAGE_SOURCE_LIMIT = 10_000;
const transactionOptions = {
  isolationLevel: 'RepeatableRead' as const,
  maxWait: 3_000,
  timeout: 20_000,
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function snapshot(input: MemberUsageRequest) {
  const request = {
    actorUserId: input.actorUserId,
    timezone: input.timezone,
    asOf: new Date(input.asOf),
    scope: {
      workspaceId: input.scope.workspaceId,
      serviceId: input.scope.serviceId,
      groupMembershipId: input.scope.groupMembershipId,
      userId: input.scope.userId,
      bunshinId: input.scope.bunshinId,
    },
  };
  if (
    !uuid.test(request.actorUserId) ||
    Object.values(request.scope).some((id) => !uuid.test(id)) ||
    !Number.isFinite(request.asOf.getTime())
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member usage request');
  return request;
}

/** Read-only adapter. The injected client must belong to the application's current environment. */
export class PrismaMemberUsageRepository
  implements MemberUsageAuthorizationPort, MemberUsageSourceRepository
{
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
  ) {}

  private async permitted(tx: Prisma.TransactionClient, request: MemberUsageRequest) {
    if (request.actorUserId !== request.scope.userId) return false;
    const scope = request.scope;
    const now = this.now();
    const member = await tx.groupMembership.findFirst({
      where: {
        id: scope.groupMembershipId,
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        userId: scope.userId,
        status: 'ACTIVE',
        consentedAt: { lte: now },
        user: { status: 'ACTIVE' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: scope.userId, status: 'ACTIVE' } },
        },
        group: {
          workspaceId: scope.workspaceId,
          status: 'ACTIVE',
          serviceConfiguration: {
            is: {
              workspaceId: scope.workspaceId,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ],
            },
          },
        },
      },
      select: { id: true },
    });
    if (!member) return false;
    const bunshin = await tx.bunshin.findFirst({
      where: {
        id: scope.bunshinId,
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        ownerUserId: scope.userId,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
    if (!bunshin) return false;
    const required = latestServiceLegalDocuments(
      await tx.serviceLegalDocument.findMany({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          status: 'PUBLISHED',
          effectiveAt: { lte: now },
        },
        select: { id: true, type: true, version: true },
      }),
    ).map((row) => row.id);
    if (!required.length) return true;
    return (
      (await tx.serviceLegalConsent.count({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          groupMembershipId: scope.groupMembershipId,
          userId: scope.userId,
          legalDocumentId: { in: required },
          consentedAt: { lte: now },
        },
      })) === required.length
    );
  }

  authorize(input: MemberUsageRequest): Promise<boolean> {
    const request = snapshot(input);
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return this.permitted(tx, request);
    }, transactionOptions);
  }

  read(input: MemberUsageRequest): Promise<MemberUsageSources | null> {
    const request = snapshot(input);
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      if (!(await this.permitted(tx, request))) return null;
      const scope = request.scope;
      const owned = {
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        actorUserId: scope.userId,
      };
      const mission = { workspaceId: scope.workspaceId, bunshinId: scope.bunshinId };
      const take = MEMBER_USAGE_SOURCE_LIMIT + 1;
      const [claims, variants, activities, decisions, posts, costs, selections] = await Promise.all(
        [
          tx.dailyMissionGeneration.findMany({
            where: {
              ...owned,
              status: 'COMPLETED',
              updatedAt: { lte: request.asOf },
              dailyMissionId: { not: null },
            },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, dailyMissionId: true, updatedAt: true, generationTrigger: true },
          }),
          tx.missionContentVariant.findMany({
            where: {
              ...owned,
              createdAt: { lte: request.asOf },
              dailyMission: mission,
              OR: [
                { generation: { is: null } },
                {
                  generation: {
                    is: { ...owned, status: 'SUCCEEDED', updatedAt: { lte: request.asOf } },
                  },
                },
              ],
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
            select: {
              id: true,
              createdAt: true,
              generation: { select: { updatedAt: true, generationTrigger: true } },
            },
          }),
          tx.missionActivity.findMany({
            where: { ...owned, occurredAt: { lte: request.asOf }, dailyMission: mission },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, dailyMissionId: true, type: true, occurredAt: true },
          }),
          tx.missionDecision.findMany({
            where: {
              ...mission,
              decision: { in: ['ACCEPTED', 'REJECTED'] },
              dailyMission: mission,
              OR: [{ decidedAt: { lte: request.asOf } }, { decidedAt: null }],
            },
            orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, dailyMissionId: true, decision: true, decidedAt: true },
          }),
          tx.postRecord.findMany({
            where: {
              ...owned,
              source: 'MANUAL',
              createdAt: { lte: request.asOf },
              dailyMission: mission,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, dailyMissionId: true, createdAt: true },
          }),
          tx.aiUsageEvent.findMany({
            where: { ...owned, occurredAt: { lte: request.asOf } },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, occurredAt: true, estimatedCostUsdMicros: true },
          }),
          tx.missionContentVariantSelection.findMany({
            where: {
              ...owned,
              selectedAt: { lte: request.asOf },
              dailyMission: mission,
              variant: owned,
            },
            orderBy: [{ selectedAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, dailyMissionId: true, selectedAt: true },
          }),
        ],
      );
      // Claims have no Mission FK; never trust their embedded ID without an owner-scoped join.
      const validMissions = new Set(
        (
          await tx.dailyMission.findMany({
            where: {
              ...mission,
              id: { in: claims.flatMap((row) => (row.dailyMissionId ? [row.dailyMissionId] : [])) },
              createdAt: { lte: request.asOf },
            },
            select: { id: true },
          })
        ).map((row) => row.id),
      );
      const record = (id: string, occurredAt: Date) => ({ id, occurredAt, scope: { ...scope } });
      const primary = new Map<string, MemberUsageSources['generations'][number]>();
      for (const row of claims) {
        if (
          row.dailyMissionId &&
          validMissions.has(row.dailyMissionId) &&
          !primary.has(row.dailyMissionId)
        )
          primary.set(row.dailyMissionId, {
            ...record(`mission:${row.dailyMissionId}`, row.updatedAt),
            status: 'SUCCESS',
            trigger: row.generationTrigger as MemberUsageSources['generations'][number]['trigger'],
          });
      }
      const bounded = [claims, variants, activities, decisions, posts, costs, selections].some(
        (rows) => rows.length > MEMBER_USAGE_SOURCE_LIMIT,
      );
      const missingDecisionTime = decisions.some((row) => row.decidedAt === null);
      return {
        scope: { ...scope },
        completeness: bounded || missingDecisionTime ? 'PARTIAL' : 'COMPLETE',
        generations: [
          ...primary.values(),
          ...variants.map((row) => ({
            ...record(`variant:${row.id}`, row.generation?.updatedAt ?? row.createdAt),
            status: 'SUCCESS' as const,
            trigger: (row.generation?.generationTrigger ??
              'UNKNOWN') as MemberUsageSources['generations'][number]['trigger'],
          })),
        ],
        activities: [
          ...activities.map((row) => ({
            ...record(`activity:${row.id}`, row.occurredAt),
            dailyMissionId: row.dailyMissionId,
            type: row.type,
          })),
          ...selections.map((row) => ({
            ...record(`selection:${row.id}`, row.selectedAt),
            dailyMissionId: row.dailyMissionId,
            type: 'ACCEPTED',
          })),
        ],
        decisions: decisions.flatMap((row) =>
          row.decidedAt && (row.decision === 'ACCEPTED' || row.decision === 'REJECTED')
            ? [
                {
                  ...record(`decision:${row.id}`, row.decidedAt),
                  dailyMissionId: row.dailyMissionId,
                  decision: row.decision,
                },
              ]
            : [],
        ),
        postRecords: posts.map((row) => ({
          ...record(`post:${row.id}`, row.createdAt),
          dailyMissionId: row.dailyMissionId,
        })),
        aiUsage: costs.map((row) => ({
          ...record(`usage:${row.id}`, row.occurredAt),
          estimatedCostUsdMicros: row.estimatedCostUsdMicros,
        })),
      };
    }, transactionOptions);
  }
}
