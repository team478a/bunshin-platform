import { archiveKnowledgeResponse } from '../../../../../../../src/http/knowledge';
type Context = { params: Promise<{ workspaceId: string; knowledgeId: string }> };
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return archiveKnowledgeResponse(request, value.workspaceId, value.knowledgeId);
}
