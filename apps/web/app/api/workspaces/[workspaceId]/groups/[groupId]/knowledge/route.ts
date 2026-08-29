import {
  createGroupKnowledgeResponse,
  listGroupKnowledgeResponse,
} from '../../../../../../../src/http/group-knowledge';

type Context = { params: Promise<{ workspaceId: string; groupId: string }> };

export async function GET(request: Request, context: Context) {
  const { workspaceId, groupId } = await context.params;
  return listGroupKnowledgeResponse(request, workspaceId, groupId);
}

export async function POST(request: Request, context: Context) {
  const { workspaceId, groupId } = await context.params;
  return createGroupKnowledgeResponse(request, workspaceId, groupId);
}
