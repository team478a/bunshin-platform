import 'server-only';
import { ReleaseExpiredPointReservations } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export async function pointRedemptionOperationsResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    const db = await import('@bunshin/database');
    const released = await new ReleaseExpiredPointReservations(
      new db.PrismaPointRedemptionRepository(),
    ).execute({ limit: 100 });
    logger.info('expired point reservations released', {
      requestId,
      route: '/api/internal/points/release-expired',
      released,
      latency: Date.now() - started,
    });
    return Response.json({ released, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('expired point reservation release failed', {
      requestId,
      route: '/api/internal/points/release-expired',
      status: mapped.status,
      errorCode: mapped.body.error.code,
      latency: Date.now() - started,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
