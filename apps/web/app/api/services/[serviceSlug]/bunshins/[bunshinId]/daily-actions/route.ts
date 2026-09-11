import {
  createServiceDailyActionResponse,
  listServiceDailyActionsResponse,
} from '../../../../../../../src/http/service-daily-actions';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return listServiceDailyActionsResponse(request, serviceSlug, bunshinId);
}

export async function POST(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return createServiceDailyActionResponse(request, serviceSlug, bunshinId);
}
