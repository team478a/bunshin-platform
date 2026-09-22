import 'server-only';
import type { Prisma, PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { AesGcmPaymentSecretCrypto, currentPaymentEnvironment } from './secure-configuration';

type Db = PrismaClient | Prisma.TransactionClient;

export async function requireWebhookConfiguration(
  db: Db,
  input: { configurationId: string; livemode: boolean },
) {
  const configuration = await db.organizationPaymentConfiguration.findFirst({
    where: {
      id: input.configurationId,
      environment: currentPaymentEnvironment(),
      provider: 'STRIPE',
      status: { in: ['ACTIVE', 'DISABLED'] },
    },
  });
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'payment configuration missing');
  const expectsLive = new AesGcmPaymentSecretCrypto()
    .decrypt(configuration.encryptedSecretKey)
    .startsWith('sk_live_');
  if (input.livemode !== expectsLive) {
    throw new ApplicationError('FORBIDDEN', 'Stripe mode mismatch');
  }
  return configuration;
}

export async function receiveWebhookEvent(
  db: Db,
  input: {
    workspaceId: string;
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
  },
) {
  return db.paymentWebhookEvent.upsert({
    where: {
      paymentConfigurationId_providerEventId: {
        paymentConfigurationId: input.configurationId,
        providerEventId: input.providerEventId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      paymentConfigurationId: input.configurationId,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payloadDigest: input.payloadDigest,
      status: 'RECEIVED',
    },
    update: {},
  });
}

export async function recordFailedWebhookEvent(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
  },
) {
  const configuration = await client.organizationPaymentConfiguration.findFirst({
    where: { id: input.configurationId },
    select: { workspaceId: true },
  });
  if (!configuration) return;
  await client.paymentWebhookEvent.upsert({
    where: {
      paymentConfigurationId_providerEventId: {
        paymentConfigurationId: input.configurationId,
        providerEventId: input.providerEventId,
      },
    },
    create: {
      workspaceId: configuration.workspaceId,
      paymentConfigurationId: input.configurationId,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      payloadDigest: input.payloadDigest,
      status: 'FAILED',
      errorCategory: 'PROCESSING_FAILED',
      processedAt: new Date(),
    },
    update: {
      status: 'FAILED',
      errorCategory: 'PROCESSING_FAILED',
      processedAt: new Date(),
    },
  });
}
