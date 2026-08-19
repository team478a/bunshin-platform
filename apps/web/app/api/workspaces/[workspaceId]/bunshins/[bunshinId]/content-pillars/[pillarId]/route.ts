import {
  deleteContentPillarResponse,
  getContentPillarResponse,
  updateContentPillarResponse,
} from '../../../../../../../../src/http/content-pillars';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string; pillarId: string }> };

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getContentPillarResponse(request, value.workspaceId, value.bunshinId, value.pillarId);
}
export async function PATCH(request: Request, context: Context) {
  const value = await context.params;
  return updateContentPillarResponse(request, value.workspaceId, value.bunshinId, value.pillarId);
}
export async function DELETE(request: Request, context: Context) {
  const value = await context.params;
  return deleteContentPillarResponse(request, value.workspaceId, value.bunshinId, value.pillarId);
}
