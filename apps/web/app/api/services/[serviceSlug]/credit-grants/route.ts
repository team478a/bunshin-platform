import { bulkGrantServiceCreditsResponse } from '../../../../../src/http/service-credit-adjustments';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return bulkGrantServiceCreditsResponse(request, (await params).serviceSlug);
}
