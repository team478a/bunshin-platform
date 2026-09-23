import 'server-only';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import {
  validatedDirectPurchaseContext,
  validatedPurchaseContext,
} from './program-purchase-context';
import { AesGcmPaymentSecretCrypto, currentPaymentEnvironment } from './secure-configuration';

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
