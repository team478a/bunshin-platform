import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { boundedLearningJson } from './personal-learning-request';
import { PrismaPersonalLearningSavedExamplesRepository, prisma } from '@bunshin/database';

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const createInput = z
  .object({ title: z.string().trim().min(1).max(160), content: z.string().trim().min(1).max(8000) })
  .strict();

export async function personalLearningSavedExamplesResponse(
  request: Request,
  serviceSlug: string,
  enrollmentId: string,
) {
  const requestId = request.headers.get('x-request-id') ?? 'learning-examples';
  try {
    if (!['GET', 'POST', 'DELETE'].includes(request.method))
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
    const repository = new PrismaPersonalLearningSavedExamplesRepository(prisma);
    if (request.method === 'GET') {
      const items = await repository.list(actor.scope);
      return Response.json({ data: items, requestId }, { headers });
    }
    const json = await boundedLearningJson(request, 12_000);
    if (request.method === 'DELETE') {
      const parsed = z.object({ id: z.uuid() }).strict().safeParse(json);
      if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid example id');
      if (!(await repository.delete(actor.scope, parsed.data.id)))
        throw new ApplicationError('NOT_FOUND', 'saved example unavailable');
      return Response.json({ data: { deleted: true }, requestId }, { headers });
    }
    const parsed = createInput.safeParse(json);
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid saved example');
    const result = await repository.save(actor.scope, {
      ...parsed.data,
      sourceType: 'LEARNER_AUTHORED',
      sourceId: randomUUID(),
    });
    if (result.outcome !== 'SAVED')
      throw new ApplicationError('VALIDATION_ERROR', 'invalid saved example');
    return Response.json({ data: result.item }, { status: 201, headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
