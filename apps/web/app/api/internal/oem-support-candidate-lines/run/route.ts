import { oemSupportCandidateLineWorkerResponse } from '../../../../../src/http/oem-support-candidate-line-worker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return oemSupportCandidateLineWorkerResponse(request);
}
