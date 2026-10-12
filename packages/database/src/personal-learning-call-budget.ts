import type { Prisma } from '@prisma/client';
import {
  reservePersonalLearningCallCost,
  type AiTokenPricing,
  type PersonalLearningCallAdmissionPolicy,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

/** Caller MUST hold the shared program advisory lock in this transaction. No Provider I/O. */
export async function reserveLearningProgramBudget(
  tx: Prisma.TransactionClient,
  input: {
    policy: PersonalLearningCallAdmissionPolicy;
    provider: string;
    pricingRegistry: readonly AiTokenPricing[];
    occurredAt: Date;
  },
) {
  const { policy, occurredAt } = input;
  const reservation = reservePersonalLearningCallCost(input);
  if (!reservation || reservation.reservedCostUsdMicros > policy.dailyCostLimitUsdMicros)
    throw new ApplicationError('FORBIDDEN', 'learning call cost unavailable');
  const where = {
    workspaceId: policy.workspaceId,
    groupId: policy.groupId,
    serviceProgramId: policy.serviceProgramId,
  };
  const start = new Date(occurredAt);
  start.setUTCHours(0, 0, 0, 0);
  const day = { ...where, admittedAt: { gte: start, lt: new Date(start.getTime() + 86400000) } };
  const [attempts, concurrent, unknown, reserved] = await Promise.all([
    tx.personalLearningCallAdmission.count({ where: day }),
    tx.personalLearningCallAdmission.count({ where: { ...where, settledAt: null } }),
    tx.personalLearningCallAdmission.count({ where: { ...day, reservedCostUsdMicros: null } }),
    tx.personalLearningCallAdmission.aggregate({
      where: day,
      _sum: { reservedCostUsdMicros: true },
    }),
  ]);
  if (
    attempts >= policy.dailyAttemptLimit ||
    concurrent >= policy.maxConcurrent ||
    unknown > 0 ||
    (reserved._sum.reservedCostUsdMicros ?? 0n) + BigInt(reservation.reservedCostUsdMicros) >
      BigInt(policy.dailyCostLimitUsdMicros)
  )
    throw new ApplicationError('FORBIDDEN', 'learning call limit reached');
  return reservation;
}
