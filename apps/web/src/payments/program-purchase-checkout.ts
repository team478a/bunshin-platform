import 'server-only';
import { AI_RESALE_V1_MODULE_KEY } from '@bunshin/capability-resale';
import { getServerEnvironment } from '@bunshin/config';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import {
  validatedDirectPurchaseContext,
  validatedPurchaseContext,
} from './program-purchase-context';
import { AesGcmPaymentSecretCrypto, StripeCheckoutAdapter } from './secure-configuration';

type CheckoutDependencies = {
  crypto: Pick<AesGcmPaymentSecretCrypto, 'decrypt'>;
  stripe: Pick<StripeCheckoutAdapter, 'create'>;
};

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
  if (['PAID', 'DISPUTED', 'CHARGEBACK_LOST', 'REFUNDED'].includes(purchase.status)) {
    throw new ApplicationError('CONFLICT', 'purchase already settled');
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
        { status: 'DISPUTED' },
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
  if (['PAID', 'DISPUTED', 'CHARGEBACK_LOST', 'REFUNDED'].includes(purchase.status)) {
    throw new ApplicationError('CONFLICT', 'purchase already settled');
  }
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
