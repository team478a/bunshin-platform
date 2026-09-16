import 'server-only';
import { FortunePolicyError } from '@bunshin/capability-fortune';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import {
  fortuneOperatorStatus,
  importFortuneKnowledge,
  setFortuneEnabled,
} from '../fortune/operator';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const body = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('IMPORT_KNOWLEDGE'),
      bunshinId: z.string().uuid(),
      pack: z.unknown(),
    })
    .strict(),
  z.object({ action: z.literal('SET_ENABLED'), enabled: z.boolean() }).strict(),
]);

const mappedError = (error: unknown) => {
  if (error instanceof z.ZodError)
    return new ApplicationError('VALIDATION_ERROR', 'invalid fortune operation', error);
  if (!(error instanceof FortunePolicyError)) return error;
  return new ApplicationError(
    error.code === 'UNSAFE_READING_OUTPUT' ? 'CONTENT_REJECTED' : 'VALIDATION_ERROR',
    error.message,
    error,
  );
};

async function actorId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

const result = (data: unknown, requestId: string, status = 200) =>
  Response.json({ data, requestId }, { status, headers: { 'cache-control': 'private, no-store' } });

export async function getFortuneOperationsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return result(await fortuneOperatorStatus(slug.parse(serviceSlug), await actorId()), requestId);
  } catch (error) {
    const mapped = toApiError(mappedError(error), requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function updateFortuneOperationsResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actorUserId = await actorId();
    const requestBody: unknown = await request.json();
    const value = await body.parseAsync(requestBody);
    const parsedSlug = slug.parse(serviceSlug);
    if (value.action === 'IMPORT_KNOWLEDGE')
      return result(
        await importFortuneKnowledge({
          serviceSlug: parsedSlug,
          actorUserId,
          bunshinId: value.bunshinId,
          pack: value.pack,
        }),
        requestId,
        201,
      );
    return result(
      await setFortuneEnabled({ serviceSlug: parsedSlug, actorUserId, enabled: value.enabled }),
      requestId,
    );
  } catch (error) {
    const mapped = toApiError(mappedError(error), requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
