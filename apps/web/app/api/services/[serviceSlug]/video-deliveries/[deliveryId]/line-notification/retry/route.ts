import { retryServiceVideoDeliveryNotificationResponse } from '../../../../../../../../src/http/service-video-deliveries';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; deliveryId: string }> },
) {
  const value = await params;
  return retryServiceVideoDeliveryNotificationResponse(
    request,
    value.serviceSlug,
    value.deliveryId,
  );
}
