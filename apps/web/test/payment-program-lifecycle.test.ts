import type { PrismaClient } from '@bunshin/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/payments/secure-configuration', () => ({
  currentPaymentEnvironment: () => 'TEST',
  AesGcmPaymentSecretCrypto: class {
    decrypt() {
      return 'sk_test_organization';
    }
  },
  StripeCheckoutAdapter: class {},
}));

import {
  expireEndedPaidProgramEnrollments,
  expireProgramCheckout,
  refundPaidProgramPurchase,
} from '../src/payments/program-purchase';

const configuration = {
  id: 'configuration-a',
  workspaceId: 'workspace-a',
  encryptedSecretKey: 'encrypted',
};

const transactionWith = <T>(value: T) =>
  vi.fn(async (callback: (client: T) => Promise<unknown>) => callback(value));

describe('program payment lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expires only the checkout owned by the webhook organization', async () => {
    const updatePurchase = vi.fn();
    const updateWebhook = vi.fn();
    const tx = {
      organizationPaymentConfiguration: { findFirst: vi.fn().mockResolvedValue(configuration) },
      paymentWebhookEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'webhook-a', status: 'RECEIVED' }),
        update: updateWebhook,
      },
      programPurchase: {
        findFirst: vi.fn().mockResolvedValue({ id: 'purchase-a', status: 'CHECKOUT_OPEN' }),
        update: updatePurchase,
      },
    };
    const client = {
      $transaction: transactionWith(tx),
    } as unknown as PrismaClient;

    await expect(
      expireProgramCheckout(client, {
        configurationId: configuration.id,
        providerEventId: 'evt-expired',
        eventType: 'checkout.session.expired',
        payloadDigest: 'digest',
        purchaseId: 'purchase-a',
        checkoutSessionId: 'cs-a',
        livemode: false,
      }),
    ).resolves.toBe(true);

    expect(tx.programPurchase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'purchase-a',
        workspaceId: 'workspace-a',
        paymentConfigurationId: 'configuration-a',
        providerCheckoutSessionId: 'cs-a',
      },
    });
    expect(updatePurchase).toHaveBeenCalledWith({
      where: { id: 'purchase-a' },
      data: { status: 'EXPIRED', expiredAt: expect.any(Date) },
    });
    expect(updateWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('revokes the paid enrollment only after a verified full refund', async () => {
    const enrollmentUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const purchaseUpdate = vi.fn();
    const eventCreate = vi.fn();
    const tx = {
      organizationPaymentConfiguration: { findFirst: vi.fn().mockResolvedValue(configuration) },
      paymentWebhookEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'webhook-a', status: 'RECEIVED' }),
        update: vi.fn(),
      },
      programPurchase: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'purchase-a',
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          buyerUserId: 'user-a',
          sourceEnrollmentId: 'free-a',
          paidEnrollmentId: 'paid-a',
          amountYen: 29_800,
          refundedAmountYen: 0,
          currency: 'JPY',
          status: 'PAID',
        }),
        update: purchaseUpdate,
      },
      programEnrollment: { updateMany: enrollmentUpdate },
      programActionEvent: { create: eventCreate },
    };
    const client = {
      $transaction: transactionWith(tx),
    } as unknown as PrismaClient;

    await expect(
      refundPaidProgramPurchase(client, {
        configurationId: configuration.id,
        providerEventId: 'evt-refund',
        eventType: 'charge.refunded',
        payloadDigest: 'digest',
        paymentIntentId: 'pi-a',
        amount: 29_800,
        amountRefunded: 29_800,
        currency: 'jpy',
        fullyRefunded: true,
        livemode: false,
      }),
    ).resolves.toBe(true);

    expect(enrollmentUpdate).toHaveBeenCalledWith({
      where: {
        id: 'paid-a',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      data: { status: 'CANCELLED', endsAt: expect.any(Date) },
    });
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: 'purchase-a' },
      data: {
        status: 'REFUNDED',
        refundedAmountYen: 29_800,
        refundedAt: expect.any(Date),
      },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'PAYMENT_REFUNDED' }),
      }),
    );
  });

  it('retains a failed webhook ledger entry after transaction rollback', async () => {
    const upsert = vi.fn();
    const client = {
      $transaction: vi.fn().mockRejectedValue(new Error('transaction failed')),
      organizationPaymentConfiguration: {
        findFirst: vi.fn().mockResolvedValue({ workspaceId: 'workspace-a' }),
      },
      paymentWebhookEvent: { upsert },
    } as unknown as PrismaClient;

    await expect(
      expireProgramCheckout(client, {
        configurationId: 'configuration-a',
        providerEventId: 'evt-failed',
        eventType: 'checkout.session.expired',
        payloadDigest: 'digest',
        purchaseId: 'purchase-a',
        checkoutSessionId: 'cs-a',
        livemode: false,
      }),
    ).rejects.toThrow('transaction failed');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'workspace-a',
          status: 'FAILED',
          errorCategory: 'PROCESSING_FAILED',
        }),
      }),
    );
  });

  it('keeps access active for a partial refund and records manual review state', async () => {
    const webhookUpdate = vi.fn();
    const purchaseUpdate = vi.fn();
    const tx = {
      organizationPaymentConfiguration: { findFirst: vi.fn().mockResolvedValue(configuration) },
      paymentWebhookEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'webhook-a', status: 'RECEIVED' }),
        update: webhookUpdate,
      },
      programPurchase: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'purchase-a',
          amountYen: 29_800,
          refundedAmountYen: 0,
          currency: 'JPY',
          status: 'PAID',
        }),
        update: purchaseUpdate,
      },
      programEnrollment: { updateMany: vi.fn() },
    };
    const client = {
      $transaction: transactionWith(tx),
    } as unknown as PrismaClient;

    await expect(
      refundPaidProgramPurchase(client, {
        configurationId: configuration.id,
        providerEventId: 'evt-partial',
        eventType: 'charge.refunded',
        payloadDigest: 'digest',
        paymentIntentId: 'pi-a',
        amount: 29_800,
        amountRefunded: 5_000,
        currency: 'JPY',
        fullyRefunded: false,
        livemode: false,
      }),
    ).resolves.toBe(false);

    expect(tx.programEnrollment.updateMany).not.toHaveBeenCalled();
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: 'purchase-a' },
      data: { refundedAmountYen: 5_000 },
    });
    expect(webhookUpdate).toHaveBeenCalledWith({
      where: { id: 'webhook-a' },
      data: {
        status: 'IGNORED',
        errorCategory: 'PARTIAL_REFUND',
        processedAt: expect.any(Date),
      },
    });
  });

  it('does not reduce the stored refund total when Stripe events arrive out of order', async () => {
    const purchaseUpdate = vi.fn();
    const tx = {
      organizationPaymentConfiguration: { findFirst: vi.fn().mockResolvedValue(configuration) },
      paymentWebhookEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'webhook-a', status: 'RECEIVED' }),
        update: vi.fn(),
      },
      programPurchase: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'purchase-a',
          amountYen: 29_800,
          refundedAmountYen: 8_000,
          currency: 'JPY',
          status: 'PAID',
        }),
        update: purchaseUpdate,
      },
    };
    const client = { $transaction: transactionWith(tx) } as unknown as PrismaClient;

    await refundPaidProgramPurchase(client, {
      configurationId: configuration.id,
      providerEventId: 'evt-older-partial',
      eventType: 'charge.refunded',
      payloadDigest: 'digest',
      paymentIntentId: 'pi-a',
      amount: 29_800,
      amountRefunded: 5_000,
      currency: 'JPY',
      fullyRefunded: false,
      livemode: false,
    });

    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: 'purchase-a' },
      data: { refundedAmountYen: 8_000 },
    });
  });

  it('expires ended paid enrollments without touching unrelated programs', async () => {
    const enrollmentUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const eventCreate = vi.fn();
    const purchaseFindMany = vi.fn().mockResolvedValue([
      {
        id: 'purchase-a',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        sourceEnrollmentId: 'free-a',
        paidEnrollmentId: 'paid-a',
        buyerUserId: 'user-a',
      },
    ]);
    const client = {
      programPurchase: { findMany: purchaseFindMany },
      $transaction: transactionWith({
        programEnrollment: { updateMany: enrollmentUpdate },
        programActionEvent: { create: eventCreate },
      }),
    } as unknown as PrismaClient;
    const now = new Date('2026-12-18T00:00:00.000Z');

    await expect(expireEndedPaidProgramEnrollments(client, now)).resolves.toEqual({
      expired: 1,
      remaining: false,
    });
    expect(purchaseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PAID',
          paidEnrollment: { status: 'ACTIVE', endsAt: { lte: now } },
        },
      }),
    );
    expect(enrollmentUpdate).toHaveBeenCalledWith({
      where: {
        id: 'paid-a',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        status: 'ACTIVE',
        endsAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'PAID_PROGRAM_EXPIRED' }),
      }),
    );
  });
});
