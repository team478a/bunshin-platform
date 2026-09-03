import { cancelServiceLineBroadcastResponse } from '../../../../../../../src/http/service-line-broadcasts';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; broadcastId: string }> },
) {
  const { serviceSlug, broadcastId } = await context.params;
  return cancelServiceLineBroadcastResponse(request, serviceSlug, broadcastId);
}
