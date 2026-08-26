import { createGroupInvitationResponse } from '../../../../../../../src/http/group-invitations';

type Context = { params: Promise<{ workspaceId: string; groupId: string }> };

export async function POST(request: Request, context: Context) {
  const params = await context.params;
  return createGroupInvitationResponse(request, params.workspaceId, params.groupId);
}
