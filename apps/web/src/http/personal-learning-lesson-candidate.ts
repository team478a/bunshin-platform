import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { prepareLearningLesson } from '../services/personal-learning-lesson-candidate';
import { boundedLearningJson } from './personal-learning-request';

const body = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('GENERATE'),
      requestId: z.string().uuid(),
      requestRevision: z.number().int().positive(),
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('CONFIRM'),
      requestId: z.string().uuid(),
      requestRevision: z.number().int().positive(),
      candidateId: z.string().uuid(),
    })
    .strict(),
]);
export async function learningCandidateResponse(
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
    const actor = await resolvePersonalLearningRequestActor(
      slug,
      enrollmentId,
      user.userId,
      undefined,
      new URL(request.url).searchParams.get('topicId'),
    );
    const db = await import('@bunshin/database');
    const repo = new db.PrismaLearningCandidateRepository(db.prisma);
    if (request.method === 'GET')
      return Response.json({ data: await repo.readCandidate(actor) }, { headers });
    const input = body.parse(await boundedLearningJson(request));
    const data =
      input.action === 'GENERATE'
        ? await prepareLearningLesson(
            actor,
            input.requestId,
            input.requestRevision,
            input.operationId,
          )
        : await repo.confirm({
            actor,
            requestId: input.requestId,
            requestRevision: input.requestRevision,
            candidateId: input.candidateId,
          });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid candidate request')
        : error,
      'learning-candidate',
    );
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message: '教材候補を確認できませんでした。保存した希望と受講状態を確認してください。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}
