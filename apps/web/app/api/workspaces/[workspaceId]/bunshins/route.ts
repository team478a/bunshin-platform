import { createBunshinResponse, listBunshinsResponse } from '../../../../../src/http/bunshins';

interface Context {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: Context) {
  return listBunshinsResponse(request, (await context.params).workspaceId);
}

export async function POST(request: Request, context: Context) {
  return createBunshinResponse(request, (await context.params).workspaceId);
}
