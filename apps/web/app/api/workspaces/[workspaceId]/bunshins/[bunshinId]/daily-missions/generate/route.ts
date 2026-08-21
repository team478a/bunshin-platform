import { generateDailyMissionResponse } from '../../../../../../../../src/http/daily-missions';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function POST(request: Request, context: Context) {
  const { workspaceId, bunshinId } = await context.params;
  return generateDailyMissionResponse(request, workspaceId, bunshinId);
}
