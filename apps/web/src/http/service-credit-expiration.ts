import 'server-only';
import { ExpireServiceCredits } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export async function serviceCreditExpirationResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    const db = await import('@bunshin/database');
    const expired = await new ExpireServiceCredits(
      new db.PrismaServiceCreditExpirationRepository(),
    ).execute();
    logger.info('expired service credits processed', {
      requestId,
      route: '/api/internal/service-credits/expire',
      expired,
      latency: Date.now() - started,
    });
    return Response.json({ expired, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('service credit expiry failed', {
      requestId,
      route: '/api/internal/service-credits/expire',
      status: mapped.status,
      errorCode: mapped.body.error.code,
      latency: Date.now() - started,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
