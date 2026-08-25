import { authorizeDailyMissionCopyResponse } from '../../../../../../../../../src/http/daily-missions';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; dailyMissionId: string }>;
};

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return authorizeDailyMissionCopyResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.dailyMissionId,
  );
}
