import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { csv } from '../src/http/admin-report-export';
import { organizationPaymentCsvRows } from '../src/http/organization-payment-export';

describe('organization payment CSV', () => {
  it('exports gross, refunded, and net amounts with spreadsheet-safe values', () => {
    const rows = organizationPaymentCsvRows(
      [
        {
          id: 'purchase-a',
          groupId: 'group-a',
          status: 'PAID',
          amountYen: 29_800,
          refundedAmountYen: 5_000,
          disputedAmountYen: 8_000,
          currency: 'JPY',
          createdAt: new Date('2026-09-18T00:00:00.000Z'),
          paidAt: new Date('2026-09-18T00:01:00.000Z'),
          refundedAt: null,
          disputedAt: new Date('2026-09-18T00:02:00.000Z'),
          disputeResolvedAt: null,
          providerDisputeId: 'du-a',
          disputeStatus: 'under_review',
          expiredAt: null,
          providerCheckoutSessionId: '=unsafe',
          providerPaymentIntentId: 'pi-a',
          buyer: { displayName: '購入者', email: 'buyer@example.com' },
        },
      ],
      new Map([['group-a', 'サービスA']]),
    );
    const output = csv(rows);

    expect(output).toContain('"29800","5000","8000","21800"');
    expect(output).toContain('under_review');
    expect(output).toContain('サービスA');
    expect(output).toContain("'=unsafe");
    expect(output.charCodeAt(0)).toBe(0xfeff);
  });
});
