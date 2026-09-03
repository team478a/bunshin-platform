import { adjustServiceCreditsResponse } from '../../../../../src/http/service-credit-adjustments';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return adjustServiceCreditsResponse(request, (await params).serviceSlug);
}
