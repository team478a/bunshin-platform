import { updateBadgeVisibilityResponse } from '../../../../../../../src/http/badge-user-experience';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; badgeAwardId: string }> },
) {
  const values = await params;
  return updateBadgeVisibilityResponse(request, values.workspaceId, values.badgeAwardId);
}
