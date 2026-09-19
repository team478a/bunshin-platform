import 'server-only';
import { createHash } from 'node:crypto';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@bunshin/database';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeCheckoutSessionRetrievalAdapter,
} from './secure-configuration';
import { processStripeProgramEvent, type StripeProgramEvent } from './stripe-program-event';

type StripeCheckoutSnapshot = {
  id?: unknown;
  status?: unknown;
  payment_status?: unknown;
  payment_intent?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  livemode?: unknown;
  metadata?: Record<string, unknown>;
};

type ReconciliationDependencies = {
  decrypt: (encryptedValue: string) => string;
  retrieve: (secretKey: string, sessionId: string) => Promise<unknown>;
  process: (
    db: PrismaClient,
    configurationId: string,
    event: StripeProgramEvent,
    payloadDigest: string,
  ) => Promise<void>;
};

const defaultDependencies = (): ReconciliationDependencies => {
  const crypto = new AesGcmPaymentSecretCrypto();
  const provider = new StripeCheckoutSessionRetrievalAdapter();
  return {
    decrypt: (value) => crypto.decrypt(value),
    retrieve: (secretKey, sessionId) => provider.retrieve(secretKey, sessionId),
    process: processStripeProgramEvent,
  };
};

export type CheckoutReconciliationResult = 'PAID' | 'EXPIRED' | 'UNCHANGED';

export async function reconcilePendingProgramPurchase(
  db: PrismaClient,
  input: {
    workspaceId: string;
    purchaseId: string;
    actorUserId: string;
    reason: string;
  },
  dependencies = defaultDependencies(),
): Promise<CheckoutReconciliationResult> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'reconciliation reason must be 3 to 500 characters',
    );
  }
  const purchase = await db.programPurchase.findFirst({
    where: {
      id: input.purchaseId,
      workspaceId: input.workspaceId,
      status: 'CHECKOUT_OPEN',
      providerCheckoutSessionId: { not: null },
      paymentConfiguration: {
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
        status: { in: ['ACTIVE', 'DISABLED'] },
      },
    },
    select: {
      id: true,
      providerCheckoutSessionId: true,
      paymentConfigurationId: true,
      paymentConfiguration: { select: { encryptedSecretKey: true } },
    },
  });
  if (!purchase?.providerCheckoutSessionId) {
    throw new ApplicationError('NOT_FOUND', 'pending program purchase not found');
  }

  const audit = (action: string) =>
    db.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: input.workspaceId,
        configurationId: purchase.paymentConfigurationId,
        actorUserId: input.actorUserId,
        action,
        reason,
        changedFields: {
          purchaseId: purchase.id,
          checkoutSessionId: purchase.providerCheckoutSessionId,
        },
      },
    });

  await audit('CHECKOUT_RECONCILIATION_REQUESTED');
  try {
    const secretKey = dependencies.decrypt(purchase.paymentConfiguration.encryptedSecretKey);
    const rawSession = (await dependencies.retrieve(
      secretKey,
      purchase.providerCheckoutSessionId,
    )) as StripeCheckoutSnapshot;
    if (
      rawSession.id !== purchase.providerCheckoutSessionId ||
      rawSession.metadata?.['purchase_id'] !== purchase.id ||
      typeof rawSession.livemode !== 'boolean'
    ) {
      throw new ApplicationError('FORBIDDEN', 'Stripe Checkout identity mismatch');
    }

    const canonical = JSON.stringify({
      id: rawSession.id,
      status: rawSession.status,
      payment_status: rawSession.payment_status,
      payment_intent: rawSession.payment_intent,
      amount_total: rawSession.amount_total,
      currency: rawSession.currency,
      livemode: rawSession.livemode,
      purchase_id: rawSession.metadata['purchase_id'],
    });
    const payloadDigest = createHash('sha256').update(canonical).digest('hex');
    const providerEventId = `reconciliation:${purchase.providerCheckoutSessionId}`;
    let result: CheckoutReconciliationResult = 'UNCHANGED';
    let event: StripeProgramEvent | null = null;
    if (rawSession.payment_status === 'paid') {
      result = 'PAID';
      event = {
        id: providerEventId,
        type: 'checkout.session.completed',
        livemode: rawSession.livemode,
        data: { object: rawSession },
      };
    } else if (rawSession.status === 'expired') {
      result = 'EXPIRED';
      event = {
        id: providerEventId,
        type: 'checkout.session.expired',
        livemode: rawSession.livemode,
        data: { object: rawSession },
      };
    }
    if (event) {
      await dependencies.process(db, purchase.paymentConfigurationId, event, payloadDigest);
    }
    await audit(
      result === 'UNCHANGED'
        ? 'CHECKOUT_RECONCILIATION_UNCHANGED'
        : 'CHECKOUT_RECONCILIATION_SUCCEEDED',
    );
    return result;
  } catch (error) {
    await audit('CHECKOUT_RECONCILIATION_FAILED');
    throw error;
  }
}
