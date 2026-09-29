import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const scope = { workspaceId: z.uuid(), groupId: z.uuid(), programEnrollmentId: z.uuid() };
const schema = z.discriminatedUnion('action', [
  z.object({ ...scope, action: z.literal('preview') }).strict(),
  z
    .object({
      ...scope,
      action: z.literal('execute'),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal('APPLY_TRAINING_RETENTION'),
    })
    .strict(),
]);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function trainingRetentionExecutionResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (request.method !== 'POST')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'POST' } });
    if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1024) {
          await reader.cancel();
          return Response.json({ requestId }, { status: 413, headers });
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let json: unknown;
    try {
      json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'valid JSON required');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid retention request required');
    const input = parsed.data;
    const environment = getServerEnvironment();
    if (input.action === 'execute' && !['development', 'staging'].includes(environment.APP_ENV)) {
      return Response.json({ mode: 'DISABLED', requestId }, { status: 503, headers });
    }
    const { PrismaTrainingRetentionExecutionRepository } = await import('@bunshin/database');
    const repository = new PrismaTrainingRetentionExecutionRepository();
    const data = {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: input.programEnrollmentId,
      operatorUserId: actor.userId,
      now: new Date(),
    };
    const result =
      input.action === 'preview'
        ? await repository.preview(data)
        : await repository.execute({ ...data, revision: input.revision });
    const status =
      result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : result.outcome === 'TOO_LARGE'
            ? 413
            : result.outcome === 'CONFLICT'
              ? 409
              : 200;
    return Response.json({ data: result, requestId }, { status, headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
