import { updateExternalTrackingLinkResponse } from '../../../../../../../src/http/external-tracking-links';
export const runtime = 'nodejs';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; linkId: string }> },
) {
  const params = await context.params;
  return updateExternalTrackingLinkResponse(request, params.workspaceId, params.linkId);
}
