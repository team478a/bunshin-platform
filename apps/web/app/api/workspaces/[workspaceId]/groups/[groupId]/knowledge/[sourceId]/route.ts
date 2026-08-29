import { getGroupKnowledgeReviewResponse } from '../../../../../../../../src/http/group-knowledge';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; groupId: string; sourceId: string }> },
) {
  const { workspaceId, groupId, sourceId } = await context.params;
  return getGroupKnowledgeReviewResponse(request, workspaceId, groupId, sourceId);
}
