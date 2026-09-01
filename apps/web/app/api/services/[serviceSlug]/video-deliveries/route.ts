import { assignServiceVideoDeliveryResponse } from '../../../../../src/http/service-video-deliveries';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return assignServiceVideoDeliveryResponse(request, (await params).serviceSlug);
}
