import {
  deleteMemoryResponse,
  getMemoryResponse,
  updateMemoryResponse,
} from '../../../../../../../../src/http/memories';

type Context = {
  params: Promise<{ workspaceId: string; bunshinId: string; memoryId: string }>;
};

export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getMemoryResponse(request, value.workspaceId, value.bunshinId, value.memoryId);
}

export async function PATCH(request: Request, context: Context) {
  const value = await context.params;
  return updateMemoryResponse(request, value.workspaceId, value.bunshinId, value.memoryId);
}

export async function DELETE(request: Request, context: Context) {
  const value = await context.params;
  return deleteMemoryResponse(request, value.workspaceId, value.bunshinId, value.memoryId);
}
