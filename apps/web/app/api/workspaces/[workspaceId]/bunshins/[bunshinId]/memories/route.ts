import { createMemoryResponse, listMemoriesResponse } from '../../../../../../../src/http/memories';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return listMemoriesResponse(request, value.workspaceId, value.bunshinId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return createMemoryResponse(request, value.workspaceId, value.bunshinId);
}
