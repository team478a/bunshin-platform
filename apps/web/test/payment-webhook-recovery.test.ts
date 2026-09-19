import type { PrismaClient } from '@bunshin/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/payments/secure-configuration', () => ({
  currentPaymentEnvironment: () => 'DEVELOPMENT',
  AesGcmPaymentSecretCrypto: class {},
  StripeEventRetrievalAdapter: class {},
}));
vi.mock('../src/payments/stripe-program-event', () => ({
  processStripeProgramEvent: vi.fn(),
}));

import { recoverFailedPaymentWebhook } from '../src/payments/payment-webhook-recovery';

const stored = {
  id: '4f41f50e-19dd-4fc7-a4cc-31413a8dccfb',
  providerEventId: 'evt_failed123',
  payloadDigest: 'a'.repeat(64),
  paymentConfigurationId: 'configuration-a',
  paymentConfiguration: { encryptedSecretKey: 'encrypted' },
};

describe('payment webhook recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('re-fetches one tenant-scoped failed event and records an audited success', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce({ status: 'PROCESSED' });
    const createAudit = vi.fn();
    const db = {
      paymentWebhookEvent: { findFirst },
      organizationPaymentConfigurationAudit: { create: createAudit },
    } as unknown as PrismaClient;
    const retrieve = vi.fn().mockResolvedValue({
      id: stored.providerEventId,
      type: 'checkout.session.completed',
    });
    const process = vi.fn();

    await expect(
      recoverFailedPaymentWebhook(
        db,
        {
          workspaceId: 'workspace-a',
          webhookEventId: stored.id,
          actorUserId: 'operator-a',
          reason: 'Stripe接続を修正済み',
        },
        { decrypt: vi.fn().mockReturnValue('sk_test_secret'), retrieve, process },
      ),
    ).resolves.toEqual({ status: 'PROCESSED' });

    expect(findFirst.mock.calls[0]![0]).toEqual({
      where: {
        id: stored.id,
        workspaceId: 'workspace-a',
        status: 'FAILED',
        paymentConfiguration: {
          environment: 'DEVELOPMENT',
          provider: 'STRIPE',
          status: { in: ['ACTIVE', 'DISABLED'] },
        },
      },
      select: expect.any(Object),
    });
    expect(retrieve).toHaveBeenCalledWith('sk_test_secret', stored.providerEventId);
    expect(process).toHaveBeenCalledWith(
      db,
      stored.paymentConfigurationId,
      expect.objectContaining({ id: stored.providerEventId }),
      stored.payloadDigest,
    );
    expect(createAudit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'WEBHOOK_REPLAY_REQUESTED' }),
      }),
    );
    expect(createAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'WEBHOOK_REPLAY_SUCCEEDED' }),
      }),
    );
  });

  it('rejects a provider response for a different event and audits the failure', async () => {
    const createAudit = vi.fn();
    const db = {
      paymentWebhookEvent: { findFirst: vi.fn().mockResolvedValue(stored) },
      organizationPaymentConfigurationAudit: { create: createAudit },
    } as unknown as PrismaClient;
    const process = vi.fn();

    await expect(
      recoverFailedPaymentWebhook(
        db,
        {
          workspaceId: 'workspace-a',
          webhookEventId: stored.id,
          actorUserId: 'operator-a',
          reason: '一時障害の解消後に再処理',
        },
        {
          decrypt: vi.fn().mockReturnValue('sk_test_secret'),
          retrieve: vi.fn().mockResolvedValue({ id: 'evt_different' }),
          process,
        },
      ),
    ).rejects.toThrow('Stripe event identifier mismatch');

    expect(process).not.toHaveBeenCalled();
    expect(createAudit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'WEBHOOK_REPLAY_REQUESTED' }),
      }),
    );
    expect(createAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'WEBHOOK_REPLAY_FAILED' }),
      }),
    );
  });

  it('does not retrieve events that are not failed inside the selected tenant', async () => {
    const retrieve = vi.fn();
    const db = {
      paymentWebhookEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      organizationPaymentConfigurationAudit: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      recoverFailedPaymentWebhook(
        db,
        {
          workspaceId: 'workspace-b',
          webhookEventId: stored.id,
          actorUserId: 'operator-b',
          reason: '対象イベントを再確認',
        },
        { decrypt: vi.fn(), retrieve, process: vi.fn() },
      ),
    ).rejects.toThrow('failed payment webhook not found');
    expect(retrieve).not.toHaveBeenCalled();
  });
});
