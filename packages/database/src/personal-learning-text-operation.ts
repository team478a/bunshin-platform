import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  validatePersonalLearningTextOperation,
  validateAiCallMeasurement,
  estimateAiCallCost,
  parseAiTokenPricingRegistry,
  type PersonalLearningTextOperation,
  type PersonalLearningTextOperationRepository,
  type AiCallMeasurement,
  type AiTokenPricing,
} from '@bunshin/application';
import { PrismaPersonalLearningRequestRepository } from './personal-learning-request';
import { reserveLearningProgramBudget } from './personal-learning-call-budget';

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
const operationHash = (input: PersonalLearningTextOperation, attempt = input.attempt) =>
  digest([
    'LEARNING_TEXT_OPERATION_V1',
    input.actor.scope.workspaceId,
    input.actor.scope.groupId,
    input.actor.scope.programEnrollmentId,
    input.actor.scope.groupMembershipId,
    input.actor.scope.userId,
    input.operationId,
    attempt,
  ]);
const bodyHash = (input: PersonalLearningTextOperation) =>
  digest([
    input.requestId,
    input.expectedRequestRevision,
    input.operationKind,
    input.provider,
    input.policy.model,
    input.promptVersion,
  ]);
interface Context {
  version: 'LEARNING_TEXT_OPERATION_V1';
  bodyHash: string;
  operationKind: PersonalLearningTextOperation['operationKind'];
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
  extends PrismaPersonalLearningRequestRepository
  implements PersonalLearningTextOperationRepository
{
  constructor(
    private readonly operationClient: PrismaClient,
    now: () => Date = () => new Date(),
  ) {
    super(operationClient, now);
  }
  async admit(input: PersonalLearningTextOperation) {
    validatePersonalLearningTextOperation(input);
    return this.authorized(input.actor, true, async (tx) => {
      await this.normalLearner(tx, input.actor);
      const s = input.actor.scope;
      const enrollment = await tx.programEnrollment.findUniqueOrThrow({
        where: { id: s.programEnrollmentId },
      });
      if (enrollment.serviceProgramId !== input.policy.serviceProgramId)
        throw new ApplicationError('NOT_FOUND', 'learning program unavailable');
      const wish = await tx.personalLearningRequest.findFirst({
        where: s,
        orderBy: { revision: 'desc' },
      });
      if (wish?.id !== input.requestId || wish.revision !== input.expectedRequestRevision)
        throw new ApplicationError('CONFLICT', 'learning wish changed');
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
      if (!clock) throw new ApplicationError('DATABASE_UNAVAILABLE', 'learning clock unavailable');
      const reservation = await reserveLearningProgramBudget(tx, {
        policy: input.policy,
        provider: input.provider,
        pricingRegistry: input.pricingRegistry,
        occurredAt: clock.now,
      });
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
    });
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
                : BigInt(Math.max(c.reservedAtAdmission, cost.totalCostUsdMicros)),
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
