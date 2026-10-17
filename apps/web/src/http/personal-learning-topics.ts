import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { boundedLearningJson } from './personal-learning-request';
import { PrismaPersonalLearningTopicRepository, prisma } from '@bunshin/database';

const body = z.object({ title: z.string().trim().min(1).max(160) }).strict();

export async function personalLearningTopicsResponse(
  request: Request,
  slug: string,
  enrollmentId: string,
) {
  const headers = { 'cache-control': 'private, no-store' };
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (request.method === 'POST') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const actor = await resolvePersonalLearningRequestActor(slug, enrollmentId, user.userId);
    const repo = new PrismaPersonalLearningTopicRepository(prisma);
    if (request.method === 'GET')
      return Response.json({ data: await repo.list(actor.scope) }, { headers });
    const input = body.parse(await boundedLearningJson(request, 2_000));
    return Response.json({ data: await repo.create(actor.scope, input) }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid learning topic')
        : error,
      'learning-topics',
    );
    return Response.json(
      { error: { code: mapped.body.error.code, message: 'テーマを読み込めませんでした。' } },
      { status: mapped.status, headers },
    );
  }
}
