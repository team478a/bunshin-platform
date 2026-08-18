import { getBunshinResponse, updateBunshinResponse } from '../../../../../../src/http/bunshins';

interface Context {
  params: Promise<{ workspaceId: string; bunshinId: string }>;
}

export async function GET(request: Request, context: Context) {
  const { workspaceId, bunshinId } = await context.params;
  return getBunshinResponse(request, workspaceId, bunshinId);
}

export async function PATCH(request: Request, context: Context) {
  const { workspaceId, bunshinId } = await context.params;
  return updateBunshinResponse(request, workspaceId, bunshinId);
}
