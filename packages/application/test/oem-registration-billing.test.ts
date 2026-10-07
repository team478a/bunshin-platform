import { describe, expect, it } from 'vitest';
import {
  assertOemOffering,
  commercialMonthPeriod,
  countOemBillableUsers,
  invoiceBillableUserCount,
  parseCommercialInteger,
  quoteMauPrice,
  type OemRegistrationInterval,
  type OemOfferingInterval,
  type OemUsageEvidence,
} from '../src';

const period = commercialMonthPeriod(new Date('2026-09-15T00:00:00Z'));
const baseline = {
  workspaceId: 'w',
  period: { startsAt: period.start, endsAt: period.end },
  contractPeriods: [{ startsAt: period.start, endsAt: null }],
};
const registration = (userId = 'u', groupId = 'g'): OemRegistrationInterval => ({
  workspaceId: 'w',
  groupId,
  userId,
  startsAt: period.start,
  endsAt: null,
});
const offering = (
  classification: OemOfferingInterval['classification'],
  groupId = 'g',
): OemOfferingInterval => ({
  workspaceId: 'w',
  groupId,
  classification,
  startsAt: period.start,
  endsAt: null,
});
const usage = (userId = 'u', groupId = 'g'): OemUsageEvidence => ({
  workspaceId: 'w',
  groupId,
  userId,
  occurredAt: new Date('2026-09-10T00:00:00Z'),
  eventType: 'POST_VIEW',
});
const count = (
  registrations: OemRegistrationInterval[],
  offerings: OemOfferingInterval[],
  events: OemUsageEvidence[] = [],
) => countOemBillableUsers({ ...baseline, registrations, offerings, usage: events });

describe('OEM registration billing V2', () => {
  it.each(['PAID', 'PAID_BUNDLE'] as const)(
    '100 unused registered participants in %s are billable, independent of price, login, training or roles',
    (kind) => {
      expect(
        count(
          Array.from({ length: 100 }, (_, i) => registration(String(i))),
          [offering(kind)],
        ).billableUserCount,
      ).toBe(100);
    },
  );
  it('free100 active10 bills10; invitations without confirmation bill0', () => {
    const r = Array.from({ length: 100 }, (_, i) => registration(String(i)));
    expect(
      count(
        r,
        [offering('FREE')],
        r.slice(0, 10).map((v) => usage(v.userId)),
      ).billableUserCount,
    ).toBe(10);
    expect(count([], [offering('PAID')]).billableUserCount).toBe(0);
    expect(count([registration()], [offering('PAID')]).billableUserCount).toBe(1);
  });
  it('same month end/rejoin, repeats and multiple services deduplicate by user only', () => {
    expect(
      count(
        [registration(), registration(), registration('u', 'g2')],
        [offering('PAID'), offering('PAID', 'g2')],
      ).billableUserCount,
    ).toBe(1);
  });
  it('paid120 + free80 - intersection20 =180', () => {
    const r = Array.from({ length: 120 }, (_, i) => registration(String(i)));
    const events = Array.from({ length: 80 }, (_, i) => usage(String(i + 100), 'free'));
    expect(count(r, [offering('PAID'), offering('FREE', 'free')], events)).toMatchObject({
      registeredUserCount: 120,
      freeActiveUserCount: 80,
      overlapUserCount: 20,
      billableUserCount: 180,
    });
  });
  it('ended histories do not bill future months; JST half-open end boundary is preserved', () => {
    const r = { ...registration(), endsAt: period.end };
    expect(count([r], [offering('PAID')]).billableUserCount).toBe(1);
    const october = commercialMonthPeriod(new Date('2026-10-01T00:00:00Z'));
    expect(
      countOemBillableUsers({
        ...baseline,
        period: { startsAt: october.start, endsAt: october.end },
        registrations: [r],
        offerings: [offering('PAID')],
        usage: [],
      }).billableUserCount,
    ).toBe(0);
  });
  it('successful zero duration registration counts only its actual month', () => {
    expect(
      count([{ ...registration(), endsAt: period.start }], [offering('PAID')]).billableUserCount,
    ).toBe(1);
    expect(
      count([{ ...registration(), startsAt: period.end, endsAt: period.end }], [offering('PAID')])
        .billableUserCount,
    ).toBe(0);
  });
  it('free→paid includes existing unused registration; paid→free retains paid evidence', () => {
    const middle = new Date('2026-09-15T00:00:00Z');
    expect(
      count(
        [registration()],
        [
          { ...offering('FREE'), endsAt: middle },
          { ...offering('PAID'), startsAt: middle },
        ],
      ).billableUserCount,
    ).toBe(1);
    expect(
      count(
        [registration()],
        [
          { ...offering('PAID'), endsAt: middle },
          { ...offering('FREE'), startsAt: middle },
        ],
      ).billableUserCount,
    ).toBe(1);
  });
  it('no charge before contract and cross tenant fails closed', () => {
    expect(
      countOemBillableUsers({
        ...baseline,
        contractPeriods: [{ startsAt: period.end, endsAt: null }],
        registrations: [registration()],
        offerings: [offering('PAID')],
        usage: [],
      }).billableUserCount,
    ).toBe(0);
    expect(() => count([{ ...registration(), workspaceId: 'other' }], [offering('PAID')])).toThrow(
      'cross workspace',
    );
  });
  it('Manaberu OEM free cannot be authorized by price or branding', () => {
    expect(() => assertOemOffering('MANABERU_STYLE', 'FREE')).toThrow(
      'MANABERU_OEM_FREE_FORBIDDEN',
    );
    expect(() => assertOemOffering('MANABERU_STYLE', 'PAID_BUNDLE')).not.toThrow();
  });
  it('new zero count does not fall back to old MAU', () => {
    expect(invoiceBillableUserCount({ mau: 100, billableUserCount: 0 })).toBe(0);
    expect(invoiceBillableUserCount({ mau: 100, billableUserCount: null })).toBe(100);
  });
});

describe('dynamic, tax-inclusive pricing', () => {
  it('stable IDs with editable boundaries, first upper0/price0 and dynamic quote threshold', () => {
    const tiers = [
      { tierKey: 'stable-a', upperLimit: 0, priceYen: 0 },
      { tierKey: 'stable-b', upperLimit: 150, priceYen: 19800 },
      { tierKey: 'stable-c', upperLimit: 5000, priceYen: 99800 },
    ];
    expect(quoteMauPrice(0, 'v', tiers).priceYen).toBe(0);
    expect(quoteMauPrice(101, 'v', tiers).tierKey).toBe('stable-b');
    expect(quoteMauPrice(5000, 'v', tiers).priceYen).toBe(99800);
    expect(quoteMauPrice(5001, 'v', tiers).customQuoteRequired).toBe(true);
  });
  it.each(['', ' ', '-1', '1.1', '1e3', 'Infinity', 'NaN', '2147483647'])(
    'rejects invalid integer %s without blank→zero coercion',
    (value) => expect(() => parseCommercialInteger(value)).toThrow(),
  );
  it('rejects missing rows, descending limits and duplicate row ids', () => {
    expect(() => quoteMauPrice(0, 'v', [])).toThrow();
    expect(() =>
      quoteMauPrice(0, 'v', [
        { tierKey: 'x', upperLimit: 100, priceYen: 1 },
        { tierKey: 'y', upperLimit: 99, priceYen: 1 },
      ]),
    ).toThrow();
    expect(() =>
      quoteMauPrice(0, 'v', [
        { tierKey: 'x', upperLimit: 100, priceYen: 1 },
        { tierKey: 'x', upperLimit: 200, priceYen: 1 },
      ]),
    ).toThrow();
  });
});
