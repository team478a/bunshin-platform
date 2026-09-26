import {
  SOCIAL_ACTIVITY_BARRIER_DISMISSAL_DAYS,
  SOCIAL_ACTIVITY_SUPPORT_RULE_VERSION,
  buildSocialActivityBarrierQuestion,
  socialActivitySupportFor,
  type SocialActivityBarrierCase,
  type SocialActivityBarrierConfirmationRepository,
  type SocialActivityBarrierEvidence,
  type SocialActivityBarrierScope,
} from '@bunshin/capability-social';
import type { Prisma, PrismaClient } from '@prisma/client';

function evidence(row: {
  evidenceCode: string;
  observationFrom: Date;
  observationTo: Date;
  eligibleDays: number;
  excludedSystemIncidentDays: number;
  metrics: Prisma.JsonValue;
  thresholds: Prisma.JsonValue;
  ruleVersion: string;
}): SocialActivityBarrierEvidence {
  return {
    evidenceCode: row.evidenceCode as SocialActivityBarrierEvidence['evidenceCode'],
    observationWindow: {
      from: row.observationFrom.toISOString(),
      to: row.observationTo.toISOString(),
      eligibleDays: row.eligibleDays,
      excludedSystemIncidentDays: row.excludedSystemIncidentDays,
    },
    metrics: row.metrics as SocialActivityBarrierEvidence['metrics'],
    thresholds: row.thresholds as SocialActivityBarrierEvidence['thresholds'],
    ruleVersion: row.ruleVersion as SocialActivityBarrierEvidence['ruleVersion'],
  };
}

function sameEvidence(left: SocialActivityBarrierEvidence, right: SocialActivityBarrierEvidence) {
  return (
    left.evidenceCode === right.evidenceCode &&
    left.observationWindow.from === right.observationWindow.from &&
    left.observationWindow.to === right.observationWindow.to
  );
}

function caseValue(
  scope: SocialActivityBarrierScope,
  row: {
    id: string;
    category: SocialActivityBarrierCase['category'];
    status: SocialActivityBarrierCase['status'];
    ruleVersion: string;
    recurrenceCount: number;
    firstDetectedAt: Date;
    lastDetectedAt: Date;
    nextEligibleAt: Date | null;
    evidenceSnapshots: Array<Parameters<typeof evidence>[0]>;
  },
): SocialActivityBarrierCase | null {
  const latest = row.evidenceSnapshots[0];
  if (!latest) return null;
  return {
    id: row.id,
    scope,
    category: row.category,
    status: row.status,
    ruleVersion: row.ruleVersion,
    recurrenceCount: row.recurrenceCount,
    firstDetectedAt: row.firstDetectedAt,
    lastDetectedAt: row.lastDetectedAt,
    nextEligibleAt: row.nextEligibleAt,
    evidence: evidence(latest),
  };
}

function scopeWhere(scope: SocialActivityBarrierScope) {
  return {
    workspaceId: scope.workspaceId,
    groupId: scope.serviceId,
    groupMembershipId: scope.groupMembershipId,
    userId: scope.userId,
    bunshinId: scope.bunshinId,
  } as const;
}

export class PrismaSocialActivityBarrierConfirmationRepository implements SocialActivityBarrierConfirmationRepository {
  constructor(private readonly client: PrismaClient) {}

  async getPendingQuestion(
    input: Parameters<SocialActivityBarrierConfirmationRepository['getPendingQuestion']>[0],
  ) {
    const rows = await this.client.socialActivityBarrierCase.findMany({
      where: { ...scopeWhere(input.scope), status: 'SUSPECTED' },
      orderBy: [{ lastDetectedAt: 'desc' }, { category: 'asc' }],
      include: { evidenceSnapshots: { orderBy: { detectedAt: 'desc' }, take: 1 } },
    });
    const cases = rows
      .map((row) => caseValue(input.scope, row))
      .filter((value): value is SocialActivityBarrierCase => value !== null);
    const first = cases[0];
    if (!first) return null;
    return buildSocialActivityBarrierQuestion(
      cases.filter((value) => sameEvidence(value.evidence, first.evidence)),
    );
  }

  async answer(input: Parameters<SocialActivityBarrierConfirmationRepository['answer']>[0]) {
    const uniqueCaseIds = [...new Set(input.caseIds)];
    if (
      uniqueCaseIds.length === 0 ||
      uniqueCaseIds.length > 5 ||
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 200 ||
      (input.selectedCaseId !== null && !uniqueCaseIds.includes(input.selectedCaseId))
    ) {
      return null;
    }

    return this.client.$transaction(async (tx) => {
      const existing = await tx.socialActivityBarrierConfirmation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { barrierCase: true },
      });
      if (existing) {
        const existingScope = existing.barrierCase;
        if (
          existingScope.workspaceId !== input.scope.workspaceId ||
          existingScope.groupId !== input.scope.serviceId ||
          existingScope.groupMembershipId !== input.scope.groupMembershipId ||
          existingScope.userId !== input.scope.userId ||
          existingScope.bunshinId !== input.scope.bunshinId
        ) {
          return null;
        }
        return {
          response: existing.response,
          support: existing.selectedCategory
            ? socialActivitySupportFor(existing.selectedCategory)
            : null,
        };
      }

      const [membership, bunshin, rows] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.serviceId,
            id: input.scope.groupMembershipId,
            userId: input.scope.userId,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
        tx.bunshin.findFirst({
          where: {
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.serviceId,
            id: input.scope.bunshinId,
            ownerUserId: input.scope.userId,
          },
          select: { id: true },
        }),
        tx.socialActivityBarrierCase.findMany({
          where: {
            ...scopeWhere(input.scope),
            id: { in: uniqueCaseIds },
            status: 'SUSPECTED',
          },
          include: { evidenceSnapshots: { orderBy: { detectedAt: 'desc' }, take: 1 } },
        }),
      ]);
      if (!membership || !bunshin || rows.length !== uniqueCaseIds.length) return null;

      const cases = rows
        .map((row) => caseValue(input.scope, row))
        .filter((value): value is SocialActivityBarrierCase => value !== null);
      if (cases.length !== uniqueCaseIds.length) return null;
      buildSocialActivityBarrierQuestion(cases);

      const selected =
        input.selectedCaseId === null
          ? null
          : (cases.find((value) => value.id === input.selectedCaseId) ?? null);
      if (input.selectedCaseId !== null && !selected) return null;

      const nextEligibleAt = new Date(input.answeredAt);
      nextEligibleAt.setUTCDate(
        nextEligibleAt.getUTCDate() + SOCIAL_ACTIVITY_BARRIER_DISMISSAL_DAYS,
      );
      const primary = selected ?? cases[0]!;

      if (selected) {
        await tx.socialActivityBarrierCase.updateMany({
          where: { ...scopeWhere(input.scope), id: selected.id, status: 'SUSPECTED' },
          data: { status: 'CONFIRMED', confirmedAt: input.answeredAt, nextEligibleAt: null },
        });
        await tx.socialActivityBarrierCase.updateMany({
          where: {
            ...scopeWhere(input.scope),
            id: { in: uniqueCaseIds.filter((id) => id !== selected.id) },
            status: 'SUSPECTED',
          },
          data: {
            status: 'DISMISSED',
            dismissedAt: input.answeredAt,
            nextEligibleAt,
          },
        });
      } else {
        await tx.socialActivityBarrierCase.updateMany({
          where: { ...scopeWhere(input.scope), id: { in: uniqueCaseIds }, status: 'SUSPECTED' },
          data: { status: 'DISMISSED', dismissedAt: input.answeredAt, nextEligibleAt },
        });
      }

      const response: 'CONFIRMED' | 'NONE_OF_THESE' = selected ? 'CONFIRMED' : 'NONE_OF_THESE';
      await tx.socialActivityBarrierConfirmation.create({
        data: {
          caseId: primary.id,
          response,
          selectedCategory: selected?.category ?? null,
          actorUserId: input.scope.userId,
          idempotencyKey: input.idempotencyKey,
          occurredAt: input.answeredAt,
        },
      });

      const support = selected ? socialActivitySupportFor(selected.category) : null;
      if (selected && support) {
        await tx.socialActivitySupportIntervention.create({
          data: {
            caseId: selected.id,
            supportKey: support.key,
            definitionSnapshot: { ...support, steps: [...support.steps] },
            ruleVersion: SOCIAL_ACTIVITY_SUPPORT_RULE_VERSION,
            idempotencyKey: `${input.idempotencyKey}:support`,
            offeredAt: input.answeredAt,
          },
        });
      }

      return { response, support };
    });
  }
}
