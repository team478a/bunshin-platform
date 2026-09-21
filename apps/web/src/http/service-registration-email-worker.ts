import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { runServiceRegistrationEmailWorker } from '../services/service-registration-email-worker';
import { authorizeCronRequest } from './cron-security';

export async function serviceRegistrationEmailWorkerResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    return Response.json({ data: await runServiceRegistrationEmailWorker(), requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
