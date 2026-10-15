import { optInServiceLineNotifications } from '../../../../../../src/http/service-line-notification-opt-in';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  const { serviceSlug } = await params;
  return optInServiceLineNotifications(request, serviceSlug);
}
