import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const products = readFileSync(new URL('../src/http/program-products.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../src/http/program-checkout.ts', import.meta.url), 'utf8');
const purchase = readFileSync(
  new URL('../src/payments/program-purchase.ts', import.meta.url),
  'utf8',
);

describe('generic program commerce boundaries', () => {
  it('configures products only through a managed service scope and versions conditions', () => {
    expect(products).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
    expect(products).toContain('workspaceId: service.workspaceId');
    expect(products).toContain('groupId: service.serviceId');
    expect(products).toContain("data: { status: 'SUPERSEDED' }");
    expect(products).toContain('createProgramProductTerms');
    expect(products).toContain("'COMMERCE_DISCLOSURE'");
    expect(products).toContain("status: 'PUBLISHED'");
  });

  it('authenticates direct checkout and never accepts price from the browser', () => {
    expect(checkout).toContain('resolveMemberServiceContext(serviceSlug, actor.userId)');
    expect(checkout).toContain('createDirectProgramCheckout');
    expect(purchase).toContain('amountYen: context.terms.amountYen');
    expect(purchase).toContain('sourceEnrollmentId: null');
    expect(purchase).toContain('commerce legal documents are not ready');
  });
});
