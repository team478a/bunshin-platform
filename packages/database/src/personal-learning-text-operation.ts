import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  PERSONAL_LEARNING_CONVERSATION_VERSION,
  validatePersonalLearningTextOperation,
  validateAiCallMeasurement,
  estimateAiCallCost,
  parseAiTokenPricingRegistry,
  type PersonalLearningTextOperation,
  type PersonalLearningTextOperationRepository,
  type AiCallMeasurement,
  type AiTokenPricing,
} from '@bunshin/application';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
} from '@bunshin/capability-training';
import { PrismaPracticeSupportRepository } from './personal-learning-practice-support';
import { CONVERSATION_MESSAGE_EVENT } from './personal-learning-conversation';
import { reserveLearningProgramBudget } from './personal-learning-call-budget';
import { personalLearningOperationHash as operationHash } from './personal-learning-operation-identity';

const digest = (v: unknown) =>
  createHash('sha256')
    .update(
      JSON.stringify(v, (_key, item: unknown) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      ),
    )
    .digest('hex');
const bodyHash = (input: PersonalLearningTextOperation) =>
  digest([
    input.requestId,
    input.actor.topicId ?? null,
    input.expectedRequestRevision,
    input.operationKind,
    input.provider,
    input.policy.model,
    input.promptVersion,
    ...(input.nudge ? [input.nudge] : []),
    ...(input.practice ? [input.practice] : []),
  ]);
const metadataObject = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};
interface Context {
  version: 'LEARNING_TEXT_OPERATION_V1';
  bodyHash: string;
  operationKind: PersonalLearningTextOperation['operationKind'];
  actorKeyHash: string;
  programEnrollmentId: string;
  provider: string;
  model: string;
  promptVersion: string;
  pricing: AiTokenPricing;
  maxRequestBytes: number;
  maxOutputTokens: number;
  reservedAtAdmission: number;
  measurement: AiCallMeasurement | null;
  requestFinished: boolean | null;
  costStatus: 'ESTIMATED' | 'UNKNOWN' | null;
}
function context(value: Prisma.JsonValue): Context {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value['version'] !== 'LEARNING_TEXT_OPERATION_V1'
  )
    throw new ApplicationError('CONFLICT', 'learning operation context unavailable');
  return value as unknown as Context;
}
/** Internal server port only. Does not publish/apply a lesson or permit learner-supplied prices. */
export class PrismaPersonalLearningTextOperationRepository
  extends PrismaPracticeSupportRepository
  implements PersonalLearningTextOperationRepository
{
  constructor(
    private readonly operationClient: PrismaClient,
    now: () => Date = () => new Date(),
  ) {
    super(operationClient, now);
  }
  private async assertConversationAdmission(
    tx: Prisma.TransactionClient,
    input: PersonalLearningTextOperation,
  ) {
    const actor = input.actor;
    const [request, enrollment] = await Promise.all([
      tx.personalLearningRequest.findFirst({
        where: {
          ...actor.scope,
          ...(actor.topicId ? { topicId: actor.topicId } : {}),
          id: input.requestId,
          revision: input.expectedRequestRevision,
        },
      }),
      tx.programEnrollment.findUnique({ where: { id: actor.scope.programEnrollmentId } }),
    ]);
    if (!request || !enrollment || enrollment.serviceProgramId !== input.policy.serviceProgramId)
      throw new ApplicationError('CONFLICT', 'learning conversation changed');
    const program = await tx.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
      },
      select: { settings: true },
    });
    if (!program || !personalLearningFeatureEnabled(program.settings, 'conversation'))
      throw new ApplicationError('NOT_FOUND', 'learning conversation unavailable');
    const row = await tx.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          idempotencyKey: actor.topicId
            ? `learning-conversation-request:${actor.topicId}:${input.operationId}`
            : `learning-conversation-request:${input.operationId}`,
        },
      },
    });
    const metadata = metadataObject(row?.metadata ?? null);
    if (
      row?.actorUserId !== actor.scope.userId ||
      row.programEnrollmentId !== actor.scope.programEnrollmentId ||
      row.eventType !== CONVERSATION_MESSAGE_EVENT ||
      metadata.version !== PERSONAL_LEARNING_CONVERSATION_VERSION ||
      metadata.threadId !== input.requestId ||
      metadata.requestRevision !== input.expectedRequestRevision ||
      metadata.operationId !== input.operationId ||
      (actor.topicId !== undefined && metadata.topicId !== actor.topicId)
    )
      throw new ApplicationError('CONFLICT', 'learning conversation changed');
  }
  private async assertNudgeAdmission(
    tx: Prisma.TransactionClient,
    input: PersonalLearningTextOperation,
    now: Date,
  ) {
    const s = input.actor.scope;
    const enrollment = await tx.programEnrollment.findFirst({
      where: {
        id: s.programEnrollmentId,
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        groupMembershipId: s.groupMembershipId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true, serviceProgramId: true },
    });
    const program = enrollment
      ? await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            status: 'ACTIVE',
            settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
          },
          select: { settings: true },
        })
      : null;
    const [seat, preference] = await Promise.all([
      tx.personalLearningPilotSeat.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          serviceProgramId: input.policy.serviceProgramId,
          programEnrollmentId: s.programEnrollmentId,
          kind: 'INTERNAL',
          cohort: 'INTERNAL',
          revokedAt: null,
        },
        select: { id: true },
      }),
      tx.personalLearningNudgePreference.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          groupMembershipId: s.groupMembershipId,
          userId: s.userId,
          enabled: true,
          stoppedAt: null,
          OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
        },
        select: { id: true, consentVersion: true, consentedAt: true },
      }),
    ]);
    if (
      !input.nudge ||
      !enrollment ||
      enrollment.serviceProgramId !== input.policy.serviceProgramId ||
      !program ||
      !personalLearningDynamicProgramAllows(program.settings, enrollment.id) ||
      !personalLearningFeatureEnabled(program.settings, 'learningNudges') ||
      !seat ||
      !preference ||
      !preference.consentVersion ||
      !preference.consentedAt
    )
      throw new ApplicationError('NOT_FOUND', 'learning nudge unavailable');
  }
  private async assertSideHustleProposalAdmission(
    tx: Prisma.TransactionClient,
    input: PersonalLearningTextOperation,
  ) {
    const scope = input.actor.scope;
    const hearing = await tx.programActionEvent.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        actorUserId: scope.userId,
        id: input.requestId,
        eventType: 'SIDE_HUSTLE_HEARING_SAVED',
      },
      select: { id: true, metadata: true },
    });
    const meta =
      hearing?.metadata && typeof hearing.metadata === 'object' && !Array.isArray(hearing.metadata)
        ? (hearing.metadata as Record<string, unknown>)
        : {};
    const latest = await tx.programActionEvent.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        actorUserId: scope.userId,
        eventType: 'SIDE_HUSTLE_HEARING_SAVED',
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!hearing || latest?.id !== hearing.id || meta.revision !== input.expectedRequestRevision)
      throw new ApplicationError('CONFLICT', 'side hustle hearing changed');
    const [databaseClock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!databaseClock)
      throw new ApplicationError('DATABASE_UNAVAILABLE', 'database clock unavailable');
    const jst = new Date(databaseClock.now.getTime() + 9 * 60 * 60 * 1000);
    const dayStart = new Date(
      Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`side-hustle-proposal-day:${scope.workspaceId}:${scope.groupId}:${scope.userId}`}, 0))`;
    const count = await tx.personalLearningCallAdmission.count({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        admittedAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) },
        AND: [
          {
            operationContext: {
              path: ['actorKeyHash'],
              equals: createHash('sha256').update(scope.userId).digest('hex'),
            },
          },
          { operationContext: { path: ['operationKind'], equals: 'SIDE_HUSTLE_PROPOSAL' } },
        ],
      },
    });
    if (count >= 5)
      throw new ApplicationError('CONFLICT', 'daily side hustle proposal limit reached');
  }
  private async assertSideHustleRoadmapAdmission(
    tx: Prisma.TransactionClient,
    input: PersonalLearningTextOperation,
  ) {
    const scope = input.actor.scope;
    if (input.actor.topicId !== undefined)
      throw new ApplicationError('NOT_FOUND', 'side hustle roadmap unavailable');
    const selected = await tx.programActionEvent.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        actorUserId: scope.userId,
        id: input.requestId,
        eventType: 'SIDE_HUSTLE_SELECTED',
      },
      select: { id: true },
    });
    const latest = await tx.programActionEvent.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        actorUserId: scope.userId,
        eventType: 'SIDE_HUSTLE_SELECTED',
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!selected || latest?.id !== selected.id || input.expectedRequestRevision !== 1)
      throw new ApplicationError('CONFLICT', 'side hustle selection changed');
    const program = await tx.serviceProgram.findFirst({
      where: {
        id: input.policy.serviceProgramId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        settings: { path: ['learningOfferPolicy'], equals: 'SIDE_HUSTLE_V1' },
      },
      select: { id: true },
    });
    if (!program) throw new ApplicationError('NOT_FOUND', 'side hustle roadmap unavailable');
    const [databaseClock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!databaseClock)
      throw new ApplicationError('DATABASE_UNAVAILABLE', 'database clock unavailable');
    const jst = new Date(databaseClock.now.getTime() + 9 * 60 * 60 * 1000);
    const dayStart = new Date(
      Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`side-hustle-roadmap-day:${scope.workspaceId}:${scope.groupId}:${scope.userId}`}, 0))`;
    const count = await tx.personalLearningCallAdmission.count({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        admittedAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) },
        AND: [
          {
            operationContext: {
              path: ['actorKeyHash'],
              equals: createHash('sha256').update(scope.userId).digest('hex'),
            },
          },
          {
            OR: [
              { operationContext: { path: ['operationKind'], equals: 'SIDE_HUSTLE_ROADMAP' } },
              {
                operationContext: {
                  path: ['operationKind'],
                  equals: 'SIDE_HUSTLE_ROADMAP_REVISION',
                },
              },
            ],
          },
        ],
      },
    });
    if (count >= 5)
      throw new ApplicationError('CONFLICT', 'daily side hustle proposal limit reached');
  }
  async admit(input: PersonalLearningTextOperation) {
    validatePersonalLearningTextOperation(input);
    return this.authorized(
      input.actor,
      true,
      async (tx, now) => {
        if (input.operationKind !== 'NUDGE_COPY') await this.normalLearner(tx, input.actor);
        const s = input.actor.scope;
        const enrollment = await tx.programEnrollment.findUniqueOrThrow({
          where: { id: s.programEnrollmentId },
        });
        if (enrollment.serviceProgramId !== input.policy.serviceProgramId)
          throw new ApplicationError('NOT_FOUND', 'learning program unavailable');
        if (input.operationKind === 'PRACTICE_SUPPORT') {
          await this.assertSupportAdmission(tx, input);
        } else if (input.operationKind === 'CONVERSATION_TURN') {
          await this.assertConversationAdmission(tx, input);
        } else if (input.operationKind === 'NUDGE_COPY') {
          await this.assertNudgeAdmission(tx, input, now);
        } else if (input.operationKind === 'SIDE_HUSTLE_PROPOSAL') {
          await this.assertSideHustleProposalAdmission(tx, input);
        } else if (
          input.operationKind === 'SIDE_HUSTLE_ROADMAP' ||
          input.operationKind === 'SIDE_HUSTLE_ROADMAP_REVISION'
        ) {
          await this.assertSideHustleRoadmapAdmission(tx, input);
        } else {
          const wish = await tx.personalLearningRequest.findFirst({
            where: { ...s, ...(input.actor.topicId ? { topicId: input.actor.topicId } : {}) },
            orderBy: { revision: 'desc' },
          });
          if (wish?.id !== input.requestId || wish.revision !== input.expectedRequestRevision)
            throw new ApplicationError('CONFLICT', 'learning wish changed');
          if (input.operationKind === 'PERSONA_INFERENCE') {
            const profile = await tx.personalLearningPersonaProfile.findFirst({
              where: {
                workspaceId: s.workspaceId,
                groupId: s.groupId,
                groupMembershipId: s.groupMembershipId,
                userId: s.userId,
                optedIn: true,
              },
              select: { id: true },
            });
            if (!profile)
              throw new ApplicationError('FORBIDDEN', 'persona inference is not opted in');
          }
        }
        const scope = {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          serviceProgramId: input.policy.serviceProgramId,
        };
        // Same lock and ledger as the existing evaluation admission, not a separate budget.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal-learning-call:${scope.serviceProgramId}`}, 0))`;
        if (
          await tx.personalLearningCallAdmission.findFirst({
            where: { ...scope, operationHash: operationHash(input) },
          })
        )
          throw new ApplicationError('CONFLICT', 'learning attempt already admitted');
        if (input.attempt > 1) {
          const prior = await tx.personalLearningCallAdmission.findFirst({
            where: { ...scope, operationHash: operationHash(input, input.attempt - 1) },
          });
          const c = prior?.operationContext ? context(prior.operationContext) : null;
          if (
            !prior?.settledAt ||
            c?.bodyHash !== bodyHash(input) ||
            c.measurement?.success !== false
          )
            throw new ApplicationError('CONFLICT', 'learning attempt is not retryable');
        }
        // Unpriced/uncertain new-operation calls remain blocking, including across UTC days.
        if (
          await tx.personalLearningCallAdmission.count({
            where: { ...scope, operationContext: { path: ['costStatus'], equals: 'UNKNOWN' } },
          })
        )
          throw new ApplicationError('FORBIDDEN', 'learning operation cost unresolved');
        const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        if (!clock)
          throw new ApplicationError('DATABASE_UNAVAILABLE', 'learning clock unavailable');
        const reservation = await reserveLearningProgramBudget(tx, {
          policy: input.policy,
          provider: input.provider,
          pricingRegistry: input.pricingRegistry,
          occurredAt: clock.now,
        });
        if (input.operationKind === 'PERSONA_INFERENCE') {
          const monthStart = new Date(
            Date.UTC(clock.now.getUTCFullYear(), clock.now.getUTCMonth(), 1),
          );
          const [monthly] = await tx.$queryRaw<
            { serviceCost: bigint; learnerCost: bigint }[]
          >`SELECT
            COALESCE(SUM(reserved_cost_usd_micros), 0)::bigint AS "serviceCost",
            COALESCE(SUM(reserved_cost_usd_micros) FILTER (WHERE operation_context->>'actorKeyHash' = ${createHash('sha256').update(s.userId).digest('hex')}), 0)::bigint AS "learnerCost"
          FROM personal_learning_call_admissions
          WHERE workspace_id = ${scope.workspaceId}::uuid
            AND group_id = ${scope.groupId}::uuid
            AND service_program_id = ${scope.serviceProgramId}::uuid
            AND admitted_at >= ${monthStart}
            AND operation_context->>'operationKind' = 'PERSONA_INFERENCE'`;
          if (
            !monthly ||
            monthly.serviceCost + BigInt(reservation.reservedCostUsdMicros) > 5_000_000n ||
            monthly.learnerCost + BigInt(reservation.reservedCostUsdMicros) > 1_000_000n
          )
            throw new ApplicationError('FORBIDDEN', 'persona inference monthly budget reached');
        }
        const pricing = parseAiTokenPricingRegistry(input.pricingRegistry)
          .filter(
            (p) =>
              p.provider === input.provider &&
              p.model === input.policy.model &&
              Date.parse(p.effectiveFrom) <= clock.now.getTime(),
          )
          .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
        if (!pricing) throw new ApplicationError('FORBIDDEN', 'learning price unavailable');
        const c: Context = {
          version: 'LEARNING_TEXT_OPERATION_V1',
          bodyHash: bodyHash(input),
          operationKind: input.operationKind,
          actorKeyHash: createHash('sha256').update(input.actor.scope.userId).digest('hex'),
          programEnrollmentId: input.actor.scope.programEnrollmentId,
          provider: input.provider,
          model: input.policy.model,
          promptVersion: input.promptVersion,
          pricing,
          reservedAtAdmission: reservation.reservedCostUsdMicros,
          maxRequestBytes: input.policy.maxRequestBytes,
          maxOutputTokens: input.policy.maxOutputTokens,
          measurement: null,
          requestFinished: null,
          costStatus: null,
        };
        const row = await tx.personalLearningCallAdmission.create({
          data: {
            ...scope,
            operationHash: operationHash(input),
            admittedAt: clock.now,
            reservedCostUsdMicros: BigInt(reservation.reservedCostUsdMicros),
            pricingVersion: reservation.pricingVersion,
            operationContext: c as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          id: row.id,
          operationHash: row.operationHash,
          maxRequestBytes: c.maxRequestBytes,
          maxOutputTokens: c.maxOutputTokens,
        };
      },
      input.operationKind === 'NUDGE_COPY',
    );
  }
  async record(input: Parameters<PersonalLearningTextOperationRepository['record']>[0]) {
    const op = input.operation;
    validatePersonalLearningTextOperation(op);
    const m = validateAiCallMeasurement(input.measurement);
    if (
      typeof input.requestFinished !== 'boolean' ||
      input.permit.operationHash !== operationHash(op)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid learning call receipt');
    // Internal settlement records facts from an already-authorized immutable reservation.
    // Current learner eligibility is NOT used to discard a cost incurred before expiry/deletion.
    await this.operationClient.$transaction(
      async (tx) => {
        // Serialize actual-cost adjustments with new reservations in the same program.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal-learning-call:${op.policy.serviceProgramId}`}, 0))`;
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM personal_learning_call_admissions WHERE id=${input.permit.id}::uuid FOR UPDATE`;
        if (rows.length !== 1)
          throw new ApplicationError('NOT_FOUND', 'learning permit unavailable');
        const row = await tx.personalLearningCallAdmission.findUniqueOrThrow({
          where: { id: input.permit.id },
        });
        const c = context(row.operationContext);
        if (
          row.workspaceId !== op.actor.scope.workspaceId ||
          row.groupId !== op.actor.scope.groupId ||
          row.serviceProgramId !== op.policy.serviceProgramId ||
          row.operationHash !== operationHash(op) ||
          c.bodyHash !== bodyHash(op) ||
          c.provider !== m.provider ||
          c.model !== m.model ||
          c.maxRequestBytes !== input.permit.maxRequestBytes ||
          c.maxOutputTokens !== input.permit.maxOutputTokens
        )
          throw new ApplicationError('CONFLICT', 'learning permit mismatch');
        if (c.measurement) {
          if (digest(c.measurement) !== digest(m) || c.requestFinished !== input.requestFinished)
            throw new ApplicationError('CONFLICT', 'learning measurement is immutable');
          return;
        }
        const cost = estimateAiCallCost(m, [c.pricing]);
        await tx.aiUsageEvent.create({
          data: {
            workspaceId: row.workspaceId,
            actorUserId: op.actor.scope.userId,
            bunshinId: null,
            taskType: `PERSONAL_LEARNING_${c.operationKind}`,
            provider: c.provider,
            model: c.model,
            promptVersion: c.promptVersion,
            status: m.success ? 'SUCCESS' : 'FAILED',
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            latencyMs: m.latencyMs,
            estimatedCostUsdMicros:
              cost.totalCostUsdMicros === null ? null : BigInt(cost.totalCostUsdMicros),
            pricingVersion: c.pricing.pricingVersion,
            errorCode: m.errorCategory,
            idempotencyKey: `personal-learning-operation:${row.operationHash}`,
            occurredAt: new Date(m.occurredAt),
          },
        });
        await tx.personalLearningCallAdmission.update({
          where: { id: row.id },
          data: {
            operationContext: {
              ...c,
              measurement: { ...m },
              requestFinished: input.requestFinished,
              costStatus: cost.costStatus,
            } as unknown as Prisma.InputJsonValue,
            // Preserve the conservative reservation; actual overspend increases future budget use.
            reservedCostUsdMicros:
              cost.totalCostUsdMicros === null
                ? null
                : BigInt(
                    op.operationKind === 'NUDGE_COPY'
                      ? cost.totalCostUsdMicros
                      : Math.max(c.reservedAtAdmission, cost.totalCostUsdMicros),
                  ),
            ...(input.requestFinished && cost.costStatus === 'ESTIMATED'
              ? { settledAt: new Date() }
              : {}),
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
