import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const purchaseSource = readFileSync(
  new URL('../src/payments/program-purchase.ts', import.meta.url),
  'utf8',
);
const completionSource = readFileSync(
  new URL('../src/payments/program-purchase-completion.ts', import.meta.url),
  'utf8',
);

describe('program purchase completion boundary', () => {
  it('keeps the existing completion export stable', () => {
    expect(purchaseSource).toContain("from './program-purchase-completion'");
    expect(purchaseSource).toContain('completePaidProgramPurchase');
  });

  it('isolates paid enrollment creation and purchase verification', () => {
    expect(completionSource).toContain('purchase.amountYen !== input.amountTotal');
    expect(completionSource).toContain("eventType: 'PAID_ENROLLED'");
    expect(completionSource).toContain('stripe:checkout:${input.checkoutSessionId}');
    expect(completionSource).toContain("isolationLevel: 'Serializable'");
    expect(purchaseSource).not.toContain("eventType: 'PAID_ENROLLED'");
  });
});
