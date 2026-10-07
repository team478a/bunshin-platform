import {
  countOemBillableUsers,
  type OemOfferingClassification,
  type CommercialUsageEventType,
} from '@bunshin/application';
import { Prisma } from './client';

type Scope = { workspaceId: string; groupId: string; id: string; userId: string };

/** Only after existing consent/registration authorization succeeds. Suspension is not END. */
export async function recordOemRegistration(
  tx: Prisma.TransactionClient,
  membership: Scope,
  actorUserId: string,
  now: Date,
  reason: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "group_memberships" WHERE "id" = ${membership.id}::uuid FOR UPDATE`,
  );
  const service = await tx.serviceConfiguration.findFirst({
    where: { workspaceId: membership.workspaceId, groupId: membership.groupId },
    select: { id: true },
  });
  if (!service) return null; // Ordinary Group invitations are not service registrations.
  const consented = await tx.groupMembership.findFirst({
    where: {
      id: membership.id,
      workspaceId: membership.workspaceId,
      groupId: membership.groupId,
      userId: membership.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
    },
    select: { id: true },
  });
  if (!consented) throw new Error('CONSENTED_FORMAL_REGISTRATION_REQUIRED');
  const current = await tx.oemRegistrationPeriod.findFirst({
    where: { workspaceId: membership.workspaceId, groupMembershipId: membership.id, endsAt: null },
  });
  if (current) return current;
  return tx.oemRegistrationPeriod.create({
    data: {
      workspaceId: membership.workspaceId,
      groupId: membership.groupId,
      groupMembershipId: membership.id,
      userId: membership.userId,
      startsAt: now,
      registeredByUserId: actorUserId,
      reason,
    },
  });
}

export async function endOemRegistration(
  tx: Prisma.TransactionClient,
  membership: Scope,
  actorUserId: string,
  now: Date,
  reason: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "group_memberships" WHERE "id" = ${membership.id}::uuid FOR UPDATE`,
  );
  return tx.oemRegistrationPeriod.updateMany({
    where: {
      workspaceId: membership.workspaceId,
      groupMembershipId: membership.id,
      endsAt: null,
      startsAt: { lte: now },
    },
    data: { endsAt: now, endedByUserId: actorUserId, endReason: reason },
  });
}

export async function oemBillingShadow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  period: { start: Date; end: Date },
) {
  const [registrations, offerings, contractPeriods, usage] = await Promise.all([
    tx.oemRegistrationPeriod.findMany({
      where: {
        workspaceId,
        startsAt: { lt: period.end },
        OR: [{ endsAt: null }, { endsAt: { gte: period.start } }],
      },
    }),
    tx.oemOfferingPeriod.findMany({
      where: {
        workspaceId,
        startsAt: { lt: period.end },
        OR: [{ endsAt: null }, { endsAt: { gt: period.start } }],
      },
    }),
    tx.oemContractPeriod.findMany({
      where: {
        workspaceId,
        startsAt: { lt: period.end },
        OR: [{ endsAt: null }, { endsAt: { gt: period.start } }],
      },
    }),
    tx.serviceUsageEvent.findMany({
      where: { workspaceId, occurredAt: { gte: period.start, lt: period.end } },
    }),
  ]);
  if (
    !contractPeriods.length ||
    !offerings.length ||
    registrations.some((r) => !offerings.some((o) => o.groupId === r.groupId))
  )
    throw new Error('REVIEW_REQUIRED: billing history incomplete');
  // Knowing a service's current classification is insufficient: every billed interval
  // must have historical coverage, including a formerly FREE interval.
  const covered = (groupId: string, from: number, to: number) => {
    const rows = offerings
      .filter((o) => o.groupId === groupId)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    if (from === to)
      return rows.some(
        (o) => o.startsAt.getTime() <= from && (o.endsAt === null || o.endsAt.getTime() > from),
      );
    let cursor = from;
    for (const row of rows) {
      const end = row.endsAt?.getTime() ?? Infinity;
      if (end <= cursor) continue;
      if (row.startsAt.getTime() > cursor) break;
      cursor = Math.max(cursor, end);
      if (cursor >= to) return true;
    }
    return false;
  };
  for (const registration of registrations) {
    for (const contract of contractPeriods) {
      const from = Math.max(
        period.start.getTime(),
        registration.startsAt.getTime(),
        contract.startsAt.getTime(),
      );
      const to = Math.min(
        period.end.getTime(),
        registration.endsAt?.getTime() ?? Infinity,
        contract.endsAt?.getTime() ?? Infinity,
      );
      const instant =
        registration.endsAt?.getTime() === registration.startsAt.getTime() &&
        from === to &&
        from < period.end.getTime() &&
        from < (contract.endsAt?.getTime() ?? Infinity);
      if ((from < to || instant) && !covered(registration.groupId, from, to))
        throw new Error('REVIEW_REQUIRED: offering timeline gap');
    }
  }
  if (
    usage.some(
      (event) =>
        contractPeriods.some(
          (c) =>
            c.startsAt <= event.occurredAt && (c.endsAt === null || c.endsAt > event.occurredAt),
        ) && !covered(event.groupId, event.occurredAt.getTime(), event.occurredAt.getTime()),
    )
  )
    throw new Error('REVIEW_REQUIRED: usage offering history missing');
  const participants = await tx.groupMembership.findMany({
    where: {
      workspaceId,
      role: 'PARTICIPANT',
      status: { in: ['ACTIVE', 'SUSPENDED'] },
      consentedAt: { not: null },
      group: { serviceConfiguration: { isNot: null } },
    },
    select: { id: true },
  });
  const knownRegistrations = await tx.oemRegistrationPeriod.findMany({
    where: { workspaceId, groupMembershipId: { in: participants.map((m) => m.id) }, endsAt: null },
    select: { groupMembershipId: true },
  });
  if (participants.some((m) => !knownRegistrations.some((r) => r.groupMembershipId === m.id)))
    throw new Error('REVIEW_REQUIRED: formal registration evidence missing');
  const counts = countOemBillableUsers({
    workspaceId,
    period: { startsAt: period.start, endsAt: period.end },
    contractPeriods,
    registrations,
    offerings: offerings.map((o) => ({
      ...o,
      classification: o.classification as OemOfferingClassification,
    })),
    usage: usage.map((u) => ({ ...u, eventType: u.eventType as CommercialUsageEventType })),
  });
  return {
    ...counts,
    evidence: {
      registrationPeriodIds: registrations.map((r) => r.id),
      offeringPeriodIds: offerings.map((o) => o.id),
      contractPeriodIds: contractPeriods.map((c) => c.id),
    },
  };
}
