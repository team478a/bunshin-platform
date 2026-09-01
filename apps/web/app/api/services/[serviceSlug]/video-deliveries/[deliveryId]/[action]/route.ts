import { recordServiceVideoDeliveryActionResponse } from '../../../../../../../src/http/service-video-deliveries';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; deliveryId: string; action: string }> },
) {
  const value = await params;
  return recordServiceVideoDeliveryActionResponse(
    request,
    value.serviceSlug,
    value.deliveryId,
    value.action,
  );
}
