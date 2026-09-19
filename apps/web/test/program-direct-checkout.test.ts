import type { PrismaClient } from '@bunshin/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.test' }),
}));
vi.mock('@bunshin/database', () => ({
  addProgramCalendarDays: (start: Date, days: number) =>
    new Date(start.getTime() + days * 24 * 60 * 60 * 1000),
}));
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
  completePaidProgramPurchase,
  createDirectProgramCheckout,
} from '../src/payments/program-purchase';

const terms = {
  schemaVersion: 1,
  productKind: 'PROGRAM_ACCESS',
  purchaseMode: 'DIRECT',
  amountYen: 19_800,
  currency: 'JPY',
  durationDays: 90,
  supportMode: 'GUIDED',
  timeZone: 'Asia/Tokyo',
};

describe('direct program checkout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives tenant, membership and price from the active offering', async () => {
    const purchaseCreate = vi.fn().mockResolvedValue({
      id: 'purchase-a',
      workspaceId: 'workspace-a',
      groupId: 'group-a',
      buyerUserId: 'user-a',
      sourceEnrollmentId: null,
      programOfferingId: 'offering-a',
      paymentConfigurationId: 'configuration-a',
      amountYen: 19_800,
      currency: 'JPY',
      status: 'CREATED',
    });
    const purchaseUpdate = vi.fn();
    const client = {
      programOffering: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'offering-a',
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          serviceProgramId: 'program-a',
          version: 2,
          termsSnapshot: terms,
        }),
      },
      organizationPaymentConfiguration: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'configuration-a',
          status: 'ACTIVE',
          lastVerifiedAt: new Date(),
          encryptedWebhookSecret: 'encrypted-webhook',
          encryptedSecretKey: 'encrypted-key',
        }),
      },
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }),
      },
      serviceLegalDocument: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { type: 'TERMS' },
            { type: 'PRIVACY' },
            { type: 'COMMERCE_DISCLOSURE' },
          ]),
      },
      serviceProgram: {
        findFirst: vi.fn().mockResolvedValue({ id: 'program-a', displayName: '90日実践' }),
      },
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(null) },
      programPurchase: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: purchaseCreate,
        update: purchaseUpdate,
      },
    } as unknown as PrismaClient;
    const stripe = {
      create: vi.fn().mockResolvedValue({
        id: 'cs_test_a',
        url: 'https://checkout.stripe.com/example',
        expiresAt: new Date('2026-09-20T00:00:00Z'),
      }),
    };

    await expect(
      createDirectProgramCheckout(
        client,
        {
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          buyerUserId: 'user-a',
          offeringId: 'offering-a',
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          serviceSlug: 'service-a',
        },
        { crypto: { decrypt: () => 'sk_test_a' }, stripe },
      ),
    ).resolves.toEqual({ checkoutUrl: 'https://checkout.stripe.com/example' });

    expect(purchaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        buyerUserId: 'user-a',
        groupMembershipId: 'membership-a',
        sourceEnrollmentId: null,
        programOfferingId: 'offering-a',
        paymentConfigurationId: 'configuration-a',
        amountYen: 19_800,
        currency: 'JPY',
      }),
    });
    expect(stripe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        offeringId: 'offering-a',
        amountYen: 19_800,
      }),
    );
    expect(purchaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CHECKOUT_OPEN' }) }),
    );
  });

  it('releases a newly created purchase when Stripe cannot open checkout', async () => {
    const updateMany = vi.fn();
    const client = {
      programOffering: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'offering-a',
          serviceProgramId: 'program-a',
          termsSnapshot: terms,
        }),
      },
      organizationPaymentConfiguration: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'configuration-a',
          status: 'ACTIVE',
          lastVerifiedAt: new Date(),
          encryptedWebhookSecret: 'encrypted-webhook',
          encryptedSecretKey: 'encrypted-key',
        }),
      },
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
      serviceLegalDocument: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { type: 'TERMS' },
            { type: 'PRIVACY' },
            { type: 'COMMERCE_DISCLOSURE' },
          ]),
      },
      serviceProgram: {
        findFirst: vi.fn().mockResolvedValue({ id: 'program-a', displayName: '90日実践' }),
      },
      programEnrollment: { findFirst: vi.fn().mockResolvedValue(null) },
      programPurchase: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'purchase-failed',
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          buyerUserId: 'user-a',
          sourceEnrollmentId: null,
          programOfferingId: 'offering-a',
          amountYen: 19_800,
          currency: 'JPY',
          status: 'CREATED',
        }),
        updateMany,
      },
    } as unknown as PrismaClient;
    const failure = new Error('provider unavailable');

    await expect(
      createDirectProgramCheckout(
        client,
        {
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          buyerUserId: 'user-a',
          offeringId: 'offering-a',
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          serviceSlug: 'service-a',
        },
        {
          crypto: { decrypt: () => 'sk_test_a' },
          stripe: { create: vi.fn().mockRejectedValue(failure) },
        },
      ),
    ).rejects.toBe(failure);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'purchase-failed', status: 'CREATED' },
      data: { status: 'FAILED' },
    });
  });

  it('creates a duration-limited enrollment after a verified direct payment', async () => {
    const enrollmentCreate = vi.fn().mockResolvedValue({ id: 'enrollment-paid' });
    const purchaseUpdate = vi.fn();
    const webhookUpdate = vi.fn();
    const tx = {
      organizationPaymentConfiguration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'configuration-a',
          workspaceId: 'workspace-a',
          encryptedSecretKey: 'encrypted-key',
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'configuration-a',
          status: 'DISABLED',
          lastVerifiedAt: new Date(),
          encryptedWebhookSecret: 'encrypted-webhook',
        }),
      },
      paymentWebhookEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'webhook-a', status: 'RECEIVED' }),
        update: webhookUpdate,
      },
      programPurchase: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'purchase-a',
          workspaceId: 'workspace-a',
          groupId: 'group-a',
          buyerUserId: 'user-a',
          groupMembershipId: 'membership-a',
          sourceEnrollmentId: null,
          programOfferingId: 'offering-a',
          paymentConfigurationId: 'configuration-a',
          providerCheckoutSessionId: 'cs_test_a',
          amountYen: 19_800,
          currency: 'JPY',
          status: 'CHECKOUT_OPEN',
        }),
        update: purchaseUpdate,
      },
      programOffering: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'offering-a',
          serviceProgramId: 'program-a',
          version: 2,
          priceReference: 'program:program-a:v2',
          termsSnapshot: terms,
        }),
      },
      groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }) },
      serviceProgram: {
        findFirst: vi.fn().mockResolvedValue({ id: 'program-a', displayName: '90日実践' }),
      },
      programEnrollment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: enrollmentCreate,
      },
      programActionEvent: { create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
      organizationPaymentConfiguration: {
        findFirst: vi.fn().mockResolvedValue({ workspaceId: 'workspace-a' }),
      },
      paymentWebhookEvent: { upsert: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      completePaidProgramPurchase(client, {
        configurationId: 'configuration-a',
        providerEventId: 'evt-paid',
        eventType: 'checkout.session.completed',
        payloadDigest: 'digest',
        purchaseId: 'purchase-a',
        checkoutSessionId: 'cs_test_a',
        paymentIntentId: 'pi_test_a',
        amountTotal: 19_800,
        currency: 'jpy',
        livemode: false,
      }),
    ).resolves.toBe('enrollment-paid');

    expect(enrollmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        groupMembershipId: 'membership-a',
        serviceProgramId: 'program-a',
        programOfferingId: 'offering-a',
        status: 'ACTIVE',
        supportMode: 'GUIDED',
        goalSnapshot: { source: 'DIRECT_STRIPE_CHECKOUT' },
        startsAt: expect.any(Date),
        endsAt: expect.any(Date),
      }),
    });
    expect(purchaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAID',
          paidEnrollmentId: 'enrollment-paid',
        }),
      }),
    );
    expect(webhookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });
});
