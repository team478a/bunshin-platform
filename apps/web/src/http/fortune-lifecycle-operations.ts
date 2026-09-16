import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export interface FortuneLifecycleSummary {
  deleted: number;
}

export async function runExpiredFortuneReadingPurge(
  now = new Date(),
): Promise<FortuneLifecycleSummary> {
  const db = await import('@bunshin/database');
  return { deleted: await db.purgeExpiredFortuneReadings(db.prisma, now) };
}

export async function fortuneLifecycleOperationsResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (environment.APP_ENV !== 'production') return Response.json({ mode: 'disabled', requestId });
    const result = await runExpiredFortuneReadingPurge();
    logger.info('fortune reading lifecycle batch complete', {
      requestId,
      route: '/api/internal/fortune/purge-expired',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('fortune reading lifecycle batch failed', {
      requestId,
      route: '/api/internal/fortune/purge-expired',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
