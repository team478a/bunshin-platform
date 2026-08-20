import { getDailyMissionResponse } from '../../../../../../../../src/http/daily-missions';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyMissionId: string }>;
};

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getDailyMissionResponse(request, value.workspaceId, value.bunshinId, value.dailyMissionId);
}
