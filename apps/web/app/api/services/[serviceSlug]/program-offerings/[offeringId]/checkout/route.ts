import { createDirectProgramCheckoutResponse } from '../../../../../../../src/http/program-checkout';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; offeringId: string }> },
) {
  const { serviceSlug, offeringId } = await params;
  return createDirectProgramCheckoutResponse(request, serviceSlug, offeringId);
}
