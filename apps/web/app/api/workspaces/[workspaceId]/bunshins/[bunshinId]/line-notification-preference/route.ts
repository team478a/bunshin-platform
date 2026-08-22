import {
  getLineNotificationPreferenceResponse,
  updateLineNotificationPreferenceResponse,
} from '../../../../../../../src/http/line-notification-preferences';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export async function GET(request: Request, context: Context) {
  const { workspaceId, bunshinId } = await context.params;
  return getLineNotificationPreferenceResponse(request, workspaceId, bunshinId);
}
export async function PUT(request: Request, context: Context) {
  const { workspaceId, bunshinId } = await context.params;
  return updateLineNotificationPreferenceResponse(request, workspaceId, bunshinId);
}
