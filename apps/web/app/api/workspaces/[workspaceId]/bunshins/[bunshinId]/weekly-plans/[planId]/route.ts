import {
  getWeeklyPlanResponse,
  updateWeeklyPlanResponse,
} from '../../../../../../../../src/http/weekly-plans';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; planId: string }>;
};

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getWeeklyPlanResponse(request, value.workspaceId, value.bunshinId, value.planId);
}

export async function PATCH(request: Request, context: Context) {
  const value = await context.params;
  return updateWeeklyPlanResponse(request, value.workspaceId, value.bunshinId, value.planId);
}
