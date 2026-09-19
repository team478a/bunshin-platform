import { disableProgramProductResponse } from '../../../../../../src/http/program-products';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; offeringId: string }> },
) {
  const { serviceSlug, offeringId } = await params;
  return disableProgramProductResponse(request, serviceSlug, offeringId);
}
