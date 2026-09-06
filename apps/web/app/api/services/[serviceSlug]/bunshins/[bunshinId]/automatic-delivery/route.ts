import { updateServiceAutomaticDelivery } from '../../../../../../../src/http/service-automatic-delivery';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await params;
  return updateServiceAutomaticDelivery(request, serviceSlug, bunshinId);
}
