import { COMMERCIAL_USAGE_EVENT_TYPES, type CommercialUsageEventType } from './commercial-usage';

export const OEM_REGISTRATION_BILLING_RULE_VERSION = 'OEM_REGISTRATION_BILLING_V2';
export type OemOfferingClassification = 'FREE' | 'PAID' | 'PAID_BUNDLE';
export type OemProductPolicy = 'HASSY' | 'MANABERU_STYLE';
export interface BillingInterval {
  readonly startsAt: Date;
  readonly endsAt: Date | null;
}
export interface OemRegistrationInterval extends BillingInterval {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly userId: string;
}
export interface OemOfferingInterval extends BillingInterval {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly classification: OemOfferingClassification;
}
export interface OemUsageEvidence {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly userId: string;
  readonly occurredAt: Date;
  readonly eventType: CommercialUsageEventType;
}

export function assertOemOffering(
  product: OemProductPolicy,
  classification: OemOfferingClassification,
): void {
  if (
    !['HASSY', 'MANABERU_STYLE'].includes(product) ||
    !['FREE', 'PAID', 'PAID_BUNDLE'].includes(classification)
  )
    throw new Error('invalid OEM offering');
  if (product === 'MANABERU_STYLE' && classification === 'FREE')
    throw new Error('MANABERU_OEM_FREE_FORBIDDEN');
}

function validateInterval(interval: BillingInterval): void {
  if (
    !Number.isFinite(interval.startsAt.getTime()) ||
    (interval.endsAt !== null &&
      (!Number.isFinite(interval.endsAt.getTime()) || interval.endsAt < interval.startsAt))
  )
    throw new Error('invalid billing interval');
}
function contains(interval: BillingInterval, time: number): boolean {
  return (
    interval.startsAt.getTime() <= time &&
    (interval.endsAt === null || time < interval.endsAt.getTime())
  );
}
function overlap(intervals: readonly BillingInterval[]): boolean {
  return (
    Math.max(...intervals.map((i) => i.startsAt.getTime())) <
    Math.min(...intervals.map((i) => i.endsAt?.getTime() ?? Infinity))
  );
}

/** Pure, tenant-scoped set union. No profile/status/payment inference. */
export function countOemBillableUsers(input: {
  readonly workspaceId: string;
  readonly period: BillingInterval;
  readonly contractPeriods: readonly BillingInterval[];
  readonly registrations: readonly OemRegistrationInterval[];
  readonly offerings: readonly OemOfferingInterval[];
  readonly usage: readonly OemUsageEvidence[];
}) {
  if (!input.workspaceId || input.period.endsAt === null) throw new Error('invalid billing scope');
  for (const interval of [
    input.period,
    ...input.contractPeriods,
    ...input.registrations,
    ...input.offerings,
  ])
    validateInterval(interval);
  if (input.period.endsAt <= input.period.startsAt) throw new Error('invalid billing month');
  if (
    [...input.registrations, ...input.offerings, ...input.usage].some(
      (row) => row.workspaceId !== input.workspaceId,
    )
  )
    throw new Error('cross workspace billing evidence');
  const registered = new Set<string>();
  const active = new Set<string>();
  for (const registration of input.registrations) {
    for (const offering of input.offerings) {
      if (offering.groupId !== registration.groupId || offering.classification === 'FREE') continue;
      for (const contract of input.contractPeriods) {
        // A successfully registered-and-ended instant counts in its month only.
        const instant = registration.endsAt?.getTime() === registration.startsAt.getTime();
        if (
          instant
            ? [input.period, contract, offering].every((i) =>
                contains(i, registration.startsAt.getTime()),
              )
            : overlap([input.period, contract, offering, registration])
        )
          registered.add(registration.userId);
      }
    }
  }
  for (const event of input.usage) {
    const time = event.occurredAt.getTime();
    if (!Number.isFinite(time)) throw new Error('invalid usage date');
    if (!(COMMERCIAL_USAGE_EVENT_TYPES as readonly string[]).includes(event.eventType))
      throw new Error('invalid usage type');
    if (
      contains(input.period, time) &&
      input.contractPeriods.some((c) => contains(c, time)) &&
      input.offerings.some(
        (o) => o.groupId === event.groupId && o.classification === 'FREE' && contains(o, time),
      )
    )
      active.add(event.userId);
  }
  return {
    ruleVersion: OEM_REGISTRATION_BILLING_RULE_VERSION,
    registeredUserCount: registered.size,
    freeActiveUserCount: active.size,
    overlapUserCount: [...registered].filter((id) => active.has(id)).length,
    billableUserCount: new Set([...registered, ...active]).size,
  };
}

export function parseCommercialInteger(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) throw new Error('integer required');
  const number = Number(value.trim());
  if (!Number.isSafeInteger(number) || number > 2_147_483_646)
    throw new Error('integer out of range');
  return number;
}

export function invoiceBillableUserCount(invoice: {
  mau: number;
  billableUserCount?: number | null;
}): number {
  return invoice.billableUserCount ?? invoice.mau;
}
