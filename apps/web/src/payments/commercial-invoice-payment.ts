import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { Prisma, type PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import {
  StripeCommercialInvoiceCheckoutAdapter,
  StripePaymentMethodRetrievalAdapter,
} from './secure-configuration';

type CheckoutAdapter = Pick<StripeCommercialInvoiceCheckoutAdapter, 'create'>;
type PaymentMethodAdapter = Pick<StripePaymentMethodRetrievalAdapter, 'retrieve'>;

export interface StripeCommercialBillingEvent {
  id?: unknown;
  type?: unknown;
  livemode?: unknown;
  data?: {
    object?: {
      id?: unknown;
      amount_total?: unknown;
      currency?: unknown;
      payment_status?: unknown;
      payment_intent?: unknown;
      metadata?: Record<string, unknown>;
    };
  };
}

function platformStripeConfiguration() {
  const environment = getServerEnvironment();
  if (
    !environment.PLATFORM_BILLING_STRIPE_SECRET_KEY ||
    !environment.PLATFORM_BILLING_STRIPE_WEBHOOK_SECRET
  ) {
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'ワタシワークス月額請求のStripe設定が完了していません',
    );
  }
  return {
    secretKey: environment.PLATFORM_BILLING_STRIPE_SECRET_KEY,
    webhookSecret: environment.PLATFORM_BILLING_STRIPE_WEBHOOK_SECRET,
    appUrl: environment.APP_URL,
  };
}

export function platformBillingWebhookSecret(): string {
  return platformStripeConfiguration().webhookSecret;
}

export async function createCommercialInvoiceCheckout(
  client: PrismaClient,
  input: { workspaceId: string; invoiceId: string; actorUserId: string; now?: Date },
  adapter: CheckoutAdapter = new StripeCommercialInvoiceCheckoutAdapter(),
) {
  const now = input.now ?? new Date();
  const [authorized, invoice] = await Promise.all([
    client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
    client.tenantInvoice.findFirst({
      where: { id: input.invoiceId, workspaceId: input.workspaceId },
      include: { contract: true },
    }),
  ]);
  if (!authorized) throw new ApplicationError('FORBIDDEN', '団体管理者の権限が必要です');
  if (!invoice) throw new ApplicationError('NOT_FOUND', '請求が見つかりません');
  if (invoice.status !== 'ISSUED')
    throw new ApplicationError('CONFLICT', '支払い可能な請求ではありません');
  if (invoice.contract.status !== 'ACTIVE' || invoice.contract.billingMode !== 'EXTERNAL_BILLING') {
    throw new ApplicationError('CONFLICT', 'オンライン決済が有効ではありません');
  }
  if (
    invoice.checkoutUrl &&
    (!invoice.checkoutExpiresAt || invoice.checkoutExpiresAt.getTime() > now.getTime())
  ) {
    return { checkoutUrl: invoice.checkoutUrl, reused: true };
  }
  const configuration = platformStripeConfiguration();
  const returnPath = `/organizations/${input.workspaceId}/usage`;
  const checkout = await adapter.create({
    secretKey: configuration.secretKey,
    idempotencyKey: `platform-invoice:${invoice.id}:${invoice.updatedAt.getTime()}`,
    invoiceId: invoice.id,
    workspaceId: invoice.workspaceId,
    invoiceNumber: invoice.invoiceNumber,
    billingEmail: invoice.contract.billingEmail,
    amountYen: invoice.amountYen,
    successUrl: new URL(`${returnPath}?payment=success`, configuration.appUrl).toString(),
    cancelUrl: new URL(`${returnPath}?payment=cancelled`, configuration.appUrl).toString(),
    savePaymentMethod: invoice.contract.automaticCollectionEnabled,
    customerId: invoice.contract.stripeCustomerId,
  });
  const updated = await client.tenantInvoice.updateMany({
    where: { id: invoice.id, workspaceId: invoice.workspaceId, status: 'ISSUED' },
    data: {
      paymentProvider: 'STRIPE',
      providerCheckoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      checkoutExpiresAt: checkout.expiresAt,
      paymentAttemptedAt: now,
      paymentFailedAt: null,
      paymentFailureCategory: null,
    },
  });
  if (updated.count !== 1)
    throw new ApplicationError('CONFLICT', '請求状態が更新されたため、もう一度確認してください');
  return { checkoutUrl: checkout.url, reused: false };
}

function requiredEventIdentity(event: StripeCommercialBillingEvent) {
  const object = event.data?.object;
  const invoiceId = object?.metadata?.invoice_id;
  const workspaceId = object?.metadata?.workspace_id;
  if (
    typeof event.id !== 'string' ||
    !event.id.startsWith('evt_') ||
    typeof event.type !== 'string' ||
    typeof event.livemode !== 'boolean' ||
    typeof object?.id !== 'string' ||
    typeof invoiceId !== 'string' ||
    typeof workspaceId !== 'string'
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'incomplete Stripe billing event');
  }
  const expectedLiveMode = getServerEnvironment().APP_ENV === 'production';
  if (event.livemode !== expectedLiveMode)
    throw new ApplicationError('FORBIDDEN', 'Stripe billing environment mismatch');
  return {
    eventId: event.id,
    eventType: event.type,
    object,
    objectId: object.id,
    invoiceId,
    workspaceId,
  };
}

export async function processCommercialBillingStripeEvent(
  client: PrismaClient,
  event: StripeCommercialBillingEvent,
  payloadDigest: string,
  paymentMethodAdapter: PaymentMethodAdapter = new StripePaymentMethodRetrievalAdapter(),
) {
  const identity = requiredEventIdentity(event);
  if (!['checkout.session.completed', 'checkout.session.expired'].includes(identity.eventType)) {
    return { ignored: true, reason: 'EVENT_NOT_SUPPORTED' };
  }
  const invoice = await client.tenantInvoice.findFirst({
    where: { id: identity.invoiceId, workspaceId: identity.workspaceId },
    include: { contract: true },
  });
  if (!invoice) throw new ApplicationError('NOT_FOUND', 'billing invoice not found');
  if (
    invoice.paymentProvider !== 'STRIPE' ||
    invoice.providerCheckoutSessionId !== identity.objectId
  ) {
    throw new ApplicationError('FORBIDDEN', 'Stripe billing identity mismatch');
  }
  const previous = await client.commercialBillingWebhookEvent.findUnique({
    where: {
      provider_providerEventId: { provider: 'STRIPE', providerEventId: identity.eventId },
    },
  });
  if (previous) return { ignored: true, reason: 'DUPLICATE_EVENT' };
  if (
    identity.eventType === 'checkout.session.completed' &&
    (identity.object.payment_status !== 'paid' ||
      identity.object.currency !== 'jpy' ||
      identity.object.amount_total !== invoice.amountYen)
  ) {
    throw new ApplicationError('FORBIDDEN', 'Stripe billing amount or payment mismatch');
  }
  const paymentIntent = identity.object.payment_intent;
  if (
    identity.eventType === 'checkout.session.completed' &&
    paymentIntent !== null &&
    paymentIntent !== undefined &&
    typeof paymentIntent !== 'string'
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe payment intent');
  }
  const savedPaymentMethod =
    identity.eventType === 'checkout.session.completed' &&
    invoice.contract.automaticCollectionEnabled &&
    typeof paymentIntent === 'string'
      ? await paymentMethodAdapter.retrieve(platformStripeConfiguration().secretKey, paymentIntent)
      : null;

  try {
    return await client.$transaction(async (tx) => {
      const ledger = await tx.commercialBillingWebhookEvent.create({
        data: {
          workspaceId: invoice.workspaceId,
          invoiceId: invoice.id,
          provider: 'STRIPE',
          providerEventId: identity.eventId,
          eventType: identity.eventType,
          payloadDigest,
        },
      });
      if (identity.eventType === 'checkout.session.expired') {
        if (invoice.status === 'ISSUED') {
          await tx.tenantInvoice.update({
            where: { id: invoice.id },
            data: {
              checkoutUrl: null,
              checkoutExpiresAt: null,
              paymentFailedAt: new Date(),
              paymentFailureCategory: 'CHECKOUT_EXPIRED',
            },
          });
        }
        await tx.commercialBillingWebhookEvent.update({
          where: { id: ledger.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return { ignored: false, status: invoice.status };
      }
      if (invoice.status === 'ISSUED') {
        const paidAt = new Date();
        const updated = await tx.tenantInvoice.update({
          where: { id: invoice.id },
          data: {
            status: 'PAID',
            paidAt,
            paymentReference: typeof paymentIntent === 'string' ? paymentIntent : identity.objectId,
            providerPaymentIntentId: typeof paymentIntent === 'string' ? paymentIntent : null,
            checkoutUrl: null,
            paymentFailedAt: null,
            paymentFailureCategory: null,
          },
        });
        await tx.commercialBillingAudit.create({
          data: {
            workspaceId: invoice.workspaceId,
            actorUserId: invoice.updatedByUserId,
            entityType: 'INVOICE',
            entityId: invoice.id,
            action: 'PAYMENT_CONFIRMED',
            beforeData: JSON.parse(JSON.stringify(invoice)) as Prisma.InputJsonValue,
            afterData: JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue,
          },
        });
      }
      if (savedPaymentMethod) {
        await tx.organizationCommercialContract.updateMany({
          where: {
            id: invoice.contractId,
            workspaceId: invoice.workspaceId,
            automaticCollectionEnabled: true,
          },
          data: {
            stripeCustomerId: savedPaymentMethod.customerId,
            stripePaymentMethodId: savedPaymentMethod.paymentMethodId,
          },
        });
      }
      await tx.commercialBillingWebhookEvent.update({
        where: { id: ledger.id },
        data: {
          status: invoice.status === 'PAID' ? 'IGNORED' : 'PROCESSED',
          processedAt: new Date(),
        },
      });
      return { ignored: invoice.status === 'PAID', status: 'PAID' };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ignored: true, reason: 'DUPLICATE_EVENT' };
    }
    throw error;
  }
}
