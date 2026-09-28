import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const schema = z
  .object({
    action: z.enum(['COMPLETE', 'CANCEL', 'REOPEN']),
    expectedStatus: z.enum(['INVITED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED']),
    expectedUpdatedAt: z.iso.datetime(),
    operationId: z.uuid(),
    reason: z.string().trim().min(1).max(300),
    confirmation: z.literal('CHANGE_TRAINING_STATUS'),
  })
  .strict();
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
export async function trainingLifecycleResponse(
  request: Request,
  serviceSlug: string,
  rawEnrollmentId: string,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
      throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4096) {
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
    const id = z.uuid().safeParse(rawEnrollmentId);
    if (!parsed.success || !id.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid lifecycle request required');
    const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch((error) => {
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
        throw new ApplicationError('NOT_FOUND', 'managed service unavailable');
      throw error;
    });
    const db = await import('@bunshin/database');
    const result = await new db.PrismaTrainingLifecycleRepository().change({
      ...parsed.data,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      programEnrollmentId: id.data,
      actorUserId: actor.userId,
      expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
      now: new Date(),
    });
    const status =
      result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : ['CONFLICT', 'REOPEN_UNAVAILABLE'].includes(result.outcome)
            ? 409
            : 200;
    return Response.json({ data: result, requestId }, { status, headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
