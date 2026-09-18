import { commercialUsageFinalizationResponse } from '../../../../../src/http/commercial-usage-finalization';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return commercialUsageFinalizationResponse(request);
}
