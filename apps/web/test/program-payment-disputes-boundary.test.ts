import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const purchaseSource = readFileSync(
  new URL('../src/payments/program-purchase.ts', import.meta.url),
  'utf8',
);
const disputeSource = readFileSync(
  new URL('../src/payments/program-payment-disputes.ts', import.meta.url),
  'utf8',
);

describe('program payment dispute boundary', () => {
  it('keeps the existing dispute export stable', () => {
    expect(purchaseSource).toContain("from './program-payment-disputes'");
    expect(purchaseSource).toContain('applyProgramPaymentDispute');
  });

  it('isolates dispute, recovery and chargeback handling', () => {
    expect(disputeSource).toContain("eventType = 'PAYMENT_DISPUTED'");
    expect(disputeSource).toContain("eventType = 'PAYMENT_DISPUTE_WON'");
    expect(disputeSource).toContain("eventType = 'PAYMENT_CHARGEBACK_LOST'");
    expect(disputeSource).toContain("isolationLevel: 'Serializable'");
    expect(disputeSource).toContain('workspaceId: configuration.workspaceId');
    expect(purchaseSource).not.toContain("eventType = 'PAYMENT_DISPUTED'");
  });
});
