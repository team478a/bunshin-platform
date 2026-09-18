import 'server-only';
import {
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleOfferTerms,
  parseAiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@bunshin/database';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeCheckoutAdapter,
} from './secure-configuration';

type Db = PrismaClient | Prisma.TransactionClient;

async function validatedPurchaseContext(
  db: Db,
  input: {
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    sourceEnrollmentId: string;
    offeringId: string;
  },
  options: { requireActivePayment?: boolean } = {},
) {
  const [source, offering, paymentConfiguration] = await Promise.all([
    db.programEnrollment.findFirst({
      where: {
        id: input.sourceEnrollmentId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'COMPLETED',
      },
    }),
    db.programOffering.findFirst({
      where: {
        id: input.offeringId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
        isFree: false,
      },
    }),
    db.organizationPaymentConfiguration.findUnique({
      where: {
        workspaceId_environment_provider: {
          workspaceId: input.workspaceId,
          environment: currentPaymentEnvironment(),
          provider: 'STRIPE',
        },
      },
    }),
  ]);
  if (!source || !offering) throw new ApplicationError('NOT_FOUND', 'purchase target unavailable');
  if (
    !paymentConfiguration ||
    ((options.requireActivePayment ?? true)
      ? paymentConfiguration.status !== 'ACTIVE'
      : !['ACTIVE', 'DISABLED'].includes(paymentConfiguration.status)) ||
    !paymentConfiguration.lastVerifiedAt ||
    !paymentConfiguration.encryptedWebhookSecret
  ) {
    throw new ApplicationError('CONFIGURATION_ERROR', 'organization payment is not active');
  }
  const [membership, program, selection] = await Promise.all([
    db.groupMembership.findFirst({
      where: {
        id: source.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.buyerUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
    db.serviceProgram.findFirst({
      where: {
        id: offering.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
      },
    }),
    db.programActionEvent.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: source.id,
        sourceResourceType: 'PROGRAM_OFFERING',
        sourceResourceId: offering.id,
        eventType: { in: ['STANDARD_OFFER_SELECTED', 'MONITOR_OFFER_SELECTED'] },
        actorUserId: input.buyerUserId,
      },
    }),
  ]);
  const terms = parseAiResaleOfferTerms(offering.termsSnapshot);
  const runtime = program ? parseAiResaleRuntimeSettings(program.settings) : null;
  if (!membership || !program || !terms || runtime?.policyKey !== 'PAID_90D' || !selection) {
    throw new ApplicationError('FORBIDDEN', 'selected paid offer required');
  }
  return { source, offering, paymentConfiguration, membership, program, terms, runtime };
}

export async function createProgramCheckout(
  client: PrismaClient,
  input: {
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    sourceEnrollmentId: string;
    offeringId: string;
    idempotencyKey: string;
    serviceSlug: string;
  },
  dependencies = {
    crypto: new AesGcmPaymentSecretCrypto(),
    stripe: new StripeCheckoutAdapter(),
  },
) {
  const context = await validatedPurchaseContext(client, input);
  const existing = await client.programPurchase.findUnique({
    where: {
      workspaceId_groupId_idempotencyKey: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (
    existing &&
    (existing.buyerUserId !== input.buyerUserId ||
      existing.sourceEnrollmentId !== input.sourceEnrollmentId ||
      existing.programOfferingId !== input.offeringId)
  ) {
    throw new ApplicationError('CONFLICT', 'idempotency key already used');
  }
  const purchase =
    existing ??
    (await client.programPurchase.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        buyerUserId: input.buyerUserId,
        groupMembershipId: context.membership.id,
        sourceEnrollmentId: context.source.id,
        programOfferingId: context.offering.id,
        paymentConfigurationId: context.paymentConfiguration.id,
        amountYen: context.terms.amountYen,
        currency: context.terms.currency,
        idempotencyKey: input.idempotencyKey,
        metadata: { moduleKey: AI_RESALE_V1_MODULE_KEY, offerKey: context.terms.offerKey },
      },
    }));
  if (purchase.status === 'PAID') {
    throw new ApplicationError('CONFLICT', 'purchase already paid');
  }
  const baseUrl = getServerEnvironment().APP_URL;
  const returnPath = `/s/${encodeURIComponent(input.serviceSlug)}/programs/${input.sourceEnrollmentId}`;
  const session = await dependencies.stripe.create({
    secretKey: dependencies.crypto.decrypt(context.paymentConfiguration.encryptedSecretKey),
    idempotencyKey: `program-purchase-${purchase.id}`,
    purchaseId: purchase.id,
    workspaceId: purchase.workspaceId,
    offeringId: purchase.programOfferingId,
    productName: context.program.displayName,
    amountYen: purchase.amountYen,
    successUrl: new URL(`${returnPath}?payment=success`, baseUrl).toString(),
    cancelUrl: new URL(`${returnPath}?payment=cancelled`, baseUrl).toString(),
  });
  await client.programPurchase.update({
    where: { id: purchase.id },
    data: {
      status: 'CHECKOUT_OPEN',
      providerCheckoutSessionId: session.id,
      checkoutExpiresAt: session.expiresAt,
    },
  });
  return { checkoutUrl: session.url };
}

export async function completePaidProgramPurchase(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
    purchaseId: string;
    checkoutSessionId: string;
    paymentIntentId: string | null;
    amountTotal: number;
    currency: string;
    livemode: boolean;
  },
) {
  try {
    return await client.$transaction(
      async (tx) => {
        const configuration = await tx.organizationPaymentConfiguration.findFirst({
          where: {
            id: input.configurationId,
            environment: currentPaymentEnvironment(),
            provider: 'STRIPE',
            status: { in: ['ACTIVE', 'DISABLED'] },
          },
        });
        if (!configuration)
          throw new ApplicationError('NOT_FOUND', 'payment configuration missing');
        const expectsLive = new AesGcmPaymentSecretCrypto()
          .decrypt(configuration.encryptedSecretKey)
          .startsWith('sk_live_');
        if (input.livemode !== expectsLive) {
          throw new ApplicationError('FORBIDDEN', 'Stripe mode mismatch');
        }
        const webhook = await tx.paymentWebhookEvent.upsert({
          where: {
            paymentConfigurationId_providerEventId: {
              paymentConfigurationId: configuration.id,
              providerEventId: input.providerEventId,
            },
          },
          create: {
            workspaceId: configuration.workspaceId,
            paymentConfigurationId: configuration.id,
            providerEventId: input.providerEventId,
            eventType: input.eventType,
            payloadDigest: input.payloadDigest,
            status: 'RECEIVED',
          },
          update: {},
        });
        if (webhook.status === 'PROCESSED' || webhook.status === 'IGNORED') return null;
        const purchase = await tx.programPurchase.findFirst({
          where: {
            id: input.purchaseId,
            workspaceId: configuration.workspaceId,
            paymentConfigurationId: configuration.id,
          },
        });
        if (
          !purchase ||
          purchase.providerCheckoutSessionId !== input.checkoutSessionId ||
          purchase.amountYen !== input.amountTotal ||
          purchase.currency.toLowerCase() !== input.currency.toLowerCase()
        ) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        if (purchase.status === 'PAID') {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'PROCESSED', processedAt: new Date() },
          });
          return purchase.paidEnrollmentId;
        }
        const context = await validatedPurchaseContext(
          tx,
          {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            buyerUserId: purchase.buyerUserId,
            sourceEnrollmentId: purchase.sourceEnrollmentId,
            offeringId: purchase.programOfferingId,
          },
          { requireActivePayment: false },
        );
        const progress = await tx.programProgressSnapshot.findUnique({
          where: { programEnrollmentId: context.source.id },
        });
        if (!['NOT_STARTED', 'PARTIAL', 'LISTED'].includes(progress?.bottleneckKey ?? '')) {
          throw new ApplicationError('FORBIDDEN', 'DAY7 classification required');
        }
        const now = new Date();
        const enrollment = await tx.programEnrollment.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            groupMembershipId: purchase.groupMembershipId,
            serviceProgramId: context.program.id,
            programOfferingId: context.offering.id,
            status: 'ACTIVE',
            supportMode: context.runtime.supportMode,
            goalSnapshot: {
              source: 'STRIPE_CHECKOUT',
              freeEnrollmentId: context.source.id,
              classification: progress!.bottleneckKey,
            },
            offeringSnapshot: {
              version: context.offering.version,
              isFree: false,
              priceReference: context.offering.priceReference,
              terms: { ...context.terms, supportModes: [...context.terms.supportModes] },
              paymentConfirmation: {
                provider: 'STRIPE',
                checkoutSessionId: input.checkoutSessionId,
                paymentIntentId: input.paymentIntentId,
                confirmedAt: now,
              },
            },
            invitedByUserId: purchase.buyerUserId,
            startsAt: now,
            endsAt: (await import('@bunshin/database')).addProgramCalendarDays(
              now,
              context.terms.durationDays,
              context.runtime.timeZone,
            ),
          },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            programEnrollmentId: context.source.id,
            eventType: 'PAID_ENROLLED',
            sourceResourceType: 'PROGRAM_ENROLLMENT',
            sourceResourceId: enrollment.id,
            idempotencyKey: `stripe:checkout:${input.checkoutSessionId}`,
            metadata: {
              paidEnrollmentId: enrollment.id,
              purchaseId: purchase.id,
              offeringId: context.offering.id,
              amountYen: purchase.amountYen,
              provider: 'STRIPE',
            },
            actorUserId: purchase.buyerUserId,
            occurredAt: now,
          },
        });
        await tx.programPurchase.update({
          where: { id: purchase.id },
          data: {
            status: 'PAID',
            providerPaymentIntentId: input.paymentIntentId,
            paidEnrollmentId: enrollment.id,
            paidAt: now,
          },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: now },
        });
        return enrollment.id;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    const configuration = await client.organizationPaymentConfiguration.findFirst({
      where: { id: input.configurationId },
      select: { workspaceId: true },
    });
    if (configuration) {
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
    throw error;
  }
}

async function requireWebhookConfiguration(
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

async function receiveWebhookEvent(
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

async function recordFailedWebhookEvent(
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

export async function expireProgramCheckout(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
    purchaseId: string;
    checkoutSessionId: string;
    livemode: boolean;
  },
) {
  try {
    return await client.$transaction(
      async (tx) => {
        const configuration = await requireWebhookConfiguration(tx, input);
        const webhook = await receiveWebhookEvent(tx, {
          ...input,
          workspaceId: configuration.workspaceId,
        });
        if (webhook.status === 'PROCESSED' || webhook.status === 'IGNORED') return false;
        const purchase = await tx.programPurchase.findFirst({
          where: {
            id: input.purchaseId,
            workspaceId: configuration.workspaceId,
            paymentConfigurationId: configuration.id,
            providerCheckoutSessionId: input.checkoutSessionId,
          },
        });
        if (!purchase) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        const now = new Date();
        if (purchase.status === 'CREATED' || purchase.status === 'CHECKOUT_OPEN') {
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: { status: 'EXPIRED', expiredAt: now },
          });
        }
        await tx.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: {
            status: ['CREATED', 'CHECKOUT_OPEN', 'EXPIRED'].includes(purchase.status)
              ? 'PROCESSED'
              : 'IGNORED',
            errorCategory: ['CREATED', 'CHECKOUT_OPEN', 'EXPIRED'].includes(purchase.status)
              ? null
              : 'PURCHASE_ALREADY_SETTLED',
            processedAt: now,
          },
        });
        return purchase.status === 'CREATED' || purchase.status === 'CHECKOUT_OPEN';
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    await recordFailedWebhookEvent(client, input);
    throw error;
  }
}

export async function refundPaidProgramPurchase(
  client: PrismaClient,
  input: {
    configurationId: string;
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
    paymentIntentId: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    fullyRefunded: boolean;
    livemode: boolean;
  },
) {
  try {
    return await client.$transaction(
      async (tx) => {
        const configuration = await requireWebhookConfiguration(tx, input);
        const webhook = await receiveWebhookEvent(tx, {
          ...input,
          workspaceId: configuration.workspaceId,
        });
        if (webhook.status === 'PROCESSED' || webhook.status === 'IGNORED') return false;
        const purchase = await tx.programPurchase.findFirst({
          where: {
            workspaceId: configuration.workspaceId,
            paymentConfigurationId: configuration.id,
            providerPaymentIntentId: input.paymentIntentId,
          },
        });
        if (
          !purchase ||
          purchase.amountYen !== input.amount ||
          purchase.currency.toLowerCase() !== input.currency.toLowerCase()
        ) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        const isFullRefund = input.fullyRefunded && input.amountRefunded >= purchase.amountYen;
        const now = new Date();
        if (!isFullRefund) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'IGNORED', errorCategory: 'PARTIAL_REFUND', processedAt: now },
          });
          return false;
        }
        if (purchase.status === 'REFUNDED') {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'PROCESSED', processedAt: now },
          });
          return false;
        }
        if (purchase.status !== 'PAID' || !purchase.paidEnrollmentId) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_NOT_PAID', processedAt: now },
          });
          throw new ApplicationError('CONFLICT', 'paid purchase required');
        }
        await tx.programEnrollment.updateMany({
          where: {
            id: purchase.paidEnrollmentId,
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            status: { in: ['ACTIVE', 'COMPLETED'] },
          },
          data: { status: 'CANCELLED', endsAt: now },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            programEnrollmentId: purchase.sourceEnrollmentId,
            eventType: 'PAYMENT_REFUNDED',
            sourceResourceType: 'PROGRAM_ENROLLMENT',
            sourceResourceId: purchase.paidEnrollmentId,
            idempotencyKey: `stripe:refund:${input.providerEventId}`,
            metadata: {
              purchaseId: purchase.id,
              paidEnrollmentId: purchase.paidEnrollmentId,
              amountYen: purchase.amountYen,
              provider: 'STRIPE',
            },
            actorUserId: purchase.buyerUserId,
            occurredAt: now,
          },
        });
        await tx.programPurchase.update({
          where: { id: purchase.id },
          data: { status: 'REFUNDED', refundedAt: now },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: now },
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    await recordFailedWebhookEvent(client, input);
    throw error;
  }
}

export async function expireEndedPaidProgramEnrollments(
  client: PrismaClient,
  now = new Date(),
  limit = 500,
) {
  const purchases = await client.programPurchase.findMany({
    where: {
      status: 'PAID',
      paidEnrollment: { status: 'ACTIVE', endsAt: { lte: now } },
    },
    select: {
      id: true,
      workspaceId: true,
      groupId: true,
      sourceEnrollmentId: true,
      paidEnrollmentId: true,
      buyerUserId: true,
    },
    orderBy: { paidEnrollment: { endsAt: 'asc' } },
    take: limit,
  });
  if (purchases.length === 0) return { expired: 0, remaining: false };
  let expired = 0;
  for (const purchase of purchases) {
    if (!purchase.paidEnrollmentId) continue;
    const changed = await client.$transaction(async (tx) => {
      const update = await tx.programEnrollment.updateMany({
        where: {
          id: purchase.paidEnrollmentId!,
          workspaceId: purchase.workspaceId,
          groupId: purchase.groupId,
          status: 'ACTIVE',
          endsAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      if (update.count === 0) return false;
      await tx.programActionEvent.create({
        data: {
          workspaceId: purchase.workspaceId,
          groupId: purchase.groupId,
          programEnrollmentId: purchase.sourceEnrollmentId,
          eventType: 'PAID_PROGRAM_EXPIRED',
          sourceResourceType: 'PROGRAM_ENROLLMENT',
          sourceResourceId: purchase.paidEnrollmentId!,
          idempotencyKey: `paid-program-expired:${purchase.paidEnrollmentId}`,
          metadata: { purchaseId: purchase.id, paidEnrollmentId: purchase.paidEnrollmentId },
          actorUserId: purchase.buyerUserId,
          occurredAt: now,
        },
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return { expired, remaining: purchases.length === limit };
}
