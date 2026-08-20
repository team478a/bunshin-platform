import { generateWeeklyPlanResponse } from '../../../../../../../../src/http/weekly-plans';
type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return generateWeeklyPlanResponse(request, value.workspaceId, value.bunshinId);
}
