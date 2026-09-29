import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { authorizeCronRequest } from './cron-security';

const schema = z.object({ workspaceId: z.uuid(), groupId: z.uuid() }).strict();
const logger = createLogger();
const route = '/api/internal/ai-training/expire-enrollments';
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

export async function runTrainingEnrollmentExpiry(
  scope: { workspaceId: string; groupId: string },
  now = new Date(),
) {
  const db = await import('@bunshin/database');
  return db.expireUnpurchasedTrainingEnrollments(db.prisma, { ...scope, now });
}

export async function trainingEnrollmentExpiryResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (request.method !== 'POST')
      return Response.json({ requestId }, { status: 405, headers: { ...headers, allow: 'POST' } });
    // Production activation and scheduler registration require a separate review.
    if (!['development', 'staging'].includes(environment.APP_ENV))
      return Response.json({ mode: 'DISABLED', requestId }, { status: 503, headers });
    const params = new URL(request.url).searchParams;
    if (new URL(request.url).search.length > 1024)
      return Response.json({ requestId }, { status: 413, headers });
    if (request.body || [...params.keys()].some((key) => params.getAll(key).length !== 1))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'unambiguous scope query without body required',
      );
    const parsed = schema.safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new ApplicationError('VALIDATION_ERROR', 'valid service scope required');
    const result = await runTrainingEnrollmentExpiry(parsed.data);
    logger.info('training enrollment expiry batch complete', {
      requestId,
      route,
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ data: result, requestId }, { headers });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('training enrollment expiry batch failed', {
      requestId,
      route,
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status, headers });
  }
}
