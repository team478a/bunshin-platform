import 'server-only';
import {
  ExpireAvailablePointGrants,
  InspectPointBalances,
  ReleaseExpiredPointReservations,
} from '@bunshin/application';
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
    const expiration = await new ExpireAvailablePointGrants(
      new db.PrismaPointExpirationRepository(db.prisma),
    ).execute({ limit: 100 });
    const reconciliation = await new InspectPointBalances(
      new db.PrismaPointBalanceReconciliationRepository(db.prisma),
    ).execute({ limit: 100 });
    if (reconciliation.mismatchCount > 0) {
      logger.warn('point balance mismatch detected', {
        requestId,
        route: '/api/internal/points/release-expired',
        accountsChecked: reconciliation.accountsChecked,
        mismatchCount: reconciliation.mismatchCount,
        reportedMismatchCount: reconciliation.mismatches.length,
      });
    }
    logger.info('point expiration maintenance completed', {
      requestId,
      route: '/api/internal/points/release-expired',
      released,
      ...expiration,
      accountsChecked: reconciliation.accountsChecked,
      mismatchCount: reconciliation.mismatchCount,
      latency: Date.now() - started,
    });
    return Response.json({
      released,
      ...expiration,
      accountsChecked: reconciliation.accountsChecked,
      mismatchCount: reconciliation.mismatchCount,
      requestId,
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('point expiration maintenance failed', {
      requestId,
      route: '/api/internal/points/release-expired',
      status: mapped.status,
      errorCode: mapped.body.error.code,
      latency: Date.now() - started,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
