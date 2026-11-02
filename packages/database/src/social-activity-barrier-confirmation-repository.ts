import {
  lockRecommendationService,
  readRuntimeRecommendationPolicy,
} from './social-recommendation-policy';
import {
  recommendationEvidenceAllowed,
  socialSupportCooldownDays,
  SOCIAL_RECOMMENDATION_POLICY_VERSION,
  SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
  SOCIAL_ACTIVITY_SUPPORT_KEYS,
  SOCIAL_ACTIVITY_SUPPORT_RULE_VERSION,
  buildSocialActivityBarrierQuestion,
  readSocialActivityBarrierGoalAttribution,
  readSocialActivityBarrierGoalMetrics,
  selectSocialActivitySupport,
  type SocialActivityBarrierCase,
  type SocialActivityBarrierConfirmationRepository,
  type SocialActivityBarrierEvidence,
  type SocialActivityBarrierScope,
  type SocialActivitySupport,
  type SocialActivitySupportProgress,
} from '@bunshin/capability-social';
import type { Prisma, PrismaClient } from '@prisma/client';
import { isMemberUsageScopePermitted } from './member-usage-authorization';
import { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';

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
  const storedMetrics =
    row.metrics !== null && typeof row.metrics === 'object' && !Array.isArray(row.metrics)
      ? (row.metrics as Record<string, Prisma.JsonValue>)
      : {};
  const {
    goalAttribution: storedGoalAttribution,
    goalMetrics: storedGoalMetrics,
    ...metrics
  } = storedMetrics;
  return {
    evidenceCode: row.evidenceCode as SocialActivityBarrierEvidence['evidenceCode'],
    observationWindow: {
      from: row.observationFrom.toISOString(),
      to: row.observationTo.toISOString(),
      eligibleDays: row.eligibleDays,
      excludedSystemIncidentDays: row.excludedSystemIncidentDays,
    },
    metrics,
    goalAttribution: readSocialActivityBarrierGoalAttribution(storedGoalAttribution),
    goalMetrics: readSocialActivityBarrierGoalMetrics(storedGoalMetrics),
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

function supportProgress(row: {
  id: string;
  status: SocialActivitySupportProgress['status'];
  definitionSnapshot: Prisma.JsonValue;
}): SocialActivitySupportProgress | null {
  if (!row.definitionSnapshot || typeof row.definitionSnapshot !== 'object') return null;
  const snapshot = row.definitionSnapshot as Record<string, unknown>;
  if (
    !SOCIAL_ACTIVITY_SUPPORT_KEYS.some((key) => key === snapshot['key']) ||
    typeof snapshot['title'] !== 'string' ||
    typeof snapshot['reason'] !== 'string' ||
    !Array.isArray(snapshot['steps']) ||
    !snapshot['steps'].every((step) => typeof step === 'string')
  )
    return null;
  return {
    id: row.id,
    status: row.status,
    support: {
      key: snapshot['key'] as SocialActivitySupport['key'],
      title: snapshot['title'],
      reason: snapshot['reason'],
      steps: [...snapshot['steps']],
    },
  };
}

export class PrismaSocialActivityBarrierConfirmationRepository implements SocialActivityBarrierConfirmationRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
  ) {}

  private validScope(scope: SocialActivityBarrierScope) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'].every((key) => {
      const id = scope[key as keyof SocialActivityBarrierScope];
      return typeof id === 'string' && uuid.test(id);
    });
  }

  private async permitted(
    tx: Prisma.TransactionClient,
    scope: SocialActivityBarrierScope,
    at: Date,
    feature = true,
  ) {
    if (!this.validScope(scope) || !Number.isFinite(at.getTime())) return false;
    if (!(await isMemberUsageScopePermitted(tx, scope, at))) return false;
    const enabled = await tx.bunshin.findFirst({
      where: {
        id: scope.bunshinId,
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        ownerUserId: scope.userId,
        status: 'ACTIVE',
        capabilityAssignments: {
          some: {
            workspaceId: scope.workspaceId,
            capabilityType: 'SOCIAL',
            status: 'ACTIVE',
            activatedAt: { lte: at },
          },
        },
      },
      select: { id: true },
    });
    if (!enabled) return false;
    if (!feature) return true;
    const access = await new PrismaGroupFeatureEntitlementRepository(
      this.client,
    ).resolveAccessInTransaction(tx, {
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      actorUserId: scope.userId,
      featureKey: SOCIAL_ACTIVITY_SUPPORT_FEATURE_KEY,
      now: at,
    });
    return Boolean(access?.allowed && access.dailyLimit !== 0 && access.monthlyLimit !== 0);
  }

  private async lock(tx: Prisma.TransactionClient, scope: SocialActivityBarrierScope) {
    if (!this.validScope(scope)) return false;
    await tx.$queryRaw`SELECT id FROM bunshins WHERE id=${scope.bunshinId}::uuid AND workspace_id=${scope.workspaceId}::uuid AND group_id=${scope.serviceId}::uuid AND owner_user_id=${scope.userId}::uuid FOR UPDATE`;
    return true;
  }

  async getPendingQuestion(
    input: Parameters<SocialActivityBarrierConfirmationRepository['getPendingQuestion']>[0],
  ) {
    const scope = { ...input.scope };
    const at = this.now();
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        if (!(await this.permitted(tx, scope, at))) return null;
        const settings = (await readRuntimeRecommendationPolicy(tx, scope)).settings;
        if (!settings.enabled) return null;
        const active = await tx.socialActivitySupportIntervention.findFirst({
          where: { status: { in: ['OFFERED', 'ACCEPTED'] }, barrierCase: scopeWhere(scope) },
          select: { id: true },
        });
        if (active) return null;
        const rows = await tx.socialActivityBarrierCase.findMany({
          where: {
            ...scopeWhere(scope),
            status: 'SUSPECTED',
            category: { in: settings.categories },
            OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: at } }],
          },
          take: 50,
          orderBy: [{ lastDetectedAt: 'desc' }, { category: 'asc' }],
          include: { evidenceSnapshots: { orderBy: { detectedAt: 'desc' }, take: 1 } },
        });
        const cases = rows
          .map((row) => caseValue(scope, row))
          .filter(
            (value): value is SocialActivityBarrierCase =>
              value !== null &&
              recommendationEvidenceAllowed(settings, value.category, value.evidence),
          );
        const first = cases[0];
        if (!first) return null;
        return buildSocialActivityBarrierQuestion(
          cases.filter((value) => sameEvidence(value.evidence, first.evidence)).slice(0, 5),
        );
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }

  async answer(input: Parameters<SocialActivityBarrierConfirmationRepository['answer']>[0]) {
    input = structuredClone(input);
    const uniqueCaseIds = [...new Set(input.caseIds)];
    const requestSnapshot = {
      caseIds: [...uniqueCaseIds].sort(),
      selectedCaseId: input.selectedCaseId,
    };
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
      if (!this.validScope(input.scope)) return null;
      await lockRecommendationService(tx, input.scope);
      if (!(await this.lock(tx, input.scope))) return null;
      if (!(await this.permitted(tx, input.scope, this.now()))) return null;
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
        const receipt = existing.requestSnapshot as {
          caseIds?: unknown;
          selectedCaseId?: unknown;
        } | null;
        if (
          !receipt ||
          JSON.stringify(receipt.caseIds) !== JSON.stringify(requestSnapshot.caseIds) ||
          receipt.selectedCaseId !== requestSnapshot.selectedCaseId
        )
          return null;
        const stored = await tx.socialActivitySupportIntervention.findFirst({
          where: {
            idempotencyKey: `${input.idempotencyKey}:support`,
            barrierCase: scopeWhere(input.scope),
          },
          select: { id: true, status: true, definitionSnapshot: true },
        });
        return {
          response: existing.response,
          support: stored ? (supportProgress(stored)?.support ?? null) : null,
        };
      }

      const { policy, settings } = await readRuntimeRecommendationPolicy(tx, input.scope);
      if (!policy || !settings.enabled) return null;
      const active = await tx.socialActivitySupportIntervention.findFirst({
        where: { status: { in: ['OFFERED', 'ACCEPTED'] }, barrierCase: scopeWhere(input.scope) },
        select: { id: true },
      });
      if (active) return null;
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
      if (
        cases.some(
          (value) => !recommendationEvidenceAllowed(settings, value.category, value.evidence),
        )
      )
        return null;
      buildSocialActivityBarrierQuestion(cases);

      const selected =
        input.selectedCaseId === null
          ? null
          : (cases.find((value) => value.id === input.selectedCaseId) ?? null);
      if (input.selectedCaseId !== null && !selected) return null;

      const nextEligibleAt = new Date(input.answeredAt);
      nextEligibleAt.setUTCDate(nextEligibleAt.getUTCDate() + settings.cooldownDays);
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
          requestSnapshot,
          selectedCategory: selected?.category ?? null,
          actorUserId: input.scope.userId,
          idempotencyKey: input.idempotencyKey,
          occurredAt: input.answeredAt,
        },
      });

      const selection = selected
        ? selectSocialActivitySupport({ category: selected.category, evidence: selected.evidence })
        : null;
      const support = selection?.support ?? null;
      if (selected && selection) {
        await tx.socialActivitySupportIntervention.create({
          data: {
            caseId: selected.id,
            supportKey: selection.support.key,
            definitionSnapshot: {
              ...selection.support,
              exposureTracking: 'social-support-exposure-v1',
              recommendationPolicy: {
                version: SOCIAL_RECOMMENDATION_POLICY_VERSION,
                revision: policy.revision,
                cooldownDays: settings.cooldownDays,
              },
              steps: [...selection.support.steps],
              selection: {
                mode: selection.mode,
                eligibleGoal: selection.eligibleGoal,
                fallbackReason: selection.fallbackReason,
              },
            },
            ruleVersion: SOCIAL_ACTIVITY_SUPPORT_RULE_VERSION,
            idempotencyKey: `${input.idempotencyKey}:support`,
            offeredAt: input.answeredAt,
          },
        });
      }

      return { response, support };
    });
  }

  async recordExposure(
    input: Parameters<SocialActivityBarrierConfirmationRepository['recordExposure']>[0],
  ) {
    const request = structuredClone(input);
    if (!['DISPLAY', 'DETAILS'].includes(request.kind)) return false;
    return this.client.$transaction(async (tx) => {
      if (!(await this.lock(tx, request.scope))) return false;
      const at = this.now();
      if (!(await this.permitted(tx, request.scope, at))) return false;
      const row = await tx.socialActivitySupportIntervention.findFirst({
        where: { id: request.supportId, barrierCase: scopeWhere(request.scope) },
        select: {
          id: true,
          status: true,
          definitionSnapshot: true,
          offeredAt: true,
          firstDisplayedAt: true,
          firstDetailsViewedAt: true,
        },
      });
      if (!row || !supportProgress(row) || row.offeredAt > at) return false;
      if (request.kind === 'DISPLAY' && row.firstDisplayedAt) return true;
      if (request.kind === 'DETAILS' && row.firstDetailsViewedAt) return true;
      await tx.socialActivitySupportIntervention.update({
        where: { id: row.id },
        data: {
          ...(!row.firstDisplayedAt ? { firstDisplayedAt: at } : {}),
          ...(request.kind === 'DETAILS' ? { firstDetailsViewedAt: at } : {}),
        },
      });
      return true;
    });
  }

  async getActiveSupport(
    input: Parameters<SocialActivityBarrierConfirmationRepository['getActiveSupport']>[0],
  ) {
    const scope = { ...input.scope };
    const at = this.now();
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        if (!(await this.permitted(tx, scope, at))) return null;
        const settings = (await readRuntimeRecommendationPolicy(tx, scope)).settings;
        const row = await tx.socialActivitySupportIntervention.findFirst({
          where: {
            status: { in: settings.enabled ? ['OFFERED', 'ACCEPTED'] : ['ACCEPTED'] },
            barrierCase: scopeWhere(scope),
          },
          orderBy: { offeredAt: 'desc' },
          select: { id: true, status: true, definitionSnapshot: true },
        });
        return row ? supportProgress(row) : null;
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }

  async transitionSupport(
    input: Parameters<SocialActivityBarrierConfirmationRepository['transitionSupport']>[0],
  ) {
    input = structuredClone(input);
    if (
      !['ACCEPT', 'COMPLETE', 'SKIP'].includes(input.action) ||
      !Number.isFinite(input.occurredAt.getTime()) ||
      (input.reason !== undefined &&
        (input.action !== 'SKIP' || typeof input.reason !== 'string' || input.reason.length > 500))
    )
      return null;
    if (input.reason !== undefined) input.reason = input.reason.trim();
    return this.client.$transaction(async (tx) => {
      if (!this.validScope(input.scope)) return null;
      await lockRecommendationService(tx, input.scope);
      if (!(await this.lock(tx, input.scope))) return null;
      if (!(await this.permitted(tx, input.scope, this.now(), input.action === 'ACCEPT')))
        return null;
      if (
        input.action === 'ACCEPT' &&
        !(await readRuntimeRecommendationPolicy(tx, input.scope)).settings.enabled
      )
        return null;
      const row = await tx.socialActivitySupportIntervention.findFirst({
        where: { id: input.supportId, barrierCase: scopeWhere(input.scope) },
        select: { id: true, caseId: true, status: true, definitionSnapshot: true },
      });
      if (!row) return null;
      if (!supportProgress(row)) return null;
      const desired =
        input.action === 'ACCEPT'
          ? 'ACCEPTED'
          : input.action === 'COMPLETE'
            ? 'COMPLETED'
            : 'SKIPPED';
      if (row.status === desired) {
        if (desired === 'SKIPPED') {
          const snapshot = row.definitionSnapshot as Record<string, Prisma.JsonValue>;
          const feedback = snapshot['feedback'] as Record<string, Prisma.JsonValue> | undefined;
          if ((feedback?.['reason'] ?? '') !== (input.reason ?? '')) return null;
        }
        return supportProgress(row);
      }
      if (row.status === 'COMPLETED' || row.status === 'SKIPPED') return null;

      const data: Prisma.SocialActivitySupportInterventionUpdateManyMutationInput =
        desired === 'ACCEPTED'
          ? { status: 'ACCEPTED', acceptedAt: input.occurredAt }
          : desired === 'COMPLETED'
            ? { status: 'COMPLETED', completedAt: input.occurredAt }
            : { status: 'SKIPPED', skippedAt: input.occurredAt };
      const updated = await tx.socialActivitySupportIntervention.updateMany({
        where: {
          id: input.supportId,
          status: row.status,
          barrierCase: scopeWhere(input.scope),
        },
        data,
      });
      if (updated.count !== 1) {
        const concurrent = await tx.socialActivitySupportIntervention.findFirst({
          where: { id: input.supportId, status: desired, barrierCase: scopeWhere(input.scope) },
          select: { id: true, caseId: true, status: true, definitionSnapshot: true },
        });
        return concurrent ? supportProgress(concurrent) : null;
      }
      if (desired === 'SKIPPED') {
        const nextEligibleAt = new Date(
          input.occurredAt.getTime() +
            socialSupportCooldownDays(row.definitionSnapshot) * 86_400_000,
        );
        await tx.socialActivityBarrierCase.updateMany({
          where: { ...scopeWhere(input.scope), id: row.caseId },
          data: { status: 'DISMISSED', dismissedAt: input.occurredAt, nextEligibleAt },
        });
        await tx.socialActivitySupportIntervention.update({
          where: { id: row.id },
          data: {
            definitionSnapshot: {
              ...(row.definitionSnapshot as Prisma.JsonObject),
              feedback: {
                reason: input.reason ?? '',
                recordedAt: input.occurredAt.toISOString(),
              },
            },
          },
        });
      }
      return supportProgress({ ...row, status: desired });
    });
  }
}
