import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { createDirectProgramCheckout, createProgramCheckout } from '../payments/program-purchase';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  verifyStripeWebhookSignature,
} from '../payments/secure-configuration';
import {
  processStripeProgramEvent,
  type StripeProgramEvent,
} from '../payments/stripe-program-event';

const uuid = z.string().uuid();
const checkoutSchema = z.object({ offeringId: uuid, idempotencyKey: uuid }).strict();
const directCheckoutSchema = z.object({ idempotencyKey: uuid }).strict();

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

export async function createDirectProgramCheckoutResponse(
  request: Request,
  serviceSlug: string,
  rawOfferingId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    }
    const [actor, value] = await Promise.all([
      (await currentUserProvider()).getCurrentUser(),
      directCheckoutSchema.parseAsync(request.json()),
    ]);
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [service, db] = await Promise.all([
      resolveMemberServiceContext(serviceSlug, actor.userId),
      import('@bunshin/database'),
    ]);
    const data = await createDirectProgramCheckout(db.prisma, {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      buyerUserId: actor.userId,
      offeringId: uuid.parse(rawOfferingId),
      idempotencyKey: value.idempotencyKey,
      serviceSlug,
    });
    return json(data, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}

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
    const event = JSON.parse(rawBody) as StripeProgramEvent;
    const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
    await processStripeProgramEvent(db.prisma, configuration.id, event, payloadDigest);
    return json({ received: true }, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
