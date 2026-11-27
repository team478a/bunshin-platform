import type { PrismaClient } from '@bunshin/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StripeCheckoutAdapter,
  StripeCheckoutExpirationAdapter,
  StripeFullRefundAdapter,
} from '../src/payments/stripe-checkout';
import {
  instructorReviewPaymentChange,
  parseInstructorReviewStripeEvent,
  processInstructorReviewStripeEvent,
} from '../src/payments/instructor-review-stripe-event';
import type { StripeProgramEvent } from '../src/payments/stripe-program-event';

vi.mock('server-only', () => ({}));

const purchaseId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '10000000-0000-4000-8000-000000000002';
const offeringId = '10000000-0000-4000-8000-000000000003';
const paidObject = {
  id: 'cs_test_1',
  payment_intent: 'pi_test1',
  payment_status: 'paid',
  amount_total: 1500,
  currency: 'jpy',
  metadata: {
    purchase_kind: 'instructor_review',
    purchase_id: purchaseId,
    workspace_id: workspaceId,
    offering_id: offeringId,
  },
};

function event(
  object: NonNullable<NonNullable<StripeProgramEvent['data']>['object']>,
): StripeProgramEvent {
  return {
    id: 'evt_1',
    type: 'checkout.session.completed',
    created: 1_800_000_000,
    livemode: false,
    data: { object },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('instructor review Stripe checkout', () => {
  it('identifies a one-time instructor review without sending private material to Stripe', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: 'cs_test_1', url: 'https://checkout.stripe.com/example' }),
      );
    vi.stubGlobal('fetch', fetcher);
    const session = await new StripeCheckoutAdapter().create({
      secretKey: 'synthetic',
      idempotencyKey: 'review-checkout',
      purchaseId,
      workspaceId,
      offeringId,
      productName: 'マナベル 講師レビュー',
      amountYen: 1500,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      instructorReview: { terms: '回答目安は2日' },
    });
    expect(session.id).toBe('cs_test_1');
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    if (!(init.body instanceof URLSearchParams)) throw new Error('expected form data');
    const fields = init.body;
    expect(fields.get('mode')).toBe('payment');
    expect(fields.get('metadata[purchase_kind]')).toBe('instructor_review');
    expect(fields.get('payment_intent_data[metadata][purchase_kind]')).toBe('instructor_review');
    expect(fields.get('line_items[0][price_data][unit_amount]')).toBe('1500');
    expect(fields.get('metadata[excerpt]')).toBeNull();
    expect(new Headers(init.headers).get('idempotency-key')).toBe('review-checkout');
  });

  it('only recognizes scoped paid Japanese yen Checkout completions', () => {
    expect(parseInstructorReviewStripeEvent(event(paidObject))).toMatchObject({
      type: 'checkout.session.completed',
      id: 'evt_1',
      livemode: false,
      payment: { amount_total: 1500, metadata: { purchase_id: purchaseId } },
    });
    expect(() =>
      parseInstructorReviewStripeEvent(event({ ...paidObject, payment_status: 'unpaid' })),
    ).toThrow();
    expect(() =>
      parseInstructorReviewStripeEvent(event({ ...paidObject, currency: 'usd' })),
    ).toThrow();
    expect(parseInstructorReviewStripeEvent(event({ ...paidObject, metadata: {} }))).toBeNull();
  });

  it('does not move an answered review backward on delayed checkout events', () => {
    const paid = parseInstructorReviewStripeEvent(event(paidObject));
    if (paid?.type !== 'checkout.session.completed') throw new Error('expected a paid event');
    const order = {
      id: purchaseId,
      workspaceId,
      productRevision: offeringId,
      liveMode: false,
      status: 'PENDING_PAYMENT' as const,
      amountYen: 1500,
      responseHours: 48,
      providerCheckoutSessionId: null,
      providerPaymentIntentId: null,
      paidAt: null,
    };
    expect(instructorReviewPaymentChange(paid, order)).toMatchObject({
      status: 'ACCEPTED',
      paidAt: paid.at,
      dueAt: new Date(paid.at.getTime() + 48 * 60 * 60 * 1000),
    });
    const answered = { ...order, status: 'ANSWERED' as const, paidAt: paid.at };
    expect(instructorReviewPaymentChange(paid, answered)).toBeNull();
    const expired = parseInstructorReviewStripeEvent({
      ...event(paidObject),
      type: 'checkout.session.expired',
    });
    if (expired?.type !== 'checkout.session.expired') throw new Error('expected an expired event');
    expect(instructorReviewPaymentChange(expired, answered)).toBeNull();
    expect(instructorReviewPaymentChange(expired, order)).toMatchObject({ status: 'CANCELLED' });
    expect(() => instructorReviewPaymentChange(paid, { ...order, amountYen: 2000 })).toThrow();
    expect(() => instructorReviewPaymentChange(paid, { ...order, liveMode: true })).toThrow();
  });

  it('uses stable keys to request checkout expiry and full refund', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'cs_test_1', status: 'expired' }))
      .mockResolvedValueOnce(Response.json({ payment_intent: 'pi_test1', status: 'pending' }));
    vi.stubGlobal('fetch', fetcher);
    await new StripeCheckoutExpirationAdapter().expire('synthetic', 'cs_test_1', 'expire-review');
    await new StripeFullRefundAdapter().request('synthetic', 'pi_test1', 'refund-review');
    const [cancelUrl, cancel] = fetcher.mock.calls[0] as [string, RequestInit];
    const [refundUrl, refund] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(cancelUrl).toMatch(/\/checkout\/sessions\/cs_test_1\/expire$/);
    expect(new Headers(cancel.headers).get('idempotency-key')).toBe('expire-review');
    expect(refundUrl).toMatch(/\/refunds$/);
    expect(new Headers(refund.headers).get('idempotency-key')).toBe('refund-review');
    if (!(refund.body instanceof URLSearchParams)) throw new Error('expected refund form data');
    expect(refund.body.get('payment_intent')).toBe('pi_test1');
  });
});

describe('instructor review signed event persistence', () => {
  it('records one payment, accepts a repeated event, and rejects a different digest', async () => {
    const order = {
      id: purchaseId,
      workspaceId,
      groupId: '10000000-0000-4000-8000-000000000008',
      paymentConfigurationId: '10000000-0000-4000-8000-000000000009',
      productRevision: offeringId,
      liveMode: false,
      status: 'PENDING_PAYMENT',
      amountYen: 1500,
      responseHours: 48,
      providerCheckoutSessionId: null,
      providerPaymentIntentId: null,
      paidAt: null,
    };
    const tx = {
      $queryRaw: vi.fn(),
      instructorReview: {
        findFirst: vi.fn().mockResolvedValue(order),
        findFirstOrThrow: vi.fn().mockResolvedValue(order),
        update: vi.fn(),
      },
      paymentWebhookEvent: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ payloadDigest: 'digest' }),
        create: vi.fn(),
      },
    };
    const fake = { $transaction: (run: (value: typeof tx) => unknown) => run(tx) };
    const db = fake as unknown as PrismaClient;
    const scope = { id: order.paymentConfigurationId, workspaceId };
    const input = event(paidObject);

    await expect(processInstructorReviewStripeEvent(db, scope, input, 'digest')).resolves.toBe(
      true,
    );
    await expect(processInstructorReviewStripeEvent(db, scope, input, 'digest')).resolves.toBe(
      true,
    );
    await expect(processInstructorReviewStripeEvent(db, scope, input, 'changed')).rejects.toThrow(
      'Stripe event digest mismatch',
    );
    expect(tx.instructorReview.update).toHaveBeenCalledTimes(1);
    expect(tx.instructorReview.update).toHaveBeenCalledWith({
      where: { id: purchaseId },
      data: expect.objectContaining({ status: 'ACCEPTED', providerPaymentIntentId: 'pi_test1' }),
    });
    expect(tx.paymentWebhookEvent.create).toHaveBeenCalledTimes(1);
  });

  it('can apply a scoped full refund that arrives before the checkout completion', () => {
    const parsed = parseInstructorReviewStripeEvent({
      ...event({
        amount: 1500,
        amount_refunded: 1500,
        refunded: true,
        payment_intent: 'pi_test1',
        currency: 'jpy',
      }),
      type: 'charge.refunded',
    });
    if (parsed?.type !== 'charge.refunded') throw new Error('expected refund event');
    const order = {
      id: purchaseId,
      workspaceId,
      productRevision: offeringId,
      liveMode: false,
      status: 'PENDING_PAYMENT' as const,
      amountYen: 1500,
      responseHours: 48,
      providerCheckoutSessionId: 'cs_test_1',
      providerPaymentIntentId: null,
      paidAt: null,
    };
    expect(instructorReviewPaymentChange(parsed, order)).toMatchObject({
      status: 'REFUNDED',
      providerPaymentIntentId: 'pi_test1',
    });
    const paid = parseInstructorReviewStripeEvent(event(paidObject));
    if (paid?.type !== 'checkout.session.completed') throw new Error('expected paid event');
    expect(
      instructorReviewPaymentChange(paid, {
        ...order,
        status: 'REFUNDED',
        providerPaymentIntentId: 'pi_test1',
      }),
    ).toBeNull();
  });
});
