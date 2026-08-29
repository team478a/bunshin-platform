import { completeGroupKnowledgeUploadResponse } from '../../../../../../../../../src/http/group-knowledge';

type Context = {
  params: Promise<{ workspaceId: string; groupId: string; sourceId: string }>;
};

export async function POST(request: Request, context: Context) {
  const { workspaceId, groupId, sourceId } = await context.params;
  return completeGroupKnowledgeUploadResponse(request, workspaceId, groupId, sourceId);
}
