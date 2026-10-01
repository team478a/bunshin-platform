import { recordServiceSocialGoalOutcomeResponse } from '../../../../../../../../../src/http/service-daily-missions';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; bunshinId: string; dailyMissionId: string }>;
  },
) {
  const { serviceSlug, bunshinId, dailyMissionId } = await context.params;
  return recordServiceSocialGoalOutcomeResponse(request, serviceSlug, bunshinId, dailyMissionId);
}
