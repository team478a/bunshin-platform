import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { collectCommercialInvoices } from '../payments/commercial-invoice-automatic-collection';
import { authorizeCronRequest } from './cron-security';

export async function commercialAutomaticCollectionResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    const db = await import('@bunshin/database');
    const result = await collectCommercialInvoices(db.prisma);
    createLogger().info('commercial invoices automatic collection completed', {
      requestId,
      ...result,
    });
    return Response.json({ data: result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    createLogger().error('commercial invoice automatic collection failed', {
      requestId,
      status: mapped.status,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
