import { createHash } from 'node:crypto';
import type { PrismaClient, LineConfigurationEnvironment } from '@prisma/client';
import {
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
  type AiTokenPricing,
  type PersonalLearningActor,
  type PersonalLearningCallAdmissionPolicy,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { PrismaPersonalLearningAssessmentGate } from './personal-learning-assessment-gate';
import { requirePersonalLearningPilotSeat } from './personal-learning-pilot-seat';

export class PrismaPersonalLearningCallAdmission extends PrismaPersonalLearningAssessmentGate {
  constructor(
    private readonly admissionClient: PrismaClient,
    now: () => Date = () => new Date(),
  ) {
    super(admissionClient, now);
  }

  async admit(input: {
    actor: PersonalLearningActor;
    assignmentId: string;
    answerId: string;
    jobId: string;
    attemptCount: number;
    environment: LineConfigurationEnvironment;
    provider: string;
    model: string;
    policy: PersonalLearningCallAdmissionPolicy;
    pricingRegistry: readonly AiTokenPricing[];
  }) {
    const policy = parsePersonalLearningCallAdmissionPolicy(input.policy);
    const s = input.actor.scope;
    if (
      !policy ||
      policy.workspaceId !== s.workspaceId ||
      policy.groupId !== s.groupId ||
      policy.model !== input.model ||
      !Number.isInteger(input.attemptCount) ||
      input.attemptCount < 1
    )
      throw new ApplicationError('FORBIDDEN', 'pilot call configuration unavailable');
    const operationHash = createHash('sha256')
      .update(`${input.jobId}:${input.attemptCount}`)
      .digest('hex');
    return await this.authorized(input.actor, true, async (tx) => {
      // All workers for this authority share the lock. Serializable conflicts fail closed.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal-learning-call:${policy.serviceProgramId}`}, 0))`;
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      if (!clock) throw new ApplicationError('CONFLICT', 'pilot clock unavailable');
      const enrollment = await tx.programEnrollment.findFirst({
        where: {
          id: s.programEnrollmentId,
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          serviceProgramId: policy.serviceProgramId,
        },
      });
      if (!enrollment) throw new ApplicationError('NOT_FOUND', 'pilot authority unavailable');
      await this.validateAssessment(tx, input.actor, input.assignmentId, input.answerId);
      await requirePersonalLearningPilotSeat(tx, s, input.environment === 'PRODUCTION');
      const jobs = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM jobs WHERE id=${input.jobId}::uuid AND workspace_id=${s.workspaceId}::uuid
          AND environment=${input.environment}::"LineConfigurationEnvironment"
          AND job_type='TRAINING_ANSWER_EVALUATE' AND status='LEASED'
          AND requested_by=${input.actor.actorUserId}::uuid
          AND attempt_count=${input.attemptCount} AND lease_owner IS NOT NULL
          AND lease_expires_at > clock_timestamp()
          AND payload_reference=${`training-evaluation:${s.groupId}:${s.programEnrollmentId}:${input.answerId}:${input.actor.actorUserId}`}
        FOR SHARE`;
      if (jobs.length !== 1) throw new ApplicationError('NOT_FOUND', 'pilot job unavailable');
      const where = {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        serviceProgramId: policy.serviceProgramId,
      };
      if (await tx.personalLearningCallAdmission.findFirst({ where: { ...where, operationHash } }))
        throw new ApplicationError('CONFLICT', 'pilot call attempt already admitted');
      const dayStart = new Date(clock.now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const nextDay = new Date(dayStart.getTime() + 86_400_000);
      const reservation = reservePersonalLearningCallCost({
        policy,
        provider: input.provider,
        pricingRegistry: input.pricingRegistry,
        occurredAt: clock.now,
      });
      if (!reservation || reservation.reservedCostUsdMicros > policy.dailyCostLimitUsdMicros)
        throw new ApplicationError('FORBIDDEN', 'pilot call cost unavailable');
      const attempts = await tx.personalLearningCallAdmission.count({
        where: { ...where, admittedAt: { gte: dayStart, lt: nextDay } },
      });
      const concurrent = await tx.personalLearningCallAdmission.count({
        where: { ...where, settledAt: null },
      });
      const [unknownCost, reservedCost] = await Promise.all([
        tx.personalLearningCallAdmission.count({
          where: {
            ...where,
            admittedAt: { gte: dayStart, lt: nextDay },
            reservedCostUsdMicros: null,
          },
        }),
        tx.personalLearningCallAdmission.aggregate({
          where: { ...where, admittedAt: { gte: dayStart, lt: nextDay } },
          _sum: { reservedCostUsdMicros: true },
        }),
      ]);
      const nextReservedCost =
        (reservedCost._sum.reservedCostUsdMicros ?? 0n) + BigInt(reservation.reservedCostUsdMicros);
      if (
        attempts >= policy.dailyAttemptLimit ||
        concurrent >= policy.maxConcurrent ||
        unknownCost > 0 ||
        nextReservedCost > BigInt(policy.dailyCostLimitUsdMicros)
      )
        throw new ApplicationError('FORBIDDEN', 'pilot call limit reached');
      return tx.personalLearningCallAdmission.create({
        data: {
          ...where,
          operationHash,
          admittedAt: clock.now,
          reservedCostUsdMicros: BigInt(reservation.reservedCostUsdMicros),
          pricingVersion: reservation.pricingVersion,
        },
      });
    });
  }

  /** Internal only: call solely when no request started or a response body finished. */
  async settle(permit: {
    id: string;
    workspaceId: string;
    groupId: string;
    serviceProgramId: string;
    operationHash: string;
  }) {
    await this.admissionClient.$executeRaw`
      UPDATE personal_learning_call_admissions SET settled_at=clock_timestamp()
      WHERE id=${permit.id}::uuid AND workspace_id=${permit.workspaceId}::uuid
        AND group_id=${permit.groupId}::uuid AND service_program_id=${permit.serviceProgramId}::uuid
        AND operation_hash=${permit.operationHash} AND settled_at IS NULL`;
  }
}
