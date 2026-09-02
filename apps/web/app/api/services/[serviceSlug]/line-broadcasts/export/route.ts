import { exportServiceLineBroadcastsResponse } from '../../../../../../src/http/service-line-broadcasts';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  const { serviceSlug } = await context.params;
  return exportServiceLineBroadcastsResponse(request, serviceSlug);
}
