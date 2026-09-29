import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();
const route = '/api/internal/fortune/recover-generating';

export async function runFortuneGenerationRecovery(now = new Date()) {
  const db = await import('@bunshin/database');
  return db.recoverStaleFortuneReadings(db.prisma, now);
}

export async function fortuneGenerationRecoveryResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (environment.APP_ENV !== 'production') return Response.json({ mode: 'disabled', requestId });
    const result = await runFortuneGenerationRecovery();
    logger.info('fortune interrupted generation recovery complete', {
      requestId,
      route,
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('fortune interrupted generation recovery failed', {
      requestId,
      route,
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
