import {
  getGroupKnowledgeReviewResponse,
  updateGroupKnowledgeReviewResponse,
  updateGroupKnowledgeScopeResponse,
} from '../../../../../../../../src/http/group-knowledge';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; groupId: string; sourceId: string }> },
) {
  const { workspaceId, groupId, sourceId } = await context.params;
  return getGroupKnowledgeReviewResponse(request, workspaceId, groupId, sourceId);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; groupId: string; sourceId: string }> },
) {
  const { workspaceId, groupId, sourceId } = await context.params;
  return updateGroupKnowledgeScopeResponse(request, workspaceId, groupId, sourceId);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ workspaceId: string; groupId: string; sourceId: string }> },
) {
  const { workspaceId, groupId, sourceId } = await context.params;
  return updateGroupKnowledgeReviewResponse(request, workspaceId, groupId, sourceId);
}
