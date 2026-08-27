import { createVideoProjectResponse } from '../../../../../../../src/http/video-projects';

type Context = { params: Promise<{ workspaceId: string; groupId: string }> };

export async function POST(request: Request, context: Context) {
  const { workspaceId, groupId } = await context.params;
  return createVideoProjectResponse(request, workspaceId, groupId);
}
