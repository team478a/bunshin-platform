import { listServiceDailyMissionsResponse } from '../../../../../../../src/http/service-daily-missions';

type Context = { params: Promise<{ serviceSlug: string; bunshinId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId } = await params;
  return listServiceDailyMissionsResponse(request, serviceSlug, bunshinId);
}
