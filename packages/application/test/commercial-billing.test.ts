import { describe, expect, it } from 'vitest';
import {
  assertOemSetupFeeCharge,
  isTenantInvoiceOverdue,
  nextTenantInvoiceStatus,
  summarizeCommercialInvoices,
  tenantInvoiceDueAt,
  tenantInvoiceNumber,
  tenantSetupFeeInvoiceNumber,
} from '../src/commercial-billing';

describe('tenant invoice lifecycle', () => {
  it('allows the supported manual billing transitions', () => {
    expect(nextTenantInvoiceStatus('DRAFT', 'ISSUE')).toBe('ISSUED');
    expect(nextTenantInvoiceStatus('ISSUED', 'MARK_PAID')).toBe('PAID');
    expect(nextTenantInvoiceStatus('DRAFT', 'VOID')).toBe('VOID');
  });

  it('summarizes receivables and treats only issued past-due invoices as overdue', () => {
    const now = new Date('2026-09-18T00:00:00.000Z');
    const summary = summarizeCommercialInvoices(
      [
        { status: 'DRAFT', amountYen: 19_800, dueAt: null },
        { status: 'ISSUED', amountYen: 39_800, dueAt: new Date('2026-09-17T00:00:00Z') },
        { status: 'ISSUED', amountYen: 59_800, dueAt: new Date('2026-09-30T00:00:00Z') },
        { status: 'PAID', amountYen: 99_800, dueAt: new Date('2026-09-01T00:00:00Z') },
        { status: 'VOID', amountYen: 1, dueAt: new Date('2026-09-01T00:00:00Z') },
      ],
      now,
    );
    expect(summary).toEqual({
      draftCount: 1,
      draftAmountYen: 19_800,
      outstandingCount: 2,
      outstandingAmountYen: 99_600,
      overdueCount: 1,
      overdueAmountYen: 39_800,
      paidCount: 1,
      paidAmountYen: 99_800,
    });
    expect(isTenantInvoiceOverdue({ status: 'PAID', dueAt: new Date(0) }, now)).toBe(false);
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

  it('validates a reviewed setup fee and creates a separate stable invoice number', () => {
    const charge = {
      chargeKey: 'SIGNED_AGREEMENT_2026_A',
      amountYen: 300_000,
      description: 'OEM導入初期設定費用',
      agreementReference: 'agreement-2026-a',
      agreedAt: new Date('2026-10-10T00:00:00.000Z'),
      reason: '締結済み契約書の金額を確認したため',
    };
    expect(() =>
      assertOemSetupFeeCharge(charge, new Date('2026-10-11T00:00:00.000Z')),
    ).not.toThrow();
    expect(
      tenantSetupFeeInvoiceNumber(charge.agreedAt, '12345678-1234-4000-8000-123456789abc'),
    ).toBe('WW-SETUP-20261010-12345678123440008000123456789ABC');
  });

  it('rejects unreviewed or unsafe setup fee inputs', () => {
    expect(() =>
      assertOemSetupFeeCharge({
        chargeKey: 'bad key',
        amountYen: 0,
        description: '',
        agreementReference: '',
        agreedAt: new Date('2026-10-12T00:00:00.000Z'),
        reason: 'short',
      }),
    ).toThrow();
  });
});
