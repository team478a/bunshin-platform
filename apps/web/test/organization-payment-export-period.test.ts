import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';
import { organizationPaymentExportPeriod } from '../src/payments/organization-payment-export-period';

describe('payment export period', () => {
  it.each(['', 'from=&to='])('preserves all-period exports: %s', (query) => {
    expect(organizationPaymentExportPeriod(new URLSearchParams(query))).toEqual({
      from: null,
      to: null,
    });
  });

  it.each([
    ['2026-09-01', '2026-09-30', '2026-08-31T15:00:00.000Z', '2026-09-30T15:00:00.000Z'],
    ['2024-02-29', '2024-02-29', '2024-02-28T15:00:00.000Z', '2024-02-29T15:00:00.000Z'],
    ['2026-12-31', '2026-12-31', '2026-12-30T15:00:00.000Z', '2026-12-31T15:00:00.000Z'],
    ['0099-01-01', '0099-01-01', '0098-12-31T15:00:00.000Z', '0099-01-01T15:00:00.000Z'],
  ])('uses inclusive Japanese calendar days %s to %s', (from, to, start, end) => {
    expect(organizationPaymentExportPeriod(new URLSearchParams({ from, to }))).toEqual({
      from,
      to,
      createdAt: { gte: new Date(start), lt: new Date(end) },
    });
  });

  it.each([
    'from=2026-09-01',
    'to=2026-09-01',
    'from=&to=2026-09-01',
    'from=2026-09-02&to=2026-09-01',
    'from=2026-02-29&to=2026-03-01',
    'from=2026-04-31&to=2026-05-01',
    'from=2026-00-01&to=2026-01-01',
    'from=0000-01-01&to=2026-01-01',
    'from=2026-9-01&to=2026-09-01',
    'from=2026-09-01T00:00:00Z&to=2026-09-01',
    'from=2026-09-01&from=2026-09-02&to=2026-09-03',
    'from=&from=&to=',
    'workspaceId=another',
    'limit=1',
  ])('rejects invalid/unpaired/ambiguous parameters: %s', (query) => {
    try {
      organizationPaymentExportPeriod(new URLSearchParams(query));
      expect.fail('must reject invalid period');
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).code).toBe('VALIDATION_ERROR');
    }
  });
});
