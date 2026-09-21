import type { PrismaClient } from '@bunshin/database';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    APP_URL: 'https://app.example.com',
    PLATFORM_BILLING_STRIPE_SECRET_KEY: 'sk_test_platform',
    PLATFORM_BILLING_STRIPE_WEBHOOK_SECRET: 'whsec_platform',
  }),
}));

import { collectCommercialInvoices } from '../src/payments/commercial-invoice-automatic-collection';

const now = new Date('2026-09-21T00:30:00Z');
const invoice = {
  id: 'invoice-a',
  workspaceId: 'workspace-a',
  invoiceNumber: 'WW-202609-A',
  amountYen: 19_800,
  updatedByUserId: 'billing-admin-a',
  contract: {
    stripeCustomerId: 'cus_platform_a',
    stripePaymentMethodId: 'pm_platform_a',
  },
};

describe('commercial automatic collection', () => {
  it('marks only the tenant-scoped issued invoice paid after Stripe succeeds', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn();
    const transactionClient = {
      tenantInvoice: { updateMany },
      commercialBillingAudit: { create: auditCreate },
    };
    const transaction = vi.fn((callback: (client: typeof transactionClient) => Promise<boolean>) =>
      callback(transactionClient),
    );
    const client = {
      tenantInvoice: { findMany: vi.fn().mockResolvedValue([invoice]) },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const collect = vi.fn().mockResolvedValue({
      paymentIntentId: 'pi_auto_a',
      outcome: 'SUCCEEDED',
      failureCategory: null,
    });

    await expect(collectCommercialInvoices(client, { now }, { collect })).resolves.toEqual({
      candidates: 1,
      paid: 1,
      requiresAction: 0,
      failed: 0,
    });
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'platform-invoice-auto:invoice-a',
        workspaceId: 'workspace-a',
        amountYen: 19_800,
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-a', workspaceId: 'workspace-a', status: 'ISSUED' },
        data: expect.objectContaining({ status: 'PAID', providerPaymentIntentId: 'pi_auto_a' }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AUTO_PAYMENT_CONFIRMED' }),
      }),
    );
  });

  it('keeps an action-required invoice issued so hosted Checkout remains available', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn();
    const client = {
      tenantInvoice: { findMany: vi.fn().mockResolvedValue([invoice]), updateMany },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const collect = vi.fn().mockResolvedValue({
      paymentIntentId: 'pi_action_a',
      outcome: 'REQUIRES_ACTION',
      failureCategory: 'REQUIRES_ACTION',
    });

    await expect(collectCommercialInvoices(client, { now }, { collect })).resolves.toEqual({
      candidates: 1,
      paid: 0,
      requiresAction: 1,
      failed: 0,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-a', workspaceId: 'workspace-a', status: 'ISSUED' },
        data: expect.not.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
