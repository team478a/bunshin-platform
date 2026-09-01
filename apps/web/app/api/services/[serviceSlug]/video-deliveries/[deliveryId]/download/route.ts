import { downloadServiceVideoDeliveryResponse } from '../../../../../../../src/http/service-video-deliveries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serviceSlug: string; deliveryId: string }> },
) {
  const value = await params;
  return downloadServiceVideoDeliveryResponse(value.serviceSlug, value.deliveryId);
}
