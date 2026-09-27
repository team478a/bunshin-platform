import { oemSupportCandidateEmailWorkerResponse } from '../../../../../src/http/oem-support-candidate-email-worker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return oemSupportCandidateEmailWorkerResponse(request);
}
