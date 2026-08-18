import { readyResponse } from '../../../../src/http/health';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return readyResponse(request);
}
