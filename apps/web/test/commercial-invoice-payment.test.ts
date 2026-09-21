import type { PrismaClient } from '@bunshin/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = '';
    },
  },
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    APP_URL: 'https://app.example.com',
    PLATFORM_BILLING_STRIPE_SECRET_KEY: 'sk_test_platform',
    PLATFORM_BILLING_STRIPE_WEBHOOK_SECRET: 'whsec_platform',
  }),
}));

import {
  createCommercialInvoiceCheckout,
  processCommercialBillingStripeEvent,
} from '../src/payments/commercial-invoice-payment';

const invoice = {
  id: 'invoice-a',
  workspaceId: 'workspace-a',
  invoiceNumber: 'WW-202609-A',
  status: 'ISSUED',
  amountYen: 19_800,
  paymentProvider: null,
  providerCheckoutSessionId: null,
  checkoutUrl: null,
  checkoutExpiresAt: null,
  updatedAt: new Date('2026-09-19T00:00:00Z'),
  updatedByUserId: 'admin-a',
  contract: {
    status: 'ACTIVE',
    billingMode: 'EXTERNAL_BILLING',
    billingEmail: 'billing@example.com',
    automaticCollectionEnabled: false,
    stripeCustomerId: null,
  },
};

const transactionWith = <T>(value: T) =>
  vi.fn(async (callback: (client: T) => Promise<unknown>) => callback(value));

describe('commercial invoice Stripe payment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a tenant-scoped hosted checkout from the immutable invoice amount', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'cs_platform_a',
      url: 'https://checkout.stripe.com/c/pay/a',
      expiresAt: new Date('2026-09-20T00:00:00Z'),
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      workspaceMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
      tenantInvoice: { findFirst: vi.fn().mockResolvedValue(invoice), updateMany },
    } as unknown as PrismaClient;

    await expect(
      createCommercialInvoiceCheckout(
        client,
        { workspaceId: 'workspace-a', invoiceId: 'invoice-a', actorUserId: 'owner-a' },
        { create },
      ),
    ).resolves.toEqual({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/a',
      reused: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'invoice-a',
        workspaceId: 'workspace-a',
        amountYen: 19_800,
        billingEmail: 'billing@example.com',
        savePaymentMethod: false,
        customerId: null,
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-a', workspaceId: 'workspace-a', status: 'ISSUED' },
      }),
    );
  });

  it('stores Stripe references after an explicitly enabled first payment', async () => {
    const invoiceUpdate = vi.fn().mockResolvedValue({ ...invoice, status: 'PAID' });
    const contractUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      commercialBillingWebhookEvent: {
        create: vi.fn().mockResolvedValue({ id: 'ledger-a' }),
        update: vi.fn(),
      },
      tenantInvoice: { update: invoiceUpdate },
      organizationCommercialContract: { updateMany: contractUpdate },
      commercialBillingAudit: { create: vi.fn() },
    };
    const client = {
      tenantInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          ...invoice,
          contractId: 'contract-a',
          paymentProvider: 'STRIPE',
          providerCheckoutSessionId: 'cs_platform_a',
          contract: {
            ...invoice.contract,
            automaticCollectionEnabled: true,
            stripeCustomerId: null,
          },
        }),
      },
      commercialBillingWebhookEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transactionWith(tx),
    } as unknown as PrismaClient;
    const retrieve = vi
      .fn()
      .mockResolvedValue({ customerId: 'cus_platform_a', paymentMethodId: 'pm_platform_a' });

    await processCommercialBillingStripeEvent(
      client,
      {
        id: 'evt_platform_a',
        type: 'checkout.session.completed',
        livemode: false,
        data: {
          object: {
            id: 'cs_platform_a',
            amount_total: 19_800,
            currency: 'jpy',
            payment_status: 'paid',
            payment_intent: 'pi_platform_a',
            metadata: { invoice_id: 'invoice-a', workspace_id: 'workspace-a' },
          },
        },
      },
      'digest',
      { retrieve },
    );

    expect(retrieve).toHaveBeenCalledWith('sk_test_platform', 'pi_platform_a');
    expect(contractUpdate).toHaveBeenCalledWith({
      where: {
        id: 'contract-a',
        workspaceId: 'workspace-a',
        automaticCollectionEnabled: true,
      },
      data: {
        stripeCustomerId: 'cus_platform_a',
        stripePaymentMethodId: 'pm_platform_a',
      },
    });
  });

  it('does not create checkout for an administrator from another organization', async () => {
    const create = vi.fn();
    const client = {
      workspaceMembership: { findFirst: vi.fn().mockResolvedValue(null) },
      tenantInvoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
    } as unknown as PrismaClient;

    await expect(
      createCommercialInvoiceCheckout(
        client,
        { workspaceId: 'workspace-a', invoiceId: 'invoice-a', actorUserId: 'other-admin' },
        { create },
      ),
    ).rejects.toThrow('団体管理者');
    expect(create).not.toHaveBeenCalled();
  });

  it('marks only the matching issued invoice paid after a verified Stripe event', async () => {
    const invoiceUpdate = vi.fn().mockResolvedValue({ ...invoice, status: 'PAID' });
    const webhookUpdate = vi.fn();
    const tx = {
      commercialBillingWebhookEvent: {
        create: vi.fn().mockResolvedValue({ id: 'ledger-a' }),
        update: webhookUpdate,
      },
      tenantInvoice: { update: invoiceUpdate },
      commercialBillingAudit: { create: vi.fn() },
    };
    const client = {
      tenantInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          ...invoice,
          paymentProvider: 'STRIPE',
          providerCheckoutSessionId: 'cs_platform_a',
        }),
      },
      commercialBillingWebhookEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transactionWith(tx),
    } as unknown as PrismaClient;

    await expect(
      processCommercialBillingStripeEvent(
        client,
        {
          id: 'evt_platform_a',
          type: 'checkout.session.completed',
          livemode: false,
          data: {
            object: {
              id: 'cs_platform_a',
              amount_total: 19_800,
              currency: 'jpy',
              payment_status: 'paid',
              payment_intent: 'pi_platform_a',
              metadata: { invoice_id: 'invoice-a', workspace_id: 'workspace-a' },
            },
          },
        },
        'digest',
      ),
    ).resolves.toEqual({ ignored: false, status: 'PAID' });

    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-a' },
        data: expect.objectContaining({ status: 'PAID', paymentReference: 'pi_platform_a' }),
      }),
    );
    expect(webhookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('rejects a checkout event whose amount does not match the invoice', async () => {
    const client = {
      tenantInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          ...invoice,
          paymentProvider: 'STRIPE',
          providerCheckoutSessionId: 'cs_platform_a',
        }),
      },
      commercialBillingWebhookEvent: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transactionWith({}),
    } as unknown as PrismaClient;

    await expect(
      processCommercialBillingStripeEvent(
        client,
        {
          id: 'evt_platform_a',
          type: 'checkout.session.completed',
          livemode: false,
          data: {
            object: {
              id: 'cs_platform_a',
              amount_total: 39_800,
              currency: 'jpy',
              payment_status: 'paid',
              metadata: { invoice_id: 'invoice-a', workspace_id: 'workspace-a' },
            },
          },
        },
        'digest',
      ),
    ).rejects.toThrow('amount or payment mismatch');
  });
});
