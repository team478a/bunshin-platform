import {
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
} from '@bunshin/application';
import {
  SOCIAL_SUPPORT_BEHAVIOR_DEFINITION,
  SOCIAL_SUPPORT_COMPARISON_DAYS,
} from '@bunshin/capability-social';
import { sameImprovementScope, type ImprovementScope } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';

const span = SOCIAL_SUPPORT_COMPARISON_DAYS * 86_400_000;
const eventLimit = 10_000;
const validDate = (date: Date | null): date is Date =>
  date instanceof Date && Number.isFinite(date.getTime());
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid support behavior source');
}

/** Existing support/decision/report records only. No new event ledger or external calls. */
export class PrismaSocialSupportBehaviorAdapter implements ImprovementObservationAdapter {
  readonly definition = SOCIAL_SUPPORT_BEHAVIOR_DEFINITION;
  private readonly scope: ImprovementScope;
  constructor(
    private readonly client: PrismaClient,
    scope: ImprovementScope,
    private readonly now = () => new Date(),
  ) {
    this.scope = { ...scope };
  }
  async readObservations(input: ImprovementReadRequest) {
    validateImprovementReadRequest(input);
    const request = structuredClone(input);
    const readAt = new Date(this.now());
    if (
      !sameImprovementScope(request.scope, this.scope) ||
      request.scope.adapterKey !== this.definition.key ||
      request.scope.packageKey !== this.definition.packageKey
    )
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    if (!validDate(readAt)) invalid();
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
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
        const parentScope = {
          workspaceId: request.scope.workspaceId,
          groupId: request.scope.serviceId,
          ...(request.subject
            ? {
                userId: request.subject.userRef,
                ...(request.subject.bunshinRef ? { bunshinId: request.subject.bunshinRef } : {}),
              }
            : {}),
        };
        const supports = await tx.socialActivitySupportIntervention.findMany({
          where: {
            acceptedAt: { gte: request.fromInclusive, lt: request.toExclusive },
            barrierCase: parentScope,
          },
          orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }],
          take: request.limit + 1,
          select: {
            id: true,
            acceptedAt: true,
            offeredAt: true,
            completedAt: true,
            skippedAt: true,
            updatedAt: true,
            barrierCase: {
              select: {
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
        const cohort = supports.slice(0, request.limit);
        for (const row of cohort) {
          const p = row.barrierCase,
            b = p.bunshin;
          if (
            p.workspaceId !== request.scope.workspaceId ||
            p.groupId !== request.scope.serviceId ||
            b.workspaceId !== p.workspaceId ||
            b.groupId !== p.groupId ||
            b.id !== p.bunshinId ||
            b.ownerUserId !== p.userId ||
            !validDate(row.acceptedAt) ||
            row.acceptedAt < request.fromInclusive ||
            row.acceptedAt >= request.toExclusive ||
            (request.subject &&
              (p.userId !== request.subject.userRef ||
                (request.subject.bunshinRef !== null &&
                  p.bunshinId !== request.subject.bunshinRef)))
          )
            invalid();
        }
        const bunshinIds = [...new Set(cohort.map((r) => r.barrierCase.bunshinId))];
        const from = new Date(request.fromInclusive.getTime() - span),
          to = new Date(Math.min(request.toExclusive.getTime() + span, readAt.getTime()));
        const bunshin = {
          workspaceId: request.scope.workspaceId,
          groupId: request.scope.serviceId,
          id: { in: bunshinIds },
        };
        const [decisions, posts] = bunshinIds.length
          ? await Promise.all([
              tx.missionDecision.findMany({
                where: {
                  workspaceId: request.scope.workspaceId,
                  bunshinId: { in: bunshinIds },
                  decidedAt: { gte: from, lt: to },
                  bunshin,
                },
                orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
                take: eventLimit + 1,
                select: {
                  id: true,
                  workspaceId: true,
                  bunshinId: true,
                  decision: true,
                  decidedAt: true,
                  updatedAt: true,
                },
              }),
              tx.postRecord.findMany({
                where: {
                  workspaceId: request.scope.workspaceId,
                  bunshinId: { in: bunshinIds },
                  postedAt: { gte: from, lt: to },
                  bunshin,
                },
                orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
                take: eventLimit + 1,
                select: {
                  id: true,
                  workspaceId: true,
                  bunshinId: true,
                  actorUserId: true,
                  postedAt: true,
                  createdAt: true,
                },
              }),
            ])
          : [[], []];
        const owners = new Map(cohort.map((r) => [r.barrierCase.bunshinId, r.barrierCase.userId]));
        for (const d of decisions)
          if (
            d.workspaceId !== request.scope.workspaceId ||
            !owners.has(d.bunshinId) ||
            !validDate(d.decidedAt) ||
            !validDate(d.updatedAt)
          )
            invalid();
        for (const p of posts)
          if (
            p.workspaceId !== request.scope.workspaceId ||
            owners.get(p.bunshinId) !== p.actorUserId ||
            !validDate(p.postedAt) ||
            !validDate(p.createdAt)
          )
            invalid();
        const truncated =
          supports.length > request.limit ||
          decisions.length > eventLimit ||
          posts.length > eventLimit;
        const observations = cohort.map((row) => {
          const anchor = row.acceptedAt!,
            before = new Date(anchor.getTime() - span),
            after = new Date(anchor.getTime() + span);
          const inPeriod = (d: Date, lo: Date, hi: Date) => d >= lo && d < hi;
          const ownDecisions = decisions.filter((d) => d.bunshinId === row.barrierCase.bunshinId);
          const ownPosts = posts.filter((p) => p.bunshinId === row.barrierCase.bunshinId);
          const accepted = (lo: Date, hi: Date) =>
            ownDecisions.some(
              (d) =>
                d.decision === 'ACCEPTED' &&
                inPeriod(d.decidedAt!, lo, hi) &&
                d.updatedAt >= d.decidedAt! &&
                d.updatedAt < hi,
            );
          const posted = (lo: Date, hi: Date) =>
            ownPosts.some(
              (p) =>
                inPeriod(p.postedAt, lo, hi) &&
                inPeriod(p.createdAt, lo, hi) &&
                p.postedAt <= p.createdAt,
            );
          const flags = [
            accepted(before, anchor),
            accepted(anchor, after),
            posted(before, anchor),
            posted(anchor, after),
          ];
          const uncertain =
            after > readAt ||
            !validDate(row.offeredAt) ||
            !validDate(row.updatedAt) ||
            anchor < row.offeredAt ||
            row.updatedAt < anchor ||
            [row.completedAt, row.skippedAt].some(
              (d) => d !== null && (!validDate(d) || d < anchor),
            ) ||
            (row.completedAt !== null && row.skippedAt !== null) ||
            ownDecisions.some(
              (d) =>
                inPeriod(d.decidedAt!, before, after) &&
                (d.updatedAt < d.decidedAt! ||
                  d.updatedAt >= (d.decidedAt! < anchor ? anchor : after)),
            ) ||
            ownPosts.some(
              (p) =>
                inPeriod(p.postedAt, before, after) &&
                (p.postedAt > p.createdAt ||
                  !inPeriod(
                    p.createdAt,
                    p.postedAt < anchor ? before : anchor,
                    p.postedAt < anchor ? anchor : after,
                  )),
            );
          return {
            scope: request.scope,
            source: {
              kind: 'SUPPORT_INTERVENTION',
              id: row.id,
              revision: row.updatedAt.toISOString(),
            },
            occurredAt: anchor,
            feature: 'BARRIER_SUPPORT',
            action: 'COMPARE',
            eventType: 'PAIRED_BEHAVIOR',
            status: 'RECORDED',
            category: 'SERVICE_SPECIFIC' as const,
            purpose: 'USER_SUCCESS' as const,
            subtype: 'SUPPORT_BEHAVIOR',
            errorCode: null,
            correlation: { kind: 'EXPLICIT_REFERENCE' as const, key: row.id },
            releaseSha: null,
            userRef: row.barrierCase.userId,
            bunshinRef: row.barrierCase.bunshinId,
            entityRef: row.id,
            metadata: {
              beforeAccepted: flags[0]!,
              afterAccepted: flags[1]!,
              beforePosted: flags[2]!,
              afterPosted: flags[3]!,
              uncertain,
              pattern: `P${flags.reduce((sum, flag, i) => sum + (flag ? 2 ** i : 0), 0)}`,
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
}
