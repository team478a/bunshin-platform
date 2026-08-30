import {
  createServiceContentPillarResponse,
  listServiceContentPillarsResponse,
} from '../../../../../../../src/http/service-content-pillars';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return listServiceContentPillarsResponse(request, serviceSlug, bunshinId);
}

export async function POST(request: Request, context: Context) {
  const { serviceSlug, bunshinId } = await context.params;
  return createServiceContentPillarResponse(request, serviceSlug, bunshinId);
}
