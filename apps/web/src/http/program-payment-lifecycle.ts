import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export async function runProgramPaymentLifecycle(now = new Date()) {
  const db = await import('@bunshin/database');
  const { expireEndedPaidProgramEnrollments } = await import('../payments/program-purchase');
  return expireEndedPaidProgramEnrollments(db.prisma, now);
}

export async function programPaymentLifecycleResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (environment.APP_ENV !== 'production') return Response.json({ mode: 'disabled', requestId });
    const result = await runProgramPaymentLifecycle();
    logger.info('program payment lifecycle batch complete', {
      requestId,
      route: '/api/internal/payments/expire-programs',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ data: result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('program payment lifecycle batch failed', {
      requestId,
      route: '/api/internal/payments/expire-programs',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
