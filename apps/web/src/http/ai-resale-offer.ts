import 'server-only';
import {
  AI_RESALE_OFFER_DECLINE_REASONS,
  AI_RESALE_OFFER_KINDS,
  AiResaleOfferError,
  AiResaleOfferService,
} from '@bunshin/capability-resale';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveMemberServiceContext } from '../services/public-service';
import { currentPaymentEnvironment } from '../payments/secure-configuration';

const uuid = z.string().uuid();
const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('VIEW'),
      offerKind: z.enum(AI_RESALE_OFFER_KINDS),
      idempotencyKey: uuid,
    })
    .strict(),
  z
    .object({
      type: z.literal('DECLINE_STANDARD'),
      reason: z.enum(AI_RESALE_OFFER_DECLINE_REASONS),
      idempotencyKey: uuid,
    })
    .strict(),
  z
    .object({
      type: z.literal('SELECT'),
      offerKind: z.enum(AI_RESALE_OFFER_KINDS),
      idempotencyKey: uuid,
    })
    .strict(),
]);

async function context(serviceSlug: string, rawEnrollmentId: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
  const db = await import('@bunshin/database');
  return {
    actor,
    service,
    freeEnrollmentId: uuid.parse(rawEnrollmentId),
    offers: new AiResaleOfferService(new db.PrismaAiResaleOfferRepository(db.prisma)),
  };
}

const response = (data: unknown, requestId: string) =>
  Response.json({ data, requestId }, { headers: { 'cache-control': 'private, no-store' } });

const failure = (error: unknown, requestId: string) => {
  const mapped = toApiError(
    error instanceof AiResaleOfferError ? new ApplicationError(error.code, error.message) : error,
    requestId,
  );
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { 'cache-control': 'private, no-store' },
  });
};

export async function getAiResaleOfferResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const { actor, service, freeEnrollmentId, offers } = await context(
      serviceSlug,
      rawEnrollmentId,
    );
    const data = await offers.current({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      freeEnrollmentId,
      now: new Date(),
    });
    return response(data, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function submitAiResaleOfferActionResponse(
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
    const [{ actor, service, freeEnrollmentId, offers }, action] = await Promise.all([
      context(serviceSlug, rawEnrollmentId),
      actionSchema.parseAsync(request.json()),
    ]);
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      actorUserId: actor.userId,
      freeEnrollmentId,
    };
    await offers.act({ ...scope, action, occurredAt: new Date() });
    const state = await offers.current({ ...scope, now: new Date() });
    const paymentConfiguration =
      action.type === 'SELECT'
        ? await (
            await import('@bunshin/database')
          ).prisma.organizationPaymentConfiguration.findFirst({
            where: {
              workspaceId: service.workspaceId,
              environment: currentPaymentEnvironment(),
              provider: 'STRIPE',
              status: 'ACTIVE',
              encryptedWebhookSecret: { not: null },
            },
            select: { id: true },
          })
        : null;
    return response(
      {
        state,
        redirectUrl:
          action.type === 'SELECT' && !paymentConfiguration
            ? (state.offer?.terms.applicationUrl ?? null)
            : null,
      },
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}
