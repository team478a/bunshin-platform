import { activateAiResalePaidEnrollmentResponse } from '../../../../../../src/http/ai-resale-offer-admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  const { serviceSlug } = await params;
  return activateAiResalePaidEnrollmentResponse(request, serviceSlug);
}
