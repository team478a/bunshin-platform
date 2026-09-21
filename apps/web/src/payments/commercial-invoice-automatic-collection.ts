import 'server-only';
import type { Prisma, PrismaClient } from '@bunshin/database';
import { platformBillingStripeSecretKey } from './commercial-invoice-payment';
import { StripeCommercialInvoiceCollectionAdapter } from './secure-configuration';

type CollectionAdapter = Pick<StripeCommercialInvoiceCollectionAdapter, 'collect'>;

export type AutomaticCollectionSummary = {
  candidates: number;
  paid: number;
  requiresAction: number;
  failed: number;
};

export async function collectCommercialInvoices(
  client: PrismaClient,
  input: { now?: Date; limit?: number } = {},
  adapter: CollectionAdapter = new StripeCommercialInvoiceCollectionAdapter(),
): Promise<AutomaticCollectionSummary> {
  const now = input.now ?? new Date();
  const retryBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const invoices = await client.tenantInvoice.findMany({
    where: {
      status: 'ISSUED',
      issuedAt: { not: null, lte: now },
      OR: [{ paymentAttemptedAt: null }, { paymentAttemptedAt: { lt: retryBefore } }],
      contract: {
        status: 'ACTIVE',
        billingMode: 'EXTERNAL_BILLING',
        automaticCollectionEnabled: true,
        automaticCollectionConsentAt: { not: null },
        stripeCustomerId: { not: null },
        stripePaymentMethodId: { not: null },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
    },
    include: { contract: true },
    orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(input.limit ?? 100, 1), 500),
  });
  const summary: AutomaticCollectionSummary = {
    candidates: invoices.length,
    paid: 0,
    requiresAction: 0,
    failed: 0,
  };
  if (!invoices.length) return summary;
  const secretKey = platformBillingStripeSecretKey();
  for (const invoice of invoices) {
    const customerId = invoice.contract.stripeCustomerId;
    const paymentMethodId = invoice.contract.stripePaymentMethodId;
    if (!customerId || !paymentMethodId) continue;
    let result;
    try {
      result = await adapter.collect({
        secretKey,
        idempotencyKey: `platform-invoice-auto:${invoice.id}`,
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        invoiceNumber: invoice.invoiceNumber,
        amountYen: invoice.amountYen,
        customerId,
        paymentMethodId,
      });
    } catch {
      result = {
        paymentIntentId: null,
        outcome: 'FAILED' as const,
        failureCategory: 'NETWORK_ERROR',
      };
    }
    if (result.outcome === 'SUCCEEDED' && result.paymentIntentId) {
      const paid = await client.$transaction(async (tx) => {
        const updated = await tx.tenantInvoice.updateMany({
          where: { id: invoice.id, workspaceId: invoice.workspaceId, status: 'ISSUED' },
          data: {
            status: 'PAID',
            paymentProvider: 'STRIPE',
            providerPaymentIntentId: result.paymentIntentId,
            paymentReference: result.paymentIntentId,
            paymentAttemptedAt: now,
            paymentFailedAt: null,
            paymentFailureCategory: null,
            paidAt: now,
            checkoutUrl: null,
            checkoutExpiresAt: null,
          },
        });
        if (updated.count !== 1) return false;
        await tx.commercialBillingAudit.create({
          data: {
            workspaceId: invoice.workspaceId,
            actorUserId: invoice.updatedByUserId,
            entityType: 'INVOICE',
            entityId: invoice.id,
            action: 'AUTO_PAYMENT_CONFIRMED',
            beforeData: JSON.parse(JSON.stringify(invoice)) as Prisma.InputJsonValue,
            afterData: {
              status: 'PAID',
              providerPaymentIntentId: result.paymentIntentId,
              paidAt: now.toISOString(),
            },
          },
        });
        return true;
      });
      if (paid) summary.paid += 1;
      continue;
    }
    await client.tenantInvoice.updateMany({
      where: { id: invoice.id, workspaceId: invoice.workspaceId, status: 'ISSUED' },
      data: {
        paymentProvider: 'STRIPE',
        providerPaymentIntentId: result.paymentIntentId,
        paymentAttemptedAt: now,
        paymentFailedAt: now,
        paymentFailureCategory: result.failureCategory ?? 'PROVIDER_ERROR',
      },
    });
    if (result.outcome === 'REQUIRES_ACTION') summary.requiresAction += 1;
    else summary.failed += 1;
  }
  return summary;
}
