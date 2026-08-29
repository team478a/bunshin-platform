import { markBadgeNotificationReadResponse } from '../../../../../../../src/http/badge-user-experience';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; notificationId: string }> },
) {
  const values = await params;
  return markBadgeNotificationReadResponse(request, values.workspaceId, values.notificationId);
}
