import {
  listServiceLineBroadcastsResponse,
  sendServiceLineBroadcastResponse,
} from '../../../../../src/http/service-line-broadcasts';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  const { serviceSlug } = await context.params;
  return listServiceLineBroadcastsResponse(request, serviceSlug);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  const { serviceSlug } = await context.params;
  return sendServiceLineBroadcastResponse(request, serviceSlug);
}
