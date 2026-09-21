import { serviceRegistrationEmailWorkerResponse } from '../../../../../src/http/service-registration-email-worker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return serviceRegistrationEmailWorkerResponse(request);
}
