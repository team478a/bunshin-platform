import {
  getServiceNotificationPreferenceResponse,
  updateServiceNotificationPreferenceResponse,
} from '../../../../../../src/http/service-notification-preference';

type Context = { params: Promise<{ serviceSlug: string; topic: string }> };

export async function GET(request: Request, context: Context) {
  const { serviceSlug, topic } = await context.params;
  return getServiceNotificationPreferenceResponse(request, serviceSlug, topic);
}

export async function PUT(request: Request, context: Context) {
  const { serviceSlug, topic } = await context.params;
  return updateServiceNotificationPreferenceResponse(request, serviceSlug, topic);
}
