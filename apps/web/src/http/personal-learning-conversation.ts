import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { sendPersonalLearningConversationTurn } from '../services/personal-learning-conversation';
import { boundedLearningJson } from './personal-learning-request';
import { PrismaPersonalLearningConversationRepository, prisma } from '@bunshin/database';

const body = z
  .object({
    requestId: z.string().uuid(),
    requestRevision: z.number().int().min(1).max(2147483646),
    operationId: z.string().uuid(),
    text: z.string().trim().min(1).max(1200),
  })
  .strict();
const sharingBody = z
  .object({
    requestId: z.string().uuid(),
    requestRevision: z.number().int().min(1).max(2147483646),
    operationId: z.string().uuid(),
    shared: z.boolean(),
  })
  .strict();

export async function personalLearningConversationResponse(
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
    const actor = await resolvePersonalLearningRequestActor(
      slug,
      enrollmentId,
      user.userId,
      'conversation',
      new URL(request.url).searchParams.get('topicId'),
    );
    const input = body.parse(await boundedLearningJson(request, 8_000));
    const data = await sendPersonalLearningConversationTurn({ actor, ...input });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid conversation turn')
        : error,
      'learning-conversation',
    );
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message:
            mapped.body.error.code === 'FORBIDDEN'
              ? '本日の研修利用上限に達したか、費用・接続の確認が必要です。入力は会話履歴に保存されています。'
              : '返信を取得できませんでした。入力は保持されています。費用や通信状態が不明な場合は、再送せず運営者に確認してください。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}

export async function personalLearningConversationSharingResponse(
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
    const actor = await resolvePersonalLearningRequestActor(
      slug,
      enrollmentId,
      user.userId,
      'conversation',
      new URL(request.url).searchParams.get('topicId'),
    );
    const input = sharingBody.parse(await boundedLearningJson(request, 2_000));
    const data = await new PrismaPersonalLearningConversationRepository(
      prisma,
    ).setConversationSharing({ actor, ...input });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid conversation sharing operation')
        : error,
      'learning-conversation-share',
    );
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message: '共有状態を変更できませんでした。会話を再読込して確認してください。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}
