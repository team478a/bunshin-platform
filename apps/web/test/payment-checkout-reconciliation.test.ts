import type { PrismaClient } from '@bunshin/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/payments/secure-configuration', () => ({
  currentPaymentEnvironment: () => 'DEVELOPMENT',
  AesGcmPaymentSecretCrypto: class {},
  StripeCheckoutSessionRetrievalAdapter: class {},
}));
vi.mock('../src/payments/stripe-program-event', () => ({
  processStripeProgramEvent: vi.fn(),
}));

import { reconcilePendingProgramPurchase } from '../src/payments/payment-checkout-reconciliation';

const purchase = {
  id: 'c886ebfb-c230-471e-b224-bcf5068ffc2b',
  providerCheckoutSessionId: 'cs_test_pending123',
  paymentConfigurationId: 'configuration-a',
  paymentConfiguration: { encryptedSecretKey: 'encrypted' },
};

const paidSession = {
  id: purchase.providerCheckoutSessionId,
  status: 'complete',
  payment_status: 'paid',
  payment_intent: 'pi_paid123',
  amount_total: 29_800,
  currency: 'jpy',
  livemode: false,
  metadata: { purchase_id: purchase.id },
};

describe('pending Stripe Checkout reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('confirms a paid tenant-scoped Checkout through the existing idempotent dispatcher', async () => {
    const audit = vi.fn();
    const db = {
      programPurchase: { findFirst: vi.fn().mockResolvedValue(purchase) },
      organizationPaymentConfigurationAudit: { create: audit },
    } as unknown as PrismaClient;
    const retrieve = vi.fn().mockResolvedValue(paidSession);
    const process = vi.fn();

    await expect(
      reconcilePendingProgramPurchase(
        db,
        {
          workspaceId: 'workspace-a',
          purchaseId: purchase.id,
          actorUserId: 'operator-a',
          reason: '入金後も待機中のため確認',
        },
        { decrypt: vi.fn().mockReturnValue('sk_test_secret'), retrieve, process },
      ),
    ).resolves.toBe('PAID');

    expect(retrieve).toHaveBeenCalledWith('sk_test_secret', purchase.providerCheckoutSessionId);
    expect(process).toHaveBeenCalledWith(
      db,
      purchase.paymentConfigurationId,
      expect.objectContaining({
        id: `reconciliation:${purchase.providerCheckoutSessionId}`,
        type: 'checkout.session.completed',
        data: { object: paidSession },
      }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(audit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CHECKOUT_RECONCILIATION_REQUESTED' }),
      }),
    );
    expect(audit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CHECKOUT_RECONCILIATION_SUCCEEDED' }),
      }),
    );
  });

  it('records an unchanged audit without completing an unpaid open Checkout', async () => {
    const audit = vi.fn();
    const process = vi.fn();
    const db = {
      programPurchase: { findFirst: vi.fn().mockResolvedValue(purchase) },
      organizationPaymentConfigurationAudit: { create: audit },
    } as unknown as PrismaClient;

    await expect(
      reconcilePendingProgramPurchase(
        db,
        {
          workspaceId: 'workspace-a',
          purchaseId: purchase.id,
          actorUserId: 'operator-a',
          reason: '支払い状態の定期確認',
        },
        {
          decrypt: vi.fn().mockReturnValue('sk_test_secret'),
          retrieve: vi.fn().mockResolvedValue({
            ...paidSession,
            status: 'open',
            payment_status: 'unpaid',
            payment_intent: null,
          }),
          process,
        },
      ),
    ).resolves.toBe('UNCHANGED');

    expect(process).not.toHaveBeenCalled();
    expect(audit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CHECKOUT_RECONCILIATION_UNCHANGED' }),
      }),
    );
  });

  it('rejects a Checkout belonging to another purchase and audits the failure', async () => {
    const audit = vi.fn();
    const process = vi.fn();
    const db = {
      programPurchase: { findFirst: vi.fn().mockResolvedValue(purchase) },
      organizationPaymentConfigurationAudit: { create: audit },
    } as unknown as PrismaClient;

    await expect(
      reconcilePendingProgramPurchase(
        db,
        {
          workspaceId: 'workspace-a',
          purchaseId: purchase.id,
          actorUserId: 'operator-a',
          reason: '購入者からの問い合わせ対応',
        },
        {
          decrypt: vi.fn().mockReturnValue('sk_test_secret'),
          retrieve: vi.fn().mockResolvedValue({
            ...paidSession,
            metadata: { purchase_id: 'different-purchase' },
          }),
          process,
        },
      ),
    ).rejects.toThrow('Stripe Checkout identity mismatch');

    expect(process).not.toHaveBeenCalled();
    expect(audit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CHECKOUT_RECONCILIATION_FAILED' }),
      }),
    );
  });

  it('does not query Stripe for a purchase outside the selected tenant or pending state', async () => {
    const retrieve = vi.fn();
    const db = {
      programPurchase: { findFirst: vi.fn().mockResolvedValue(null) },
      organizationPaymentConfigurationAudit: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      reconcilePendingProgramPurchase(
        db,
        {
          workspaceId: 'workspace-b',
          purchaseId: purchase.id,
          actorUserId: 'operator-b',
          reason: '支払い状態を確認',
        },
        { decrypt: vi.fn(), retrieve, process: vi.fn() },
      ),
    ).rejects.toThrow('pending program purchase not found');
    expect(retrieve).not.toHaveBeenCalled();
  });
});
