import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { authorizeCronRequest } from './cron-security';

const schema = z.object({ workspaceId: z.uuid(), groupId: z.uuid() }).strict();
const logger = createLogger();
const route = '/api/internal/ai-training/enrollment-expiry-preview';
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function runTrainingEnrollmentExpiryPreview(
  scope: { workspaceId: string; groupId: string },
  now = new Date(),
) {
  const db = await import('@bunshin/database');
  return db.previewUnpurchasedTrainingEnrollmentExpiry(db.prisma, { ...scope, now });
}

export async function trainingEnrollmentExpiryPreviewResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    if (request.method !== 'POST')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'POST' } });
    const params = new URL(request.url).searchParams;
    if (new URL(request.url).search.length > 1024)
      return Response.json({ requestId }, { status: 413, headers });
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'unambiguous scope query without body required',
      );
    const parsed = schema.safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid service scope required');
    if (request.body) {
      const reader = request.body.getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          if (part.value.byteLength > 0) {
            await reader.cancel();
            throw new ApplicationError('VALIDATION_ERROR', 'body input is not accepted');
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    const result = await runTrainingEnrollmentExpiryPreview(parsed.data);
    logger.info('training enrollment expiry preview complete', {
      requestId,
      route,
      status: 200,
      latency: Date.now() - started,
      eligible: result.eligible,
      hasMore: result.hasMore,
    });
    return Response.json({ data: result, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('training enrollment expiry preview failed', {
      requestId,
      route,
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
