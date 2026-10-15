import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

const logger = createLogger();

export async function supportCaseRetentionResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  try {
    const environment = getServerEnvironment();
    authorizeCronRequest(request, environment.CRON_SECRET);
    if (environment.APP_ENV !== 'production') return Response.json({ mode: 'disabled', requestId });
    const db = await import('@bunshin/database');
    const result = { scanned: 0, deleted: 0, possiblyMore: false };
    for (let batch = 0; batch < 10; batch += 1) {
      const current = await db.purgeExpiredSupportCases(db.prisma);
      result.scanned += current.scanned;
      result.deleted += current.deleted;
      result.possiblyMore = current.possiblyMore;
      if (!current.possiblyMore || current.deleted === 0) break;
    }
    logger.info('support case retention batch complete', {
      requestId,
      route: '/api/internal/support-cases/purge-expired',
      status: 200,
      latency: Date.now() - started,
      ...result,
    });
    return Response.json({ ...result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    logger.error('support case retention batch failed', {
      requestId,
      route: '/api/internal/support-cases/purge-expired',
      status: mapped.status,
      latency: Date.now() - started,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
