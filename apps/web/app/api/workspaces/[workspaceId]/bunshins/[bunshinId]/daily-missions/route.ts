import {
  createDailyMissionResponse,
  listDailyMissionsResponse,
} from '../../../../../../../src/http/daily-missions';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return listDailyMissionsResponse(request, value.workspaceId, value.bunshinId);
}

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return createDailyMissionResponse(request, value.workspaceId, value.bunshinId);
}
