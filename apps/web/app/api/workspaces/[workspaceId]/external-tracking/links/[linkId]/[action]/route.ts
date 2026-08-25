import { transitionExternalTrackingLinkResponse } from '../../../../../../../../src/http/external-tracking-links';
import { ApplicationError, toApiError } from '@bunshin/shared';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; linkId: string; action: string }> },
) {
  const params = await context.params;
  if (params.action !== 'activate' && params.action !== 'suspend') {
    const mapped = toApiError(
      new ApplicationError('NOT_FOUND', 'action unavailable'),
      crypto.randomUUID(),
    );
    return Response.json(mapped.body, { status: mapped.status });
  }
  return transitionExternalTrackingLinkResponse(
    request,
    params.workspaceId,
    params.linkId,
    params.action,
  );
}
