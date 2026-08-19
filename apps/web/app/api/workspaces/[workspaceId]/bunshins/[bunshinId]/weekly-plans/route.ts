import {
  createWeeklyPlanResponse,
  listWeeklyPlansResponse,
} from '../../../../../../../src/http/weekly-plans';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return listWeeklyPlansResponse(request, value.workspaceId, value.bunshinId);
}

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return createWeeklyPlanResponse(request, value.workspaceId, value.bunshinId);
}
