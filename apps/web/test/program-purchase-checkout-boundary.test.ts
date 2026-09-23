import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const purchaseSource = readFileSync(
  new URL('../src/payments/program-purchase.ts', import.meta.url),
  'utf8',
);
const checkoutSource = readFileSync(
  new URL('../src/payments/program-purchase-checkout.ts', import.meta.url),
  'utf8',
);

describe('program purchase checkout boundary', () => {
  it('keeps the existing purchase module exports stable', () => {
    expect(purchaseSource).toContain("from './program-purchase-checkout'");
    expect(purchaseSource).toContain('createProgramCheckout');
    expect(purchaseSource).toContain('createDirectProgramCheckout');
  });

  it('isolates checkout session creation from webhook lifecycle processing', () => {
    expect(checkoutSource).toContain('new StripeCheckoutAdapter()');
    expect(checkoutSource).toContain('validatedPurchaseContext(client, input)');
    expect(checkoutSource).toContain('validatedDirectPurchaseContext(client, input)');
    expect(purchaseSource).not.toContain('new StripeCheckoutAdapter()');
    expect(purchaseSource).not.toContain('getServerEnvironment()');
  });
});
