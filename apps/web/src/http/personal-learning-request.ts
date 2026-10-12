import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
const logger = createLogger();

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0);
const body = z
  .object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    idempotencyKey: z.string().uuid(),
    content: z
      .object({
        originalText: text(2000),
        deviceType: z.enum(['SMARTPHONE', 'PC', 'BOTH']).nullable(),
        toolDescription: text(240).nullable(),
        experienceDescription: text(300).nullable(),
        currentPosition: text(500).nullable(),
      })
      .strict(),
  })
  .strict();
async function boundedJson(request: Request) {
  if (!request.body) throw new ApplicationError('VALIDATION_ERROR', 'body required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        throw new ApplicationError('VALIDATION_ERROR', 'request too large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON encoding');
  }
}
export async function personalLearningRequestResponse(
  request: Request,
  slug: string,
  enrollmentId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const headers = { 'cache-control': 'private, no-store' };
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { error: { code: 'METHOD_NOT_ALLOWED' }, requestId },
        { status: 405, headers },
      );
    if (request.method === 'POST') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = await resolvePersonalLearningRequestActor(slug, enrollmentId, actor.userId);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaPersonalLearningRequestRepository(db.prisma);
    const saved =
      request.method === 'GET'
        ? await repository.readRequest(input)
        : await repository.saveRequest({ ...input, ...body.parse(await boundedJson(request)) });
    return Response.json({ data: saved, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError || error instanceof SyntaxError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid learning request')
        : error,
      requestId,
    );
    logger.error('personal learning request failed', { requestId, code: mapped.body.error.code });
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message:
            mapped.body.error.code === 'CONFLICT'
              ? '保存内容が更新されています。再読込してから確認してください。'
              : '希望を保存できませんでした。内容と受講状態を確認してください。',
        },
        requestId,
      },
      { status: mapped.status, headers },
    );
  }
}
