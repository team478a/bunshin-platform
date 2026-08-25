import { upsertExternalTrackingIdentityResponse } from '../../../../../../src/http/external-tracking-links';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  return upsertExternalTrackingIdentityResponse(request, (await context.params).workspaceId);
}
