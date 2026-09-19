import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@bunshin/database';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeEventRetrievalAdapter,
} from './secure-configuration';
import { processStripeProgramEvent, type StripeProgramEvent } from './stripe-program-event';

type RecoveryDependencies = {
  decrypt: (encryptedValue: string) => string;
  retrieve: (secretKey: string, eventId: string) => Promise<unknown>;
  process: (
    db: PrismaClient,
    configurationId: string,
    event: StripeProgramEvent,
    payloadDigest: string,
  ) => Promise<void>;
};

const defaultDependencies = (): RecoveryDependencies => {
  const crypto = new AesGcmPaymentSecretCrypto();
  const provider = new StripeEventRetrievalAdapter();
  return {
    decrypt: (value) => crypto.decrypt(value),
    retrieve: (secretKey, eventId) => provider.retrieve(secretKey, eventId),
    process: processStripeProgramEvent,
  };
};

export async function recoverFailedPaymentWebhook(
  db: PrismaClient,
  input: {
    workspaceId: string;
    webhookEventId: string;
    actorUserId: string;
    reason: string;
  },
  dependencies = defaultDependencies(),
) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new ApplicationError('VALIDATION_ERROR', 'recovery reason must be 3 to 500 characters');
  }
  const stored = await db.paymentWebhookEvent.findFirst({
    where: {
      id: input.webhookEventId,
      workspaceId: input.workspaceId,
      status: 'FAILED',
      paymentConfiguration: {
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
        status: { in: ['ACTIVE', 'DISABLED'] },
      },
    },
    select: {
      id: true,
      providerEventId: true,
      payloadDigest: true,
      paymentConfigurationId: true,
      paymentConfiguration: { select: { encryptedSecretKey: true } },
    },
  });
  if (!stored) throw new ApplicationError('NOT_FOUND', 'failed payment webhook not found');

  const audit = (action: string) =>
    db.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: input.workspaceId,
        configurationId: stored.paymentConfigurationId,
        actorUserId: input.actorUserId,
        action,
        reason,
        changedFields: {
          webhookEventId: stored.id,
          providerEventId: stored.providerEventId,
        },
      },
    });

  await audit('WEBHOOK_REPLAY_REQUESTED');
  try {
    const secretKey = dependencies.decrypt(stored.paymentConfiguration.encryptedSecretKey);
    const rawEvent = await dependencies.retrieve(secretKey, stored.providerEventId);
    const event = rawEvent as StripeProgramEvent;
    if (event.id !== stored.providerEventId) {
      throw new ApplicationError('FORBIDDEN', 'Stripe event identifier mismatch');
    }
    await dependencies.process(db, stored.paymentConfigurationId, event, stored.payloadDigest);
    const recovered = await db.paymentWebhookEvent.findFirst({
      where: {
        id: stored.id,
        workspaceId: input.workspaceId,
        status: { in: ['PROCESSED', 'IGNORED'] },
      },
      select: { status: true },
    });
    if (!recovered) throw new ApplicationError('CONFLICT', 'payment webhook is still unresolved');
    await audit('WEBHOOK_REPLAY_SUCCEEDED');
    return { status: recovered.status };
  } catch (error) {
    await audit('WEBHOOK_REPLAY_FAILED');
    throw error;
  }
}
