import { describe, expect, it } from 'vitest';
import {
  percentage,
  resolveValidationPeriod,
  usdFromMicros,
} from '../app/(app)/validation/view-model';

describe('validation dashboard view model', () => {
  it('defaults to the inclusive last 30 calendar days', () => {
    const value = resolveValidationPeriod({}, new Date('2026-08-21T13:00:00Z'));
    expect(value).toMatchObject({ fromInput: '2026-07-23', toInput: '2026-08-21' });
    expect(value.from.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    expect(value.to.toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });

  it('converts an inclusive UI end date to an exclusive query boundary', () => {
    const value = resolveValidationPeriod(
      { from: '2026-08-01', to: '2026-08-07' },
      new Date('2026-08-21T00:00:00Z'),
    );
    expect(value.usedFallback).toBe(false);
    expect(value.to.toISOString()).toBe('2026-08-08T00:00:00.000Z');
  });

  it('falls back for reversed, invalid, or oversized ranges', () => {
    const now = new Date('2026-08-21T00:00:00Z');
    expect(
      resolveValidationPeriod({ from: '2026-08-20', to: '2026-08-01' }, now).usedFallback,
    ).toBe(true);
    expect(resolveValidationPeriod({ from: 'invalid', to: '2026-08-01' }, now).usedFallback).toBe(
      true,
    );
    expect(
      resolveValidationPeriod({ from: '2024-01-01', to: '2026-08-01' }, now).usedFallback,
    ).toBe(true);
  });

  it('formats ratios without inventing a zero denominator', () => {
    expect(percentage(0.375)).toBe('37.5%');
    expect(percentage(null)).toBe('—');
    expect(usdFromMicros(12_345)).toBe('$0.0123');
    expect(usdFromMicros(null)).toBe('—');
  });
});
