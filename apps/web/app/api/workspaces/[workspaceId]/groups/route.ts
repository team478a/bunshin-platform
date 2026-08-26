import { createGroupResponse } from '../../../../../src/http/groups';

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Context) {
  return createGroupResponse(request, (await context.params).workspaceId);
}
