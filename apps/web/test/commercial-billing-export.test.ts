import { describe, expect, it } from 'vitest';
import { commercialBillingCsvRows } from '../src/http/commercial-billing-export';
import { csv } from '../src/http/admin-report-export';

describe('commercial billing CSV', () => {
  it('exports accounting identifiers while preserving spreadsheet safety', () => {
    const rows = commercialBillingCsvRows([
      {
        invoiceNumber: 'WW-202608-ABC',
        status: 'ISSUED',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        mau: 75,
        pricingTierKey: 'MAU_0_100',
        pricingVersion: 'v1',
        amountYen: 19_800,
        externalInvoiceReference: '=unsafe',
        paymentReference: null,
        notes: null,
        issuedAt: new Date('2026-09-01T00:00:00.000Z'),
        dueAt: new Date('2026-10-01T00:00:00.000Z'),
        paidAt: null,
        workspace: { name: '運営団体A', legalName: '株式会社A' },
        contract: {
          billingName: '経理担当',
          billingEmail: 'billing@example.com',
          externalCustomerReference: 'C-1',
        },
      },
    ]);
    const output = csv(rows);
    expect(output).toContain('WW-202608-ABC');
    expect(output).toContain('"19800"');
    expect(output).toContain("'=unsafe");
  });

  it('exports setup fees separately from monthly headcount billing', () => {
    const rows = commercialBillingCsvRows([
      {
        kind: 'SETUP_FEE',
        invoiceNumber: 'WW-SETUP-20261010-ABC',
        status: 'DRAFT',
        periodStart: new Date('2026-10-10T00:00:00.000Z'),
        mau: 0,
        pricingTierKey: 'SETUP_FEE',
        pricingVersion: 'AGREEMENT_SNAPSHOT_V1',
        amountYen: 300_000,
        externalInvoiceReference: null,
        paymentReference: null,
        notes: null,
        issuedAt: null,
        dueAt: null,
        paidAt: null,
        workspace: { name: '運営団体A', legalName: '株式会社A' },
        contract: {
          billingName: '経理担当',
          billingEmail: 'billing@example.com',
          externalCustomerReference: 'C-1',
        },
        setupFeeCharge: {
          description: 'OEM導入初期設定費用',
          agreementReference: 'agreement-2026-a',
          product: { key: 'SERVICE_A', displayName: 'サービスA' },
        },
      },
    ]);
    const output = csv(rows);
    expect(output).toContain('初期費用');
    expect(output).toContain('サービスA');
    expect(output).toContain('agreement-2026-a');
    expect(output).toContain('SETUP_FEE_AGREEMENT_V1');
  });
});
