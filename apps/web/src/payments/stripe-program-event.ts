import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@bunshin/database';
import { z } from 'zod';
import {
  applyProgramPaymentDispute,
  completePaidProgramPurchase,
  expireProgramCheckout,
  refundPaidProgramPurchase,
} from './program-purchase';
import { currentPaymentEnvironment } from './secure-configuration';

export type StripeProgramEvent = {
  id?: unknown;
  type?: unknown;
  livemode?: unknown;
  data?: {
    object?: {
      id?: unknown;
      payment_status?: unknown;
      payment_intent?: unknown;
      amount_total?: unknown;
      amount?: unknown;
      amount_refunded?: unknown;
      currency?: unknown;
      refunded?: unknown;
      status?: unknown;
      metadata?: Record<string, unknown>;
    };
  };
};

export async function processStripeProgramEvent(
  db: PrismaClient,
  configurationId: string,
  event: StripeProgramEvent,
  payloadDigest: string,
) {
  if (typeof event.id !== 'string' || typeof event.type !== 'string') {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe event');
  }
  const configuration = await db.organizationPaymentConfiguration.findFirst({
    where: {
      id: configurationId,
      environment: currentPaymentEnvironment(),
      provider: 'STRIPE',
      status: { in: ['ACTIVE', 'DISABLED'] },
    },
    select: { id: true, workspaceId: true },
  });
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'payment webhook unavailable');

  const session = event.data?.object;
  if (event.type === 'checkout.session.expired') {
    const purchaseId = session?.metadata?.['purchase_id'];
    if (
      typeof session?.id !== 'string' ||
      typeof purchaseId !== 'string' ||
      typeof event.livemode !== 'boolean'
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'incomplete Stripe checkout event');
    }
    await expireProgramCheckout(db, {
      configurationId: configuration.id,
      providerEventId: event.id,
      eventType: event.type,
      payloadDigest,
      purchaseId: z.string().uuid().parse(purchaseId),
      checkoutSessionId: session.id,
      livemode: event.livemode,
    });
    return;
  }

  if (event.type === 'charge.refunded') {
    if (
      typeof session?.payment_intent !== 'string' ||
      typeof session.amount !== 'number' ||
      typeof session.amount_refunded !== 'number' ||
      typeof session.currency !== 'string' ||
      typeof session.refunded !== 'boolean' ||
      typeof event.livemode !== 'boolean'
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'incomplete Stripe refund event');
    }
    await refundPaidProgramPurchase(db, {
      configurationId: configuration.id,
      providerEventId: event.id,
      eventType: event.type,
      payloadDigest,
      paymentIntentId: session.payment_intent,
      amount: session.amount,
      amountRefunded: session.amount_refunded,
      currency: session.currency,
      fullyRefunded: session.refunded,
      livemode: event.livemode,
    });
    return;
  }

  if (
    [
      'charge.dispute.created',
      'charge.dispute.updated',
      'charge.dispute.closed',
      'charge.dispute.funds_withdrawn',
      'charge.dispute.funds_reinstated',
    ].includes(event.type)
  ) {
    if (
      typeof session?.id !== 'string' ||
      typeof session.payment_intent !== 'string' ||
      typeof session.amount !== 'number' ||
      typeof session.currency !== 'string' ||
      typeof session.status !== 'string' ||
      typeof event.livemode !== 'boolean'
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'incomplete Stripe dispute event');
    }
    await applyProgramPaymentDispute(db, {
      configurationId: configuration.id,
      providerEventId: event.id,
      eventType: event.type,
      payloadDigest,
      paymentIntentId: session.payment_intent,
      disputeId: session.id,
      amount: session.amount,
      currency: session.currency,
      disputeStatus: session.status,
      livemode: event.livemode,
    });
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    await db.paymentWebhookEvent.upsert({
      where: {
        paymentConfigurationId_providerEventId: {
          paymentConfigurationId: configuration.id,
          providerEventId: event.id,
        },
      },
      create: {
        workspaceId: configuration.workspaceId,
        paymentConfigurationId: configuration.id,
        providerEventId: event.id,
        eventType: event.type,
        payloadDigest,
        status: 'IGNORED',
        processedAt: new Date(),
      },
      update: {},
    });
    return;
  }

  const purchaseId = session?.metadata?.['purchase_id'];
  if (
    session?.payment_status !== 'paid' ||
    typeof session.id !== 'string' ||
    typeof purchaseId !== 'string' ||
    typeof session.amount_total !== 'number' ||
    typeof session.currency !== 'string' ||
    typeof event.livemode !== 'boolean'
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'incomplete Stripe checkout event');
  }
  await completePaidProgramPurchase(db, {
    configurationId: configuration.id,
    providerEventId: event.id,
    eventType: event.type,
    payloadDigest,
    purchaseId: z.string().uuid().parse(purchaseId),
    checkoutSessionId: session.id,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    amountTotal: session.amount_total,
    currency: session.currency,
    livemode: event.livemode,
  });
}
