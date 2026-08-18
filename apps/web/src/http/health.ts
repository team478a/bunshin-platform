import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';

const logger = createLogger();

export async function readyResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    const { checkDatabaseReadiness } = await import('@bunshin/database');
    await checkDatabaseReadiness();
    logger.info('readiness check complete', {
      requestId,
      route: '/api/health/ready',
      status: 200,
      latency: Date.now() - started,
    });
    return Response.json({
      status: 'ready',
      environment: environment.APP_ENV,
      checks: { configuration: 'ok', database: 'ok' },
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('readiness check failed', {
      requestId,
      route: '/api/health/ready',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
