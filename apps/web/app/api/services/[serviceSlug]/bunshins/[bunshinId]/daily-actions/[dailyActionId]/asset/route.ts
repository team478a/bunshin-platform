import { getServiceDailyActionAssetResponse } from '../../../../../../../../../src/http/daily-actions';

type Context = {
  params: Promise<{ serviceSlug: string; bunshinId: string; dailyActionId: string }>;
};
export async function GET(request: Request, { params }: Context) {
  const { serviceSlug, bunshinId, dailyActionId } = await params;
  return getServiceDailyActionAssetResponse(request, serviceSlug, bunshinId, dailyActionId);
}
