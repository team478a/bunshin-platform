import 'server-only';

import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import type { StripeProgramEvent } from '../payments/stripe-program-event';

const uuid = z.string().uuid();
const eventId = z.string().min(1).max(200);
const sessionId = z.string().startsWith('cs_').max(200);
const paymentIntentId = z.string().startsWith('pi_').max(200);

export async function processFortuneStripeEvent(
  db: PrismaClient,
  configuration: { id: string; workspaceId: string },
  event: StripeProgramEvent,
  payloadDigest: string,
): Promise<boolean> {
  const object = event.data?.object;
  const tagged = object?.metadata?.['purchase_kind'] === 'fortune';
  const refund = event.type === 'charge.refunded';
  const completed = event.type === 'checkout.session.completed';
  const expired = event.type === 'checkout.session.expired';
  const failed = event.type === 'payment_intent.payment_failed';
  if (!object || (!tagged && !refund) || (!refund && !completed && !expired && !failed))
    return tagged;
  const purchaseId = tagged ? uuid.parse(object.metadata?.['purchase_id']) : null;
  const intentId = refund || completed ? paymentIntentId.parse(object.payment_intent) : null;
  const providerEventId = eventId.parse(event.id);
  const eventType = z.string().parse(event.type);
  const checkoutId = refund || failed ? null : sessionId.parse(object.id);

  return db.$transaction(async (tx) => {
    const scope = {
      workspaceId: configuration.workspaceId,
      paymentConfigurationId: configuration.id,
    };
    const purchase = await tx.fortuneCommercePurchase.findFirst({
      where: {
        ...scope,
        ...(purchaseId ? { id: purchaseId } : { providerPaymentIntentId: intentId }),
      },
    });
    if (!purchase) {
      if (tagged) throw new ApplicationError('NOT_FOUND', 'fortune purchase not found');
      return false;
    }
    if (
      event.livemode !== purchase.liveMode ||
      (tagged && object.metadata?.['workspace_id'] !== purchase.workspaceId) ||
      (checkoutId && object.metadata?.['offering_id'] !== purchase.productRevision)
    )
      throw new ApplicationError('FORBIDDEN', 'fortune Stripe event scope mismatch');

    await tx.$queryRaw`SELECT id FROM fortune_commerce_purchases
      WHERE id = ${purchase.id}::uuid AND workspace_id = ${scope.workspaceId}::uuid
        AND payment_configuration_id = ${scope.paymentConfigurationId}::uuid FOR UPDATE`;
    const current = await tx.fortuneCommercePurchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    const key = { paymentConfigurationId: configuration.id, providerEventId };
    const previous = await tx.paymentWebhookEvent.findUnique({
      where: { paymentConfigurationId_providerEventId: key },
    });
    if (previous) {
      if (previous.payloadDigest !== payloadDigest)
        throw new ApplicationError('CONFLICT', 'Stripe event digest mismatch');
      return true;
    }
    if (
      (checkoutId &&
        current.providerCheckoutSessionId &&
        current.providerCheckoutSessionId !== checkoutId) ||
      (intentId && current.providerPaymentIntentId && current.providerPaymentIntentId !== intentId)
    )
      throw new ApplicationError('CONFLICT', 'fortune Stripe object mismatch');

    const now = new Date();
    if (completed) {
      if (
        object.payment_status !== 'paid' ||
        object.amount_total !== current.amountYen ||
        object.currency !== 'jpy'
      )
        throw new ApplicationError('VALIDATION_ERROR', 'fortune paid amount mismatch');
      await tx.fortuneCommercePurchase.update({
        where: { id: current.id },
        data: {
          paidAt: current.paidAt ?? now,
          status: current.status === 'REFUNDED' ? 'REFUNDED' : 'PAID',
          providerCheckoutSessionId: checkoutId,
          providerPaymentIntentId: intentId,
        },
      });
    } else if (expired && current.status === 'PENDING') {
      await tx.fortuneCommercePurchase.update({
        where: { id: current.id },
        data: { status: 'EXPIRED', providerCheckoutSessionId: checkoutId },
      });
    } else if (failed && current.status === 'PENDING') {
      if (object.amount !== current.amountYen || object.currency !== 'jpy')
        throw new ApplicationError('VALIDATION_ERROR', 'fortune failed amount mismatch');
      await tx.fortuneCommercePurchase.update({
        where: { id: current.id },
        data: { paymentFailedAt: now },
      });
    } else if (refund) {
      const amount = z
        .number()
        .int()
        .positive()
        .max(current.amountYen)
        .parse(object.amount_refunded);
      if (
        object.amount !== current.amountYen ||
        object.currency !== 'jpy' ||
        object.refunded !== (amount === current.amountYen)
      )
        throw new ApplicationError('VALIDATION_ERROR', 'fortune refund amount mismatch');
      if (amount > current.refundedAmountYen) {
        await tx.fortuneCommercePurchase.update({
          where: { id: current.id },
          data: {
            refundedAmountYen: amount,
            refundedAt: now,
            providerPaymentIntentId: intentId,
            ...(amount === current.amountYen
              ? { status: 'REFUNDED', ...(current.deliveredAt ? {} : { readingId: null }) }
              : {}),
          },
        });
      }
    }

    await tx.paymentWebhookEvent.create({
      data: {
        ...key,
        workspaceId: scope.workspaceId,
        eventType,
        payloadDigest,
        status: 'PROCESSED',
        processedAt: now,
      },
    });
    return true;
  });
}
