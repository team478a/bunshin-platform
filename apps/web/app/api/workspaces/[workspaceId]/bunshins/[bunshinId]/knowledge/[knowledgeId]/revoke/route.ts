import { revokeKnowledgeResponse } from '../../../../../../../../../src/http/knowledge';
type Context = { params: Promise<{ workspaceId: string; bunshinId: string; knowledgeId: string }> };
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return revokeKnowledgeResponse(request, value.workspaceId, value.bunshinId, value.knowledgeId);
}
