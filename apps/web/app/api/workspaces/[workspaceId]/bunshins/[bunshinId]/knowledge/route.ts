import { listGrantedKnowledgeResponse } from '../../../../../../../src/http/knowledge';
type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export async function GET(request: Request, context: Context) {
  const value = await context.params;
  return listGrantedKnowledgeResponse(request, value.workspaceId, value.bunshinId);
}
