import { setMemoryActiveResponse } from '../../../../../../../../../src/http/memories';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string; memoryId: string }> },
) {
  const value = await context.params;
  return setMemoryActiveResponse(request, value.workspaceId, value.bunshinId, value.memoryId, true);
}
