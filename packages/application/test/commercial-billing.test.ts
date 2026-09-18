import { describe, expect, it } from 'vitest';
import {
  nextTenantInvoiceStatus,
  tenantInvoiceDueAt,
  tenantInvoiceNumber,
} from '../src/commercial-billing';

describe('tenant invoice lifecycle', () => {
  it('allows the supported manual billing transitions', () => {
    expect(nextTenantInvoiceStatus('DRAFT', 'ISSUE')).toBe('ISSUED');
    expect(nextTenantInvoiceStatus('ISSUED', 'MARK_PAID')).toBe('PAID');
    expect(nextTenantInvoiceStatus('DRAFT', 'VOID')).toBe('VOID');
  });

  it('does not rewrite paid or void invoices', () => {
    expect(() => nextTenantInvoiceStatus('PAID', 'VOID')).toThrow();
    expect(() => nextTenantInvoiceStatus('VOID', 'ISSUE')).toThrow();
  });

  it('calculates the due date and a stable monthly invoice number', () => {
    expect(tenantInvoiceDueAt(new Date('2026-09-01T00:00:00.000Z'), 30)).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(
      tenantInvoiceNumber(
        new Date('2026-08-01T00:00:00.000Z'),
        '12345678-1234-4000-8000-123456789abc',
      ),
    ).toBe('WW-202608-12345678123440008000123456789ABC');
  });
});
