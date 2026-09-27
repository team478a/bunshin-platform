import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { toApiError } from '@bunshin/shared';
import { runOemSupportCandidateEmailWorker } from '../services/oem-support-candidate-email-worker';
import { authorizeCronRequest } from './cron-security';

export async function oemSupportCandidateEmailWorkerResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    authorizeCronRequest(request, getServerEnvironment().CRON_SECRET);
    return Response.json({ data: await runOemSupportCandidateEmailWorker(), requestId });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, { status: mapped.status });
  }
}
