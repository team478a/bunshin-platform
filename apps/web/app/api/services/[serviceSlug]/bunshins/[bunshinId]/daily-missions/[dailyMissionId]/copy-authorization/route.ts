import { authorizeServiceDailyMissionCopyResponse } from '../../../../../../../../../src/http/service-daily-missions';

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ serviceSlug: string; bunshinId: string; dailyMissionId: string }>;
  },
) {
  const { serviceSlug, bunshinId, dailyMissionId } = await params;
  return authorizeServiceDailyMissionCopyResponse(request, serviceSlug, bunshinId, dailyMissionId);
}
