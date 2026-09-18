import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const http = readFileSync(new URL('../src/http/program-checkout.ts', import.meta.url), 'utf8');
const purchase = readFileSync(
  new URL('../src/payments/program-purchase.ts', import.meta.url),
  'utf8',
);

describe('OEM program checkout boundary', () => {
  it('authenticates checkout and derives tenant, buyer and amount on the server', () => {
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('resolveMemberServiceContext(serviceSlug, actor.userId)');
    expect(purchase).toContain('amountYen: context.terms.amountYen');
    expect(purchase).toContain('paymentConfigurationId: context.paymentConfiguration.id');
  });

  it('verifies the raw webhook before parsing and cross-checks purchase ownership', () => {
    expect(http.indexOf('await request.text()')).toBeLessThan(http.indexOf('JSON.parse(rawBody)'));
    expect(http.indexOf('verifyStripeWebhookSignature')).toBeLessThan(
      http.indexOf('JSON.parse(rawBody)'),
    );
    expect(purchase).toContain('workspaceId: configuration.workspaceId');
    expect(purchase).toContain('paymentConfigurationId: configuration.id');
    expect(purchase).toContain('purchase.amountYen !== input.amountTotal');
  });

  it('records idempotent provider events and enrollments', () => {
    expect(purchase).toContain('paymentConfigurationId_providerEventId');
    expect(purchase).toContain('stripe:checkout:${input.checkoutSessionId}');
    expect(purchase).toContain("status: 'PAID'");
  });
});
