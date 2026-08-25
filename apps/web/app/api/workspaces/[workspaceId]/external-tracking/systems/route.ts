import { createExternalTrackingSystemResponse } from '../../../../../../src/http/external-tracking-links';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  return createExternalTrackingSystemResponse(request, (await context.params).workspaceId);
}
