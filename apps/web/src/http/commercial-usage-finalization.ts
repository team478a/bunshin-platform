import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { authorizeCronRequest } from './cron-security';

export async function commercialUsageFinalizationResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    const db = await import('@bunshin/database');
    const result = await new db.PrismaCommercialUsageService().finalizeAllPreviousMonths();
    createLogger().info('commercial usage months finalized', { requestId, ...result });
    return Response.json({ data: result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    createLogger().error('commercial usage finalization failed', {
      requestId,
      status: mapped.status,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
