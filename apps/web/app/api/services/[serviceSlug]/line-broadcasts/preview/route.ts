import { previewServiceLineBroadcastResponse } from '../../../../../../src/http/service-line-broadcasts';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return previewServiceLineBroadcastResponse(request, (await context.params).serviceSlug);
}
