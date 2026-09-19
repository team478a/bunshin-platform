import 'server-only';
import {
  AI_RESALE_V1_MODULE_KEY,
  parseAiResaleOfferTerms,
  parseAiResaleRuntimeSettings,
} from '@bunshin/capability-resale';
import { parseProgramProductTerms } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@bunshin/database';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeCheckoutAdapter,
} from './secure-configuration';

type Db = PrismaClient | Prisma.TransactionClient;
type CheckoutDependencies = {
  crypto: Pick<AesGcmPaymentSecretCrypto, 'decrypt'>;
  stripe: Pick<StripeCheckoutAdapter, 'create'>;
};

async function validatedDirectPurchaseContext(
  db: Db,
  input: {
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    offeringId: string;
  },
  options: { requireActivePayment?: boolean; requireActiveOffering?: boolean } = {},
) {
  const now = new Date();
  const [offering, paymentConfiguration, membership] = await Promise.all([
    db.programOffering.findFirst({
      where: {
        id: input.offeringId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status:
          options.requireActiveOffering === false
            ? { in: ['ACTIVE', 'SUSPENDED', 'SUPERSEDED'] }
            : 'ACTIVE',
        isFree: false,
        ...(options.requireActiveOffering === false
          ? {}
          : {
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
            }),
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
    db.groupMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.buyerUserId,
        serviceRole: 'PARTICIPANT',
        status: 'ACTIVE',
      },
    }),
  ]);
  const terms = offering ? parseProgramProductTerms(offering.termsSnapshot) : null;
  if (!offering || !membership || !terms) {
    throw new ApplicationError('NOT_FOUND', 'program product unavailable');
  }
  if (options.requireActiveOffering !== false) {
    const legalDocuments = await db.serviceLegalDocument.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        type: { in: ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] },
        status: 'PUBLISHED',
        effectiveAt: { lte: now },
      },
      select: { type: true },
    });
    if (new Set(legalDocuments.map(({ type }) => type)).size !== 3) {
      throw new ApplicationError('CONFIGURATION_ERROR', 'commerce legal documents are not ready');
    }
  }
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
  const [program, enrolled] = await Promise.all([
    db.serviceProgram.findFirst({
      where: {
        id: offering.serviceProgramId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ACTIVE',
      },
    }),
    db.programEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: membership.id,
        serviceProgramId: offering.serviceProgramId,
      },
      select: { id: true },
    }),
  ]);
  if (!program) throw new ApplicationError('NOT_FOUND', 'program product unavailable');
  if (enrolled) throw new ApplicationError('CONFLICT', 'member already has this program');
  return { offering, paymentConfiguration, membership, program, terms };
}

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
  dependencies: CheckoutDependencies = {
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
  let session;
  try {
    session = await dependencies.stripe.create({
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
  } catch (error) {
    await client.programPurchase.updateMany({
      where: { id: purchase.id, status: 'CREATED' },
      data: { status: 'FAILED' },
    });
    throw error;
  }
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

export async function createDirectProgramCheckout(
  client: PrismaClient,
  input: {
    workspaceId: string;
    groupId: string;
    buyerUserId: string;
    offeringId: string;
    idempotencyKey: string;
    serviceSlug: string;
  },
  dependencies: CheckoutDependencies = {
    crypto: new AesGcmPaymentSecretCrypto(),
    stripe: new StripeCheckoutAdapter(),
  },
) {
  const context = await validatedDirectPurchaseContext(client, input);
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
      existing.sourceEnrollmentId !== null ||
      existing.programOfferingId !== input.offeringId)
  ) {
    throw new ApplicationError('CONFLICT', 'idempotency key already used');
  }
  const unsettled = await client.programPurchase.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      buyerUserId: input.buyerUserId,
      programOfferingId: input.offeringId,
      OR: [
        { status: 'PAID' },
        { status: 'CREATED' },
        { status: 'CHECKOUT_OPEN', checkoutExpiresAt: { gt: new Date() } },
      ],
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    select: { id: true },
  });
  if (unsettled) throw new ApplicationError('CONFLICT', 'purchase already exists');
  const purchase =
    existing ??
    (await client.programPurchase.create({
      data: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        buyerUserId: input.buyerUserId,
        groupMembershipId: context.membership.id,
        sourceEnrollmentId: null,
        programOfferingId: context.offering.id,
        paymentConfigurationId: context.paymentConfiguration.id,
        amountYen: context.terms.amountYen,
        currency: context.terms.currency,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          productKind: context.terms.productKind,
          purchaseMode: context.terms.purchaseMode,
        },
      },
    }));
  if (purchase.status === 'PAID') throw new ApplicationError('CONFLICT', 'purchase already paid');
  const baseUrl = getServerEnvironment().APP_URL;
  const returnPath = `/s/${encodeURIComponent(input.serviceSlug)}/programs`;
  let session;
  try {
    session = await dependencies.stripe.create({
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
  } catch (error) {
    await client.programPurchase.updateMany({
      where: { id: purchase.id, status: 'CREATED' },
      data: { status: 'FAILED' },
    });
    throw error;
  }
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
        const legacyContext = purchase.sourceEnrollmentId
          ? await validatedPurchaseContext(
              tx,
              {
                workspaceId: purchase.workspaceId,
                groupId: purchase.groupId,
                buyerUserId: purchase.buyerUserId,
                sourceEnrollmentId: purchase.sourceEnrollmentId,
                offeringId: purchase.programOfferingId,
              },
              { requireActivePayment: false },
            )
          : null;
        const directContext = purchase.sourceEnrollmentId
          ? null
          : await validatedDirectPurchaseContext(
              tx,
              {
                workspaceId: purchase.workspaceId,
                groupId: purchase.groupId,
                buyerUserId: purchase.buyerUserId,
                offeringId: purchase.programOfferingId,
              },
              { requireActivePayment: false, requireActiveOffering: false },
            );
        if (!legacyContext && !directContext) {
          throw new ApplicationError('NOT_FOUND', 'purchase target unavailable');
        }
        const progress = legacyContext
          ? await tx.programProgressSnapshot.findUnique({
              where: { programEnrollmentId: legacyContext.source.id },
            })
          : null;
        if (
          legacyContext &&
          !['NOT_STARTED', 'PARTIAL', 'LISTED'].includes(progress?.bottleneckKey ?? '')
        ) {
          throw new ApplicationError('FORBIDDEN', 'DAY7 classification required');
        }
        const program = legacyContext?.program ?? directContext!.program;
        const offering = legacyContext?.offering ?? directContext!.offering;
        const supportMode = legacyContext?.runtime.supportMode ?? directContext!.terms.supportMode;
        const durationDays = legacyContext?.terms.durationDays ?? directContext!.terms.durationDays;
        const timeZone = legacyContext?.runtime.timeZone ?? directContext!.terms.timeZone;
        const termsSnapshot = legacyContext
          ? { ...legacyContext.terms, supportModes: [...legacyContext.terms.supportModes] }
          : { ...directContext!.terms };
        const now = new Date();
        const enrollment = await tx.programEnrollment.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            groupMembershipId: purchase.groupMembershipId,
            serviceProgramId: program.id,
            programOfferingId: offering.id,
            status: 'ACTIVE',
            supportMode,
            goalSnapshot: legacyContext
              ? {
                  source: 'STRIPE_CHECKOUT',
                  freeEnrollmentId: legacyContext.source.id,
                  classification: progress!.bottleneckKey,
                }
              : { source: 'DIRECT_STRIPE_CHECKOUT' },
            offeringSnapshot: {
              version: offering.version,
              isFree: false,
              priceReference: offering.priceReference,
              terms: termsSnapshot,
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
              durationDays,
              timeZone,
            ),
          },
        });
        await tx.programActionEvent.create({
          data: {
            workspaceId: purchase.workspaceId,
            groupId: purchase.groupId,
            programEnrollmentId: legacyContext?.source.id ?? enrollment.id,
            eventType: 'PAID_ENROLLED',
            sourceResourceType: 'PROGRAM_ENROLLMENT',
            sourceResourceId: enrollment.id,
            idempotencyKey: `stripe:checkout:${input.checkoutSessionId}`,
            metadata: {
              paidEnrollmentId: enrollment.id,
              purchaseId: purchase.id,
              offeringId: offering.id,
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
          input.amountRefunded < 0 ||
          input.amountRefunded > input.amount ||
          purchase.currency.toLowerCase() !== input.currency.toLowerCase()
        ) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhook.id },
            data: { status: 'FAILED', errorCategory: 'PURCHASE_MISMATCH', processedAt: new Date() },
          });
          throw new ApplicationError('FORBIDDEN', 'purchase verification failed');
        }
        const isFullRefund = input.fullyRefunded && input.amountRefunded >= purchase.amountYen;
        const refundedAmountYen = Math.max(
          purchase.refundedAmountYen,
          Math.min(input.amountRefunded, purchase.amountYen),
        );
        const now = new Date();
        if (!isFullRefund) {
          await tx.programPurchase.update({
            where: { id: purchase.id },
            data: { refundedAmountYen },
          });
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
            programEnrollmentId: purchase.sourceEnrollmentId ?? purchase.paidEnrollmentId,
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
          data: {
            status: 'REFUNDED',
            refundedAmountYen: purchase.amountYen,
            refundedAt: now,
          },
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
          programEnrollmentId: purchase.sourceEnrollmentId ?? purchase.paidEnrollmentId!,
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
