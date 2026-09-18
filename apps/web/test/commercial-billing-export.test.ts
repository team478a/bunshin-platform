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
});
