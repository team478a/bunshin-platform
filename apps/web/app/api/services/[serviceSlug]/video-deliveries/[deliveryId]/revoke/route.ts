import { revokeServiceVideoDeliveryResponse } from '../../../../../../../src/http/service-video-deliveries';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; deliveryId: string }> },
) {
  const value = await params;
  return revokeServiceVideoDeliveryResponse(request, value.serviceSlug, value.deliveryId);
}
