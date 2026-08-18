import { liveResponse } from '../../../../src/http/live';

export const dynamic = 'force-dynamic';
export function GET(request: Request): Response {
  return liveResponse(request);
}
