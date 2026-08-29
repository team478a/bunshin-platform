import { changeGroupKnowledgeStateResponse } from '../../../../../../../../../src/http/group-knowledge';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ workspaceId: string; groupId: string; sourceId: string; action: string }>;
  },
) {
  const { workspaceId, groupId, sourceId, action } = await context.params;
  if (action !== 'approve' && action !== 'archive' && action !== 'retry')
    return Response.json(
      { error: { code: 'NOT_FOUND', message: '操作が見つかりません' } },
      { status: 404 },
    );
  return changeGroupKnowledgeStateResponse(request, workspaceId, groupId, sourceId, action);
}
