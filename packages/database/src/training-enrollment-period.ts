import type { Prisma } from '@prisma/client';

// Compose with tenant, owner and ACTIVE status conditions. For writes, call
// after the enrollment lock; never use a client event timestamp.
export function trainingEnrollmentPeriodWhere(now: Date): Prisma.ProgramEnrollmentWhereInput {
  return { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}
