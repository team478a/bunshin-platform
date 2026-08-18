import { archiveBunshinResponse } from '../../../../../../../src/http/bunshins';

interface Context {
  params: Promise<{ workspaceId: string; bunshinId: string }>;
}

export async function POST(request: Request, context: Context) {
  const { workspaceId, bunshinId } = await context.params;
  return archiveBunshinResponse(request, workspaceId, bunshinId);
}
