import { describe, expect, it } from 'vitest';

import * as secureConfiguration from '../src/payments/secure-configuration';
import { AesGcmPaymentSecretCrypto } from '../src/payments/payment-secret-crypto';
import { StripeAccountConnectionTestAdapter } from '../src/payments/stripe-account-connection';
import { StripeCommercialInvoiceCollectionAdapter } from '../src/payments/stripe-automatic-collection';
import { StripeCheckoutAdapter } from '../src/payments/stripe-checkout';
import { StripeEventRetrievalAdapter } from '../src/payments/stripe-object-retrieval';
import { verifyStripeWebhookSignature } from '../src/payments/stripe-webhook-signature';

describe('payment secure configuration module boundaries', () => {
  it('preserves the compatibility exports', () => {
    expect(secureConfiguration.AesGcmPaymentSecretCrypto).toBe(AesGcmPaymentSecretCrypto);
    expect(secureConfiguration.StripeCheckoutAdapter).toBe(StripeCheckoutAdapter);
    expect(secureConfiguration.verifyStripeWebhookSignature).toBe(verifyStripeWebhookSignature);
  });

  it('exposes each Stripe responsibility from its dedicated module', () => {
    expect(StripeAccountConnectionTestAdapter).toBeTypeOf('function');
    expect(StripeCommercialInvoiceCollectionAdapter).toBeTypeOf('function');
    expect(StripeEventRetrievalAdapter).toBeTypeOf('function');
  });
});
