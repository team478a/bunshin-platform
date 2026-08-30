import { createServiceResponse } from '../../../../src/http/services';

export async function POST(request: Request) {
  return createServiceResponse(request);
}
