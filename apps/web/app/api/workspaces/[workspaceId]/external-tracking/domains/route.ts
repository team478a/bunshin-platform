import { createExternalTrackingDomainResponse } from '../../../../../../src/http/external-tracking-links';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  return createExternalTrackingDomainResponse(request, (await context.params).workspaceId);
}
