import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { completePaidProgramPurchase, createProgramCheckout } from '../payments/program-purchase';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  verifyStripeWebhookSignature,
} from '../payments/secure-configuration';

const uuid = z.string().uuid();
const checkoutSchema = z.object({ offeringId: uuid, idempotencyKey: uuid }).strict();

const json = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(error, requestId);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

export async function createProgramCheckoutResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const [actor, value] = await Promise.all([
      (await currentUserProvider()).getCurrentUser(),
      checkoutSchema.parseAsync(request.json()),
    ]);
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, db] = await Promise.all([
      resolveMemberServiceContext(serviceSlug, actor.userId),
      import('@bunshin/database'),
    ]);
    const data = await createProgramCheckout(db.prisma, {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      buyerUserId: actor.userId,
      sourceEnrollmentId: uuid.parse(rawEnrollmentId),
      offeringId: value.offeringId,
      idempotencyKey: value.idempotencyKey,
      serviceSlug,
    });
    return json(data, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  livemode?: unknown;
  data?: {
    object?: {
      id?: unknown;
      payment_status?: unknown;
      payment_intent?: unknown;
      amount_total?: unknown;
      currency?: unknown;
      metadata?: Record<string, unknown>;
    };
  };
};

export async function stripeProgramWebhookResponse(request: Request, rawConfigurationId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const configurationId = uuid.parse(rawConfigurationId);
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new ApplicationError('FORBIDDEN', 'Stripe signature required');
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000)
      throw new ApplicationError('VALIDATION_ERROR', 'payload too large');
    const db = await import('@bunshin/database');
    const configuration = await db.prisma.organizationPaymentConfiguration.findFirst({
      where: {
        id: configurationId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
        status: { in: ['ACTIVE', 'DISABLED'] },
      },
    });
    if (!configuration?.encryptedWebhookSecret) {
      throw new ApplicationError('NOT_FOUND', 'payment webhook unavailable');
    }
    const webhookSecret = new AesGcmPaymentSecretCrypto().decrypt(
      configuration.encryptedWebhookSecret,
    );
    if (!verifyStripeWebhookSignature({ rawBody, signatureHeader: signature, webhookSecret })) {
      throw new ApplicationError('FORBIDDEN', 'invalid Stripe signature');
    }
    const event = JSON.parse(rawBody) as StripeEvent;
    if (typeof event.id !== 'string' || typeof event.type !== 'string') {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe event');
    }
    if (event.type !== 'checkout.session.completed') {
      await db.prisma.paymentWebhookEvent.upsert({
        where: {
          paymentConfigurationId_providerEventId: {
            paymentConfigurationId: configuration.id,
            providerEventId: event.id,
          },
        },
        create: {
          workspaceId: configuration.workspaceId,
          paymentConfigurationId: configuration.id,
          providerEventId: event.id,
          eventType: event.type,
          payloadDigest: createHash('sha256').update(rawBody).digest('hex'),
          status: 'IGNORED',
          processedAt: new Date(),
        },
        update: {},
      });
      return json({ received: true }, requestId);
    }
    const session = event.data?.object;
    const purchaseId = session?.metadata?.['purchase_id'];
    if (
      session?.payment_status !== 'paid' ||
      typeof session.id !== 'string' ||
      typeof purchaseId !== 'string' ||
      typeof session.amount_total !== 'number' ||
      typeof session.currency !== 'string' ||
      typeof event.livemode !== 'boolean'
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'incomplete Stripe checkout event');
    }
    await completePaidProgramPurchase(db.prisma, {
      configurationId: configuration.id,
      providerEventId: event.id,
      eventType: event.type,
      payloadDigest: createHash('sha256').update(rawBody).digest('hex'),
      purchaseId: uuid.parse(purchaseId),
      checkoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      amountTotal: session.amount_total,
      currency: session.currency,
      livemode: event.livemode,
    });
    return json({ received: true }, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
