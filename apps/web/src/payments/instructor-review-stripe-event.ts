import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import {
  INSTRUCTOR_REVIEW_KIND,
  instructorReviewResponseDueAt,
  type InstructorReviewStatus,
} from '../services/instructor-review-contract';
import type { StripeProgramEvent } from './stripe-program-event';

const providerEvent = z.object({
  id: z.string().min(1).max(200),
  livemode: z.boolean(),
  created: z.number().int().positive().max(253402300799),
});

const checkoutScope = z.object({
  purchase_id: z.uuid(),
  workspace_id: z.uuid(),
  offering_id: z.uuid(),
});

const stripeSession = z.object({ id: z.string().startsWith('cs_').max(200) });
const stripeIntent = z.string().startsWith('pi_').max(200);

export function parseInstructorReviewStripeEvent(event: StripeProgramEvent) {
  const object = event.data?.object;
  if (!object) return null;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (object.metadata?.['purchase_kind'] !== INSTRUCTOR_REVIEW_KIND) return null;
      const { id, livemode, created } = providerEvent.parse(event);
      const payment = stripeSession
        .extend({
          payment_status: z.literal('paid'),
          payment_intent: stripeIntent,
          amount_total: z.number().int().positive(),
          currency: z.literal('jpy'),
          metadata: checkoutScope,
        })
        .parse(object);
      return { type: event.type, id, livemode, at: new Date(created * 1000), payment } as const;
    }
    case 'checkout.session.expired': {
      if (object.metadata?.['purchase_kind'] !== INSTRUCTOR_REVIEW_KIND) return null;
      const { id, livemode, created } = providerEvent.parse(event);
      const payment = stripeSession.extend({ metadata: checkoutScope }).parse(object);
      return { type: event.type, id, livemode, at: new Date(created * 1000), payment } as const;
    }
    case 'charge.refunded': {
      const { id, livemode, created } = providerEvent.parse(event);
      const payment = z
        .object({
          payment_intent: stripeIntent,
          amount: z.number().int().positive(),
          amount_refunded: z.number().int().positive(),
          currency: z.string(),
          refunded: z.boolean(),
        })
        .parse(object);
      return { type: event.type, id, livemode, at: new Date(created * 1000), payment } as const;
    }
    default:
      return null;
  }
}

export type InstructorReviewStripeEvent = NonNullable<
  ReturnType<typeof parseInstructorReviewStripeEvent>
>;

export function instructorReviewPaymentChange(
  event: InstructorReviewStripeEvent,
  order: {
    id: string;
    workspaceId: string;
    productRevision: string;
    liveMode: boolean;
    status: InstructorReviewStatus;
    amountYen: number;
    responseHours: number;
    providerCheckoutSessionId: string | null;
    providerPaymentIntentId: string | null;
    paidAt: Date | null;
  },
) {
  if (event.livemode !== order.liveMode)
    throw new ApplicationError('FORBIDDEN', 'Stripe environment mismatch');

  if (event.type === 'charge.refunded') {
    if (
      event.payment.payment_intent !== order.providerPaymentIntentId ||
      event.payment.amount !== order.amountYen ||
      event.payment.currency !== 'jpy' ||
      event.payment.amount_refunded > order.amountYen ||
      event.payment.refunded !== (event.payment.amount_refunded === order.amountYen)
    ) {
      throw new ApplicationError('CONFLICT', 'Stripe refund mismatch');
    }
    return event.payment.refunded ? { status: 'REFUNDED' as const } : null;
  }

  const metadata = event.payment.metadata;
  if (
    metadata.purchase_id !== order.id ||
    metadata.workspace_id !== order.workspaceId ||
    metadata.offering_id !== order.productRevision ||
    (order.providerCheckoutSessionId && order.providerCheckoutSessionId !== event.payment.id)
  ) {
    throw new ApplicationError('FORBIDDEN', 'Stripe checkout scope mismatch');
  }

  if (event.type === 'checkout.session.expired') {
    return order.status === 'PENDING_PAYMENT'
      ? { status: 'CANCELLED' as const, providerCheckoutSessionId: event.payment.id }
      : null;
  }

  if (
    event.payment.amount_total !== order.amountYen ||
    (order.providerPaymentIntentId &&
      order.providerPaymentIntentId !== event.payment.payment_intent)
  ) {
    throw new ApplicationError('CONFLICT', 'Stripe paid amount or intent mismatch');
  }
  if (order.paidAt || order.status === 'REFUNDED') return null;
  return {
    status: 'ACCEPTED' as const,
    providerCheckoutSessionId: event.payment.id,
    providerPaymentIntentId: event.payment.payment_intent,
    paidAt: event.at,
    dueAt: instructorReviewResponseDueAt(event.at, order.responseHours),
  };
}
