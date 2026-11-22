import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@bunshin/database';
import { processFortuneStripeEvent } from '../src/fortune/stripe-events';

const configuration = { id: 'payment', workspaceId: 'workspace' };
const purchaseId = 'adbd8a53-89a4-4a50-bdd0-230579ab7218';
const metadata = {
  purchase_kind: 'fortune',
  purchase_id: purchaseId,
  workspace_id: configuration.workspaceId,
  offering_id: 'revision',
};
const completed = {
  id: 'evt_paid',
  type: 'checkout.session.completed',
  livemode: false,
  data: {
    object: {
      id: 'cs_test',
      payment_intent: 'pi_test',
      payment_status: 'paid',
      amount_total: 1980,
      currency: 'jpy',
      metadata,
    },
  },
};
const refund = (amount: number) => ({
  id: `evt_refund_${amount}`,
  type: 'charge.refunded',
  livemode: false,
  data: {
    object: {
      payment_intent: 'pi_test',
      amount: 1980,
      amount_refunded: amount,
      currency: 'jpy',
      refunded: amount === 1980,
      metadata,
    },
  },
});

function fixture() {
  const current = {
    id: purchaseId,
    workspaceId: configuration.workspaceId,
    productRevision: 'revision',
    liveMode: false,
    status: 'PENDING',
    amountYen: 1980,
    refundedAmountYen: 0,
    paidAt: null,
    deliveredAt: null,
    readingId: 'reading',
    providerCheckoutSessionId: null,
    providerPaymentIntentId: null,
  };
  const events = new Map<string, { payloadDigest: string }>();
  const tx = {
    $queryRaw: vi.fn(),
    fortuneCommercePurchase: {
      findFirst: vi.fn().mockResolvedValue(current),
      findUniqueOrThrow: vi.fn().mockResolvedValue(current),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(Object.assign(current, data)),
      ),
    },
    paymentWebhookEvent: {
      findUnique: vi.fn(
        ({
          where,
        }: {
          where: { paymentConfigurationId_providerEventId: { providerEventId: string } };
        }) =>
          Promise.resolve(events.get(where.paymentConfigurationId_providerEventId.providerEventId)),
      ),
      create: vi.fn(({ data }: { data: { providerEventId: string; payloadDigest: string } }) =>
        Promise.resolve(events.set(data.providerEventId, data)),
      ),
    },
  };
  const db = {
    $transaction: (operation: (value: typeof tx) => unknown) => operation(tx),
  } as unknown as PrismaClient;
  return {
    current,
    events,
    tx,
    run: (event: Parameters<typeof processFortuneStripeEvent>[2], digest = 'digest') =>
      processFortuneStripeEvent(db, configuration, event, digest),
  };
}

describe('fortune Stripe events', () => {
  it('confirms verified totals once and keeps the order scoped to its Stripe configuration', async () => {
    const { current, tx, run } = fixture();
    expect(await run(completed)).toBe(true);
    expect(await run(completed)).toBe(true);
    expect(current).toMatchObject({
      status: 'PAID',
      providerPaymentIntentId: 'pi_test',
      paidAt: expect.any(Date),
    });
    expect(tx.fortuneCommercePurchase.update).toHaveBeenCalledTimes(1);
    expect(tx.fortuneCommercePurchase.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        paymentConfigurationId: 'payment',
        id: purchaseId,
      },
    });
    await expect(run(completed, 'different-digest')).rejects.toThrow('digest mismatch');
  });

  it('keeps an out-of-order full refund revoked after completion', async () => {
    const { current, run } = fixture();
    await run(refund(1980));
    await run(completed);
    await run(refund(100));
    expect(current).toMatchObject({
      status: 'REFUNDED',
      refundedAmountYen: 1980,
      readingId: null,
      paidAt: expect.any(Date),
    });
  });

  it('does not grant access on a failed, mismatched or wrong-mode event', async () => {
    const { current, events, run } = fixture();
    await run({
      ...completed,
      id: 'evt_failed',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_test', amount: 1980, currency: 'jpy', metadata } },
    });
    await expect(run({ ...completed, livemode: true })).rejects.toThrow('scope mismatch');
    await expect(
      run({
        ...completed,
        data: { object: { ...completed.data.object, amount_total: 1 } },
      }),
    ).rejects.toThrow('amount mismatch');
    expect(current).toMatchObject({ status: 'PENDING', paidAt: null });
    expect(events.size).toBe(1);
  });
});
