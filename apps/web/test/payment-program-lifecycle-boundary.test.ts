import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('payment program lifecycle boundaries', () => {
  it('accepts only the supported Stripe lifecycle events', () => {
    const webhook = source('../src/http/program-checkout.ts');
    expect(webhook).toContain("event.type === 'checkout.session.expired'");
    expect(webhook).toContain("event.type === 'charge.refunded'");
    expect(webhook).toContain('verifyStripeWebhookSignature');
  });

  it('runs paid program expiration behind the protected production cron', () => {
    const operation = source('../src/http/program-payment-lifecycle.ts');
    const vercel = source('../vercel.json');
    expect(operation).toContain('authorizeCronRequest(request, environment.CRON_SECRET)');
    expect(operation).toContain("environment.APP_ENV !== 'production'");
    expect(vercel).toContain('/api/internal/payments/expire-programs');
  });
});
