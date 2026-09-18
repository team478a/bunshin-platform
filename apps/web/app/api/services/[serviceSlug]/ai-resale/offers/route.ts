import { configureAiResaleOffersResponse } from '../../../../../../src/http/ai-resale-offer-admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  const { serviceSlug } = await params;
  return configureAiResaleOffersResponse(request, serviceSlug);
}
