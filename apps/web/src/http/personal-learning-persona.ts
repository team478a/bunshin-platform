import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { requestIdFromHeader } from '@bunshin/observability';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { boundedLearningJson } from './personal-learning-request';
import { PrismaPersonalLearningPersonaRepository, prisma } from '@bunshin/database';

const input = z
  .object({
    itemId: z.uuid(),
    value: z.string().trim().min(1).max(1000).optional(),
    status: z.enum(['CONFIRMED', 'REJECTED']).optional(),
  })
  .strict()
  .refine((value) => value.value !== undefined || value.status !== undefined);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function personalLearningPersonaResponse(
  request: Request,
  serviceSlug: string,
  enrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    if (!['GET', 'PATCH', 'DELETE'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (request.method !== 'GET') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const actor = await resolvePersonalLearningRequestActor(
      serviceSlug,
      enrollmentId,
      user.userId,
      'multiTopic',
      undefined,
      { allowUnselectedTopic: true },
    );
    const repository = new PrismaPersonalLearningPersonaRepository(prisma);
    if (request.method === 'GET') {
      const items = await repository.list(actor.scope);
      return Response.json(
        {
          data: items.map((item) => ({
            id: item.id,
            attributeKey: item.attributeKey,
            value: item.value,
            status: item.status,
            evidenceType: item.evidenceType,
            evidenceId: item.evidenceId,
            evidenceCreatedAt: item.evidenceCreatedAt.toISOString(),
          })),
          requestId,
        },
        { headers },
      );
    }
    const json = await boundedLearningJson(request, 4096);
    if (request.method === 'DELETE') {
      const parsedDelete = z.object({ itemId: z.uuid() }).strict().safeParse(json);
      if (!parsedDelete.success)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid persona deletion');
      const deleted = await repository.delete(actor.scope, parsedDelete.data.itemId);
      if (!deleted) throw new ApplicationError('NOT_FOUND', 'persona item unavailable');
      return Response.json({ data: { deleted: true }, requestId }, { headers });
    }
    const parsed = input.safeParse(json);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid persona review');
    const result = await repository.review(actor.scope, parsed.data.itemId, {
      ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    });
    if (result.outcome === 'NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'persona item unavailable');
    if (result.outcome !== 'UPDATED' || !result.item)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid persona review');
    return Response.json(
      {
        data: {
          id: result.item.id,
          attributeKey: result.item.attributeKey,
          value: result.item.value,
          status: result.item.status,
          evidenceType: result.item.evidenceType,
          evidenceId: result.item.evidenceId,
          evidenceCreatedAt: result.item.evidenceCreatedAt.toISOString(),
        },
        requestId,
      },
      { headers },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
