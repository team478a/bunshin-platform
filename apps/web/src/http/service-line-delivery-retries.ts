import 'server-only';
import { RequestLineDeliveryRetry } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { resolveManagedServiceContext } from '../services/public-service';

const bodySchema = z.object({ reason: z.string().min(3).max(500) }).strict();
const idSchema = z.string().uuid();

export async function retryServiceLineDeliveryResponse(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; deliveryId: string }> },
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const { serviceSlug, deliveryId } = await context.params;
    const parsedId = idSchema.safeParse(deliveryId);
    let json: unknown;
    try {
      json = await request.json();
    } catch (error) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsedId.success || !parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid retry request');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const value = await new RequestLineDeliveryRetry(
      new db.PrismaLineDeliveryRetryRepository(),
    ).execute({
      requestId: randomUUID(),
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      deliveryId: parsedId.data,
      groupId: service.serviceId,
      reason: parsed.data.reason,
    });
    return Response.json(
      {
        data: {
          id: value.id,
          environment: value.environment,
          deliveryId: value.deliveryId,
          deliveryAttemptCount: value.deliveryAttemptCount,
          jobId: value.jobId,
          createdAt: value.createdAt.toISOString(),
        },
        requestId,
      },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
