import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger, requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { runCommercialBillingReminders } from '../services/commercial-billing-reminder-scheduler';
import { authorizeCronRequest } from './cron-security';

export async function commercialBillingRemindersResponse(request: Request): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    const result = await runCommercialBillingReminders();
    createLogger().info('commercial billing reminders processed', { requestId, ...result });
    return Response.json({ data: result, requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    createLogger().error('commercial billing reminders failed', {
      requestId,
      status: mapped.status,
      errorCode: mapped.body.error.code,
    });
    return Response.json(mapped.body, { status: mapped.status });
  }
}
