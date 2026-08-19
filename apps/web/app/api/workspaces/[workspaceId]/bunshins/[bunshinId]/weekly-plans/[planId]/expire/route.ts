import { setWeeklyPlanStatusResponse } from '../../../../../../../../../src/http/weekly-plans';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; planId: string }>;
};

export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return setWeeklyPlanStatusResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.planId,
    'expire',
  );
}
