import { createKnowledgeResponse, listKnowledgeResponse } from '../../../../../src/http/knowledge';
type Context = { params: Promise<{ workspaceId: string }> };
export async function GET(request: Request, context: Context) {
  return listKnowledgeResponse(request, (await context.params).workspaceId);
}
export async function POST(request: Request, context: Context) {
  return createKnowledgeResponse(request, (await context.params).workspaceId);
}
