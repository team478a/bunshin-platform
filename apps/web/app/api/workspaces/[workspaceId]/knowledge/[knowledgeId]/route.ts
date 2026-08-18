import {
  getKnowledgeResponse,
  updateKnowledgeResponse,
} from '../../../../../../src/http/knowledge';
type Context = { params: Promise<{ workspaceId: string; knowledgeId: string }> };
export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return getKnowledgeResponse(request, value.workspaceId, value.knowledgeId);
}
export async function PATCH(request: Request, context: Context) {
  const value = await context.params;
  return updateKnowledgeResponse(request, value.workspaceId, value.knowledgeId);
}
