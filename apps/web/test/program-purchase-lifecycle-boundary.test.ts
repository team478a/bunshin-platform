import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const purchaseSource = readFileSync(
  new URL('../src/payments/program-purchase.ts', import.meta.url),
  'utf8',
);
const lifecycleSource = readFileSync(
  new URL('../src/payments/program-purchase-lifecycle.ts', import.meta.url),
  'utf8',
);

describe('program purchase lifecycle boundary', () => {
  it('keeps the existing lifecycle exports stable', () => {
    expect(purchaseSource).toContain("from './program-purchase-lifecycle'");
    expect(purchaseSource).toContain('expireProgramCheckout');
    expect(purchaseSource).toContain('refundPaidProgramPurchase');
    expect(purchaseSource).toContain('expireEndedPaidProgramEnrollments');
  });

  it('isolates checkout expiry, refunds and paid enrollment expiry', () => {
    expect(lifecycleSource).toContain("status: 'EXPIRED'");
    expect(lifecycleSource).toContain("eventType: 'PAYMENT_REFUNDED'");
    expect(lifecycleSource).toContain("eventType: 'PAID_PROGRAM_EXPIRED'");
    expect(lifecycleSource).toContain("isolationLevel: 'Serializable'");
    expect(purchaseSource).not.toContain("eventType: 'PAYMENT_REFUNDED'");
    expect(purchaseSource).not.toContain("eventType: 'PAID_PROGRAM_EXPIRED'");
  });
});
