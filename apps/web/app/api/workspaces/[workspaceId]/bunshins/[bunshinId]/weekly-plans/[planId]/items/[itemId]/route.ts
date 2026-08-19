import {
  deleteWeeklyPlanItemResponse,
  updateWeeklyPlanItemResponse,
} from '../../../../../../../../../../src/http/weekly-plans';

type Context = {
  params: Promise<{
    workspaceId: string;
    bunshinId: string;
    planId: string;
    itemId: string;
  }>;
};

export async function PATCH(request: Request, context: Context) {
  const value = await context.params;
  return updateWeeklyPlanItemResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.planId,
    value.itemId,
  );
}

export async function DELETE(request: Request, context: Context) {
  const value = await context.params;
  return deleteWeeklyPlanItemResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.planId,
    value.itemId,
  );
}
