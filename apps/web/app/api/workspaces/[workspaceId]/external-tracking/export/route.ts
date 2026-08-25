import { exportExternalTrackingResponse } from '../../../../../../src/http/external-tracking-links';

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  return exportExternalTrackingResponse(request, (await context.params).workspaceId);
}
