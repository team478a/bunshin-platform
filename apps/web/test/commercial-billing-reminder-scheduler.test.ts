import { describe, expect, it } from 'vitest';
import { commercialReminderKind } from '../src/services/commercial-billing-reminder-scheduler';

describe('commercialReminderKind', () => {
  const now = new Date('2026-09-20T00:00:00.000Z');

  it('waits when the due date is more than three days away', () => {
    expect(commercialReminderKind(new Date('2026-09-23T00:00:00.001Z'), now)).toBeNull();
  });

  it('selects the initial reminder during the three days before the deadline', () => {
    expect(commercialReminderKind(new Date('2026-09-23T00:00:00.000Z'), now)).toBe('INITIAL');
    expect(commercialReminderKind(new Date('2026-09-20T00:00:00.001Z'), now)).toBe('INITIAL');
  });

  it('uses the contract-specific initial reminder window', () => {
    expect(commercialReminderKind(new Date('2026-09-30T00:00:00.000Z'), now, 10)).toBe('INITIAL');
    expect(commercialReminderKind(new Date('2026-09-30T00:00:00.001Z'), now, 10)).toBeNull();
  });

  it('selects the overdue reminder at and after the deadline', () => {
    expect(commercialReminderKind(now, now)).toBe('OVERDUE');
    expect(commercialReminderKind(new Date('2026-09-19T23:59:59.999Z'), now)).toBe('OVERDUE');
  });
});
