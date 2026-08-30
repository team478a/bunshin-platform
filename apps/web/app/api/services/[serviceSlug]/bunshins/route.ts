import {
  createServiceBunshinResponse,
  listServiceBunshinsResponse,
} from '../../../../../src/http/service-bunshins';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ serviceSlug: string }> }) {
  return listServiceBunshinsResponse(request, (await context.params).serviceSlug);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string }> },
) {
  return createServiceBunshinResponse(request, (await context.params).serviceSlug);
}
