import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { PRACTICE_SUPPORT_REASONS } from '@bunshin/application';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { requestPracticeSupport } from '../services/personal-learning-practice-support';
import { boundedLearningJson } from './personal-learning-request';

const body = z
  .object({
    assignmentId: z.string().uuid(),
    operationId: z.string().uuid(),
    expectedNoteRevision: z.number().int().min(0).max(999),
    expectedSupportRevision: z.number().int().min(0).max(999),
    reason: z.enum(PRACTICE_SUPPORT_REASONS),
    text: z.string().trim().min(1).max(500),
  })
  .strict();
export async function learningPracticeSupportResponse(
  request: Request,
  slug: string,
  enrollmentId: string,
) {
  const headers = { 'cache-control': 'private, no-store' };
  try {
    if (request.method !== 'POST')
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const actor = await resolvePersonalLearningRequestActor(slug, enrollmentId, user.userId);
    const input = body.parse(await boundedLearningJson(request));
    return Response.json({ data: await requestPracticeSupport({ actor, ...input }) }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid support input')
        : error,
      'learning-practice-support',
    );
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message:
            '支援を取得できませんでした。相談と現在の課題を再読込して確認してください。費用や通信状態が不明の場合は運営の確認が必要です。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}
