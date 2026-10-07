import { expect, it, vi } from 'vitest';
import type { PrismaClient } from '@bunshin/database';

vi.mock('server-only', () => ({}));
vi.mock('../src/payments/program-purchase-context', () => ({
  validatedDirectPurchaseContext: () =>
    Promise.resolve({
      program: { settings: { moduleKey: 'AI_TRAINING_V1' } },
      terms: { supportMode: 'READY_TO_USE' },
    }),
}));
import { createDirectProgramCheckout } from '../src/payments/program-purchase-checkout';

it('rejects historical training finished-output checkout before purchase writes, decryption or Stripe', async () => {
  const purchase = vi.fn();
  const stripe = { create: vi.fn() };
  const crypto = { decrypt: vi.fn() };
  const client = {
    programPurchase: { findUnique: purchase, create: purchase },
  } as unknown as PrismaClient;
  await expect(
    createDirectProgramCheckout(
      client,
      {
        workspaceId: 'workspace',
        groupId: 'group',
        buyerUserId: 'user',
        offeringId: 'offering',
        idempotencyKey: 'operation',
        serviceSlug: 'service',
      },
      { stripe, crypto },
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(purchase).not.toHaveBeenCalled();
  expect(stripe.create).not.toHaveBeenCalled();
  expect(crypto.decrypt).not.toHaveBeenCalled();
});
